import type { Firestore, Transaction } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  assertProductSellable,
  loadSaleProductAdmin,
  resolveModifierSelectionsAdmin,
} from "@/lib/server/tpv/load-tpv-catalog-admin";
import {
  buildAuthoritativeSaleLine,
  computeAuthoritativeOrderTotal,
} from "@/lib/server/tpv/build-authoritative-sale-line";
import {
  applyKdsLineStatusTransition,
  applyLineCancellation,
  isAllowedKdsLineStatusTransition,
} from "@/lib/server/tpv/line-status-transitions";
import {
  assertNoDuplicateLineIds,
  splitLineQuantityForKdsTransition,
} from "@/lib/server/tpv/line-quantity-split";
import {
  idempotencyDocRef as idemRef,
  buildIdempotencyPayload,
  buildIdempotencyResultWithInventoryWarnings,
  readIdempotencyHit,
  readInventoryWarningsFromIdempotencyResult,
  sortInventoryWarningsStable,
  stablePayloadHash,
  writeIdempotencyRecord,
} from "@/lib/server/tpv/tpv-idempotency";
import { deriveStableSplitLineId } from "@/lib/server/tpv/handle-merge-table-group-orders";
import {
  applyProjectionWritePlan,
  DuplicateOrderItemLineError,
  indexLoadedOrderItems,
  loadOrderItemsForOrderInTransaction,
  orderProjectionMetaFromOrder,
  planOrderProjectionWrites,
  readOrderSnapData,
  readOrderUpdatedAtMs,
} from "@/lib/server/tpv/order-projection";
import type {
  CancelLinesIntent,
  CreateOpenOrderIntent,
  SaleLineIntent,
  TransitionLineQuantityIntent,
  TransitionLineStatusIntent,
  UpsertSaleLinesIntent,
} from "@/lib/server/tpv/tpv-mutation-dtos";
import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";
import { isActiveOrderStatus } from "@/lib/server/tpv/table-group-order-utils";
import { loadTableOrdersInTransaction } from "@/lib/server/tpv/table-occupancy-server";
import {
  applyInitialModifierStockConsumptionInTransaction,
  type ModifierStockConsumptionPlan,
} from "@/lib/server/tpv/plan-initial-modifier-stock-consumption";
import type { ModifierStockConsumptionWarning } from "@/lib/inventory/stock-movement-types";

export type TpvMutationError = { status: number; error: string; details?: string };

export type CreateOpenOrderResult = {
  orderId: string;
  total: number;
  inventoryWarnings: ModifierStockConsumptionWarning[];
};

export type UpsertSaleLinesResult = {
  orderId: string;
  total: number;
  items: Record<string, unknown>[];
  inventoryWarnings: ModifierStockConsumptionWarning[];
};

export type TransitionLineStatusResult = {
  orderId: string;
  lineId: string;
  status: string;
  inventoryWarnings: ModifierStockConsumptionWarning[];
};

export type TransitionLineQuantityResult = {
  orderId: string;
  lineId: string;
  advancedLineId: string;
  status: string;
  inventoryWarnings: ModifierStockConsumptionWarning[];
};

function createOpenResultFromIdempotencyHit(hit: Record<string, unknown>): CreateOpenOrderResult {
  return {
    orderId: String(hit.orderId),
    total: Number(hit.total) || 0,
    inventoryWarnings: readInventoryWarningsFromIdempotencyResult(hit),
  };
}

function upsertSaleLinesResultFromIdempotencyHit(hit: Record<string, unknown>): UpsertSaleLinesResult {
  return {
    orderId: String(hit.orderId),
    total: Number(hit.total) || 0,
    items: Array.isArray(hit.items) ? (hit.items as Record<string, unknown>[]) : [],
    inventoryWarnings: readInventoryWarningsFromIdempotencyResult(hit),
  };
}

function transitionLineStatusResultFromIdempotencyHit(
  hit: Record<string, unknown>,
  orderId: string,
  lineId: string,
  fallbackStatus: string,
): TransitionLineStatusResult {
  return {
    orderId,
    lineId,
    status: String(hit.status ?? fallbackStatus),
    inventoryWarnings: readInventoryWarningsFromIdempotencyResult(hit),
  };
}

function transitionLineQuantityResultFromIdempotencyHit(
  hit: Record<string, unknown>,
  orderId: string,
  lineId: string,
  fallbackStatus: string,
): TransitionLineQuantityResult {
  return {
    orderId,
    lineId,
    advancedLineId: String(hit.advancedLineId),
    status: String(hit.status ?? fallbackStatus),
    inventoryWarnings: readInventoryWarningsFromIdempotencyResult(hit),
  };
}

export function requireTpvCapability(
  ctx: AuthenticatedRestaurantContext,
  capability: "tpv.sell" | "tpv.cancel_line" | "kds.manage",
): TpvMutationError | null {
  if (!serverRoleHasCapability(ctx.role, capability)) {
    const code =
      capability === "tpv.cancel_line"
        ? "TPV_CANCEL_REQUIRED"
        : capability === "kds.manage"
          ? "KDS_MANAGE_REQUIRED"
          : "TPV_SELL_REQUIRED";
    return { status: 403, error: code };
  }
  return null;
}

async function applyModifierStockForItemTransition(
  tx: Transaction,
  ctx: AuthenticatedRestaurantContext,
  orderId: string,
  beforeItems: readonly Record<string, unknown>[],
  afterItems: readonly Record<string, unknown>[],
  nowMs: number,
): Promise<ModifierStockConsumptionPlan> {
  return applyInitialModifierStockConsumptionInTransaction({
    tx,
    db: ctx.db,
    restaurantId: ctx.restaurantId,
    orderId,
    actorUid: ctx.uid,
    beforeItems,
    afterItems,
    nowMs,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function existingItemsArray(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord);
}

function indexItemsByLineId(items: readonly Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (id) map.set(id, item);
  }
  return map;
}

function assertExpectedVersion(
  orderData: Record<string, unknown>,
  expected?: number,
): TpvMutationError | null {
  if (expected == null) return null;
  const current = readOrderUpdatedAtMs(orderData);
  if (current != null && current !== expected) {
    return { status: 409, error: "VERSION_CONFLICT" };
  }
  return null;
}

async function preloadCatalogForIntents(
  db: Firestore,
  restaurantId: string,
  intents: readonly SaleLineIntent[],
  existingById: Map<string, Record<string, unknown>>,
  defaultStatus: "pending" | "sent",
): Promise<Record<string, unknown>[] | TpvMutationError> {
  const built: Record<string, unknown>[] = [];
  for (const intent of intents) {
    const existing = existingById.get(intent.lineId);
    if (existing) {
      const st = normalizeProductionLineStatus(existing.status);
      if (st !== "pending") {
        built.push({ ...existing });
        continue;
      }
    }
    const product = await loadSaleProductAdmin(db, restaurantId, intent.productId);
    if (!product) return { status: 400, error: "PRODUCT_NOT_FOUND" };
    const sellableErr = assertProductSellable(product);
    if (sellableErr) return { status: 400, error: sellableErr };
    const modifiersResult = await resolveModifierSelectionsAdmin(
      db,
      restaurantId,
      product,
      intent.selectedModifiers ?? [],
    );
    if ("error" in modifiersResult) return { status: 400, error: modifiersResult.error };
    built.push(
      buildAuthoritativeSaleLine({
        intent,
        product,
        modifiers: modifiersResult,
        existing,
        defaultStatus: existing ? undefined : defaultStatus,
      }),
    );
  }
  return built;
}

function mergeUpsertedLines(
  existingItems: readonly Record<string, unknown>[],
  upserted: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const byId = indexItemsByLineId(existingItems);
  for (const line of upserted) {
    const id = typeof line.id === "string" ? line.id.trim() : "";
    if (!id) continue;
    const existing = byId.get(id);
    if (existing) {
      const existingSt = normalizeProductionLineStatus(existing.status);
      if (existingSt !== "pending") {
        throw new Error(`LINE_STATE_CONFLICT:${id}`);
      }
    }
    byId.set(id, line);
  }
  return [...byId.values()];
}

async function validateTableForOrder(
  db: Firestore,
  restaurantId: string,
  tableId: string,
): Promise<TpvMutationError | null> {
  const ref = db.collection("tables").doc(tableId);
  const snap = await ref.get();
  if (!snap.exists) return { status: 404, error: "TABLE_NOT_FOUND" };
  const data = snap.data() as Record<string, unknown>;
  if (String(data.restaurantId ?? "") !== restaurantId) return { status: 403, error: "TABLE_TENANT_MISMATCH" };
  return null;
}

function readAssignedOperatorId(data: Record<string, unknown>): string {
  return typeof data.assignedOperatorId === "string" ? data.assignedOperatorId.trim() : "";
}

function buildTableOperatorAssignmentAdminFields(
  operator:
    | Pick<{ assignedOperatorId: string; assignedOperatorName: string }, "assignedOperatorId" | "assignedOperatorName">
    | null
    | undefined,
): Record<string, unknown> {
  const operatorId = operator?.assignedOperatorId?.trim() ?? "";
  const operatorName = operator?.assignedOperatorName?.trim() ?? "";
  if (!operatorId || !operatorName) return {};
  return {
    assignedOperatorId: operatorId,
    assignedOperatorName: operatorName,
    assignedAt: FieldValue.serverTimestamp(),
  };
}

function buildTableOperatorAssignmentUpdatePayload(
  operatorId: string,
  operatorName: string,
): Record<string, unknown> {
  return {
    assignedOperatorId: operatorId,
    assignedOperatorName: operatorName,
    assignedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function assertOperatorAssignable(data: Record<string, unknown>, operatorId: string): void {
  const existing = readAssignedOperatorId(data);
  if (existing && existing !== operatorId) {
    throw new Error("OPERATOR_ALREADY_ASSIGNED");
  }
}

function listActiveOrdersForTable(
  orders: readonly { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }[],
): { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }[] {
  return orders.filter(({ data }) => isActiveOrderStatus(data.status));
}

export type AssignTableOperatorIntent = {
  tableId: string;
  orderId?: string;
  assignedOperatorId: string;
  assignedOperatorName: string;
};

export async function handleAssignTableOperator(
  ctx: AuthenticatedRestaurantContext,
  intent: AssignTableOperatorIntent,
): Promise<{ assigned: boolean; tableId: string; orderId?: string } | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const tableId = intent.tableId.trim();
  const operatorId = intent.assignedOperatorId.trim();
  const operatorName = intent.assignedOperatorName.trim();
  if (!tableId) return { status: 400, error: "TABLE_ID_REQUIRED" };
  if (!operatorId || !operatorName) return { status: 400, error: "OPERATOR_REQUIRED" };

  const tableRef = ctx.db.collection("tables").doc(tableId);
  const explicitOrderId = intent.orderId?.trim() ?? "";

  try {
    const txResult = await ctx.db.runTransaction(async (tx) => {
      let resolvedOrderId = explicitOrderId;
      let assigned = false;

      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists) throw new Error("TABLE_NOT_FOUND");
      const tableData = tableSnap.data() as Record<string, unknown>;
      if (String(tableData.restaurantId ?? "") !== ctx.restaurantId) {
        throw new Error("TABLE_TENANT_MISMATCH");
      }
      assertOperatorAssignable(tableData, operatorId);

      let orderRef: FirebaseFirestore.DocumentReference | null = null;
      let orderData: Record<string, unknown> | null = null;

      if (explicitOrderId) {
        orderRef = ctx.db.collection("orders").doc(explicitOrderId);
        const orderSnap = await tx.get(orderRef);
        orderData = readOrderSnapData(orderSnap);
        if (!orderData) throw new Error("ORDER_NOT_FOUND");
        if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) {
          throw new Error("TENANT_MISMATCH");
        }
        if (String(orderData.tableId ?? "").trim() !== tableId) {
          throw new Error("ORDER_TABLE_MISMATCH");
        }
        if (!isActiveOrderStatus(orderData.status)) {
          throw new Error("ORDER_NOT_ACTIVE");
        }
      } else {
        resolvedOrderId = "";
        const tableOrders = await loadTableOrdersInTransaction(tx, ctx.db, ctx.restaurantId, tableId);
        const activeOrders = listActiveOrdersForTable(tableOrders);
        if (activeOrders.length > 1) throw new Error("MULTIPLE_ACTIVE_ORDERS");
        if (activeOrders.length === 1) {
          orderRef = activeOrders[0]!.ref;
          orderData = activeOrders[0]!.data;
          resolvedOrderId = activeOrders[0]!.ref.id;
        }
      }

      if (orderData) {
        assertOperatorAssignable(orderData, operatorId);
      }

      const payload = buildTableOperatorAssignmentUpdatePayload(operatorId, operatorName);

      if (!readAssignedOperatorId(tableData)) {
        tx.update(tableRef, payload);
        assigned = true;
      }

      if (orderRef && orderData && !readAssignedOperatorId(orderData)) {
        tx.update(orderRef, payload);
        assigned = true;
      }

      return { assigned, resolvedOrderId };
    });

    return {
      assigned: txResult.assigned,
      tableId,
      ...(txResult.resolvedOrderId ? { orderId: txResult.resolvedOrderId } : {}),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "TABLE_NOT_FOUND") return { status: 404, error: "TABLE_NOT_FOUND" };
    if (msg === "TABLE_TENANT_MISMATCH") return { status: 403, error: "TABLE_TENANT_MISMATCH" };
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "ORDER_TABLE_MISMATCH") return { status: 400, error: "ORDER_TABLE_MISMATCH" };
    if (msg === "ORDER_NOT_ACTIVE") return { status: 400, error: "ORDER_NOT_ACTIVE" };
    if (msg === "MULTIPLE_ACTIVE_ORDERS") {
      return { status: 409, error: "MULTIPLE_ACTIVE_ORDERS" };
    }
    if (msg === "OPERATOR_ALREADY_ASSIGNED") {
      return { status: 409, error: "OPERATOR_ALREADY_ASSIGNED" };
    }
    throw e;
  }
}

export async function handleCreateOpenOrder(
  ctx: AuthenticatedRestaurantContext,
  intent: CreateOpenOrderIntent,
): Promise<CreateOpenOrderResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const tableId = intent.tableId.trim();
  if (!tableId) return { status: 400, error: "TABLE_ID_REQUIRED" };

  const tableErr = await validateTableForOrder(ctx.db, ctx.restaurantId, tableId);
  if (tableErr) return tableErr;

  const idemKey = intent.idempotencyKey?.trim();
  const payloadHash = stablePayloadHash({
    tableId,
    lines: intent.lines,
    markSent: intent.markSent === true,
  });

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idemRef(ctx.db, ctx.restaurantId, idemKey).get(),
      "create_open_order",
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.orderId) {
      return createOpenResultFromIdempotencyHit(hit);
    }
  }

  const built = await preloadCatalogForIntents(
    ctx.db,
    ctx.restaurantId,
    intent.lines,
    new Map(),
    intent.markSent ? "sent" : "pending",
  );
  if (!Array.isArray(built)) return built;

  const dupErr = assertNoDuplicateLineIds(built);
  if (dupErr) return { status: 400, error: dupErr };

  const nowMs = Date.now();
  if (intent.markSent) {
    for (const line of built) {
      if (normalizeProductionLineStatus(line.status) === "sent") line.sentAt = nowMs;
    }
  }

  const total = computeAuthoritativeOrderTotal(built);
  const orderRef = ctx.db.collection("orders").doc();
  let inventoryWarnings: ModifierStockConsumptionWarning[] = [];
  let rehydratedResult: CreateOpenOrderResult | null = null;

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idemRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, "create_open_order", payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.orderId) {
          rehydratedResult = createOpenResultFromIdempotencyHit(hit);
          throw new Error("IDEM_OK");
        }
      }

      const tableSnap = await tx.get(ctx.db.collection("tables").doc(tableId));
      if (!tableSnap.exists) throw new Error("TABLE_NOT_FOUND");
      const tableData = tableSnap.data() as Record<string, unknown>;
      if (String(tableData.restaurantId ?? "") !== ctx.restaurantId) {
        throw new Error("TABLE_TENANT_MISMATCH");
      }

      const loaded = { byLineId: new Map(), byDocId: new Map(), allRefs: [] };
      const meta = orderProjectionMetaFromOrder(
        orderRef.id,
        { tableId, table: intent.tableLabel?.trim() || tableId },
        ctx.restaurantId,
      );
      const plan = planOrderProjectionWrites(ctx.db, meta, built, loaded, nowMs);
      const inventoryPlan = await applyModifierStockForItemTransition(
        tx,
        ctx,
        orderRef.id,
        [],
        plan.itemsWithDocIds,
        nowMs,
      );
      inventoryWarnings = inventoryPlan.warnings;

      tx.set(orderRef, {
        restaurantId: ctx.restaurantId,
        tableId,
        table: intent.tableLabel?.trim() || tableId,
        status: intent.markSent ? "sent" : "open",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        items: plan.itemsWithDocIds,
        total,
        ...buildTableOperatorAssignmentAdminFields(intent.operatorAssignment ?? null),
      });
      applyProjectionWritePlan(tx, plan);

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idemRef(ctx.db, ctx.restaurantId, idemKey),
          "create_open_order",
          payloadHash,
          buildIdempotencyResultWithInventoryWarnings(
            {
              orderId: orderRef.id,
              total,
            },
            inventoryPlan.warnings,
          ),
        );
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "IDEM_OK" && rehydratedResult) return rehydratedResult;
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "TABLE_NOT_FOUND") return { status: 404, error: "TABLE_NOT_FOUND" };
    if (msg === "TABLE_TENANT_MISMATCH") return { status: 403, error: "TABLE_TENANT_MISMATCH" };
    if (msg === "STOCK_MOVEMENT_ID_CONFLICT") return { status: 409, error: "STOCK_MOVEMENT_ID_CONFLICT" };
    throw e;
  }

  return {
    orderId: orderRef.id,
    total,
    inventoryWarnings: sortInventoryWarningsStable(inventoryWarnings),
  };
}

export async function handleUpsertSaleLines(
  ctx: AuthenticatedRestaurantContext,
  intent: UpsertSaleLinesIntent,
): Promise<UpsertSaleLinesResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const orderId = intent.orderId.trim();
  if (!orderId) return { status: 400, error: "ORDER_ID_REQUIRED" };

  const orderRef = ctx.db.collection("orders").doc(orderId);
  const idemKey = intent.idempotencyKey?.trim();
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, "upsert_sale_lines", {
      orderId,
      lines: intent.lines,
      markSent: intent.markSent === true,
    }),
  );

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idemRef(ctx.db, ctx.restaurantId, idemKey).get(),
      "upsert_sale_lines",
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.orderId) {
      return upsertSaleLinesResultFromIdempotencyHit(hit);
    }
  }

  const preSnap = await orderRef.get();
  if (!preSnap.exists) return { status: 404, error: "ORDER_NOT_FOUND" };
  const preData = preSnap.data() as Record<string, unknown>;
  if (String(preData.restaurantId ?? "") !== ctx.restaurantId) {
    return { status: 403, error: "TENANT_MISMATCH" };
  }

  const existingItems = existingItemsArray(preData.items);
  const existingById = indexItemsByLineId(existingItems);

  const built = await preloadCatalogForIntents(
    ctx.db,
    ctx.restaurantId,
    intent.lines,
    existingById,
    intent.markSent ? "sent" : "pending",
  );
  if (!Array.isArray(built)) return built;

  const nowMs = Date.now();
  let resultItems: Record<string, unknown>[] = [];
  let total = 0;
  let inventoryWarnings: ModifierStockConsumptionWarning[] = [];
  let rehydratedResult: UpsertSaleLinesResult | null = null;

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idemRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, "upsert_sale_lines", payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.orderId) {
          rehydratedResult = upsertSaleLinesResultFromIdempotencyHit(hit);
          throw new Error("IDEM_OK");
        }
      }

      const orderSnap = await tx.get(orderRef);
      const orderData = readOrderSnapData(orderSnap);
      if (!orderData) throw new Error("ORDER_NOT_FOUND");
      if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TENANT_MISMATCH");
      const verErr = assertExpectedVersion(orderData, intent.expectedUpdatedAtMs);
      if (verErr) throw new Error(verErr.error);

      const txExistingItems = existingItemsArray(orderData.items);
      const beforeItemsForStock = txExistingItems.map((line) => ({ ...line }));
      let merged = mergeUpsertedLines(txExistingItems, built);

      if (intent.markSent) {
        merged = merged.map((line) => {
          const st = normalizeProductionLineStatus(line.status);
          if (st !== "pending") return line;
          if (!intent.lines.some((l) => l.lineId === line.id)) return line;
          return applyKdsLineStatusTransition(line, "sent", nowMs);
        });
      }

      const dupErr = assertNoDuplicateLineIds(merged);
      if (dupErr) throw new Error(dupErr);

      const orderItemsSnap = await loadOrderItemsForOrderInTransaction(
        tx,
        ctx.db,
        ctx.restaurantId,
        orderId,
      );
      const loaded = indexLoadedOrderItems(orderItemsSnap);
      const meta = orderProjectionMetaFromOrder(orderId, orderData, ctx.restaurantId);
      const plan = planOrderProjectionWrites(ctx.db, meta, merged, loaded, nowMs);
      const inventoryPlan = await applyModifierStockForItemTransition(
        tx,
        ctx,
        orderId,
        beforeItemsForStock,
        plan.itemsWithDocIds,
        nowMs,
      );
      inventoryWarnings = inventoryPlan.warnings;
      resultItems = plan.itemsWithDocIds;
      total = computeAuthoritativeOrderTotal(plan.itemsWithDocIds);

      const updatePayload: Record<string, unknown> = {
        items: plan.itemsWithDocIds,
        total,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (intent.markSent && String(orderData.status ?? "") === "open") {
        updatePayload.status = "sent";
        updatePayload.sentAt = nowMs;
      }
      tx.update(orderRef, updatePayload);
      applyProjectionWritePlan(tx, plan);

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idemRef(ctx.db, ctx.restaurantId, idemKey),
          "upsert_sale_lines",
          payloadHash,
          buildIdempotencyResultWithInventoryWarnings(
            {
              orderId,
              total,
              items: plan.itemsWithDocIds,
            },
            inventoryPlan.warnings,
          ),
        );
      }
    });
  } catch (e) {
    if (e instanceof DuplicateOrderItemLineError) {
      return { status: 409, error: e.code, details: e.lineId };
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg === "IDEM_OK" && rehydratedResult) return rehydratedResult;
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    if (msg === "DUPLICATE_LINE_ID") return { status: 400, error: msg };
    if (msg.startsWith("LINE_STATE_CONFLICT:")) {
      const conflictLineId = msg.slice("LINE_STATE_CONFLICT:".length).trim();
      return {
        status: 409,
        error: "LINE_STATE_CONFLICT",
        details: conflictLineId
          ? `${conflictLineId}|reason=non_pending_upsert`
          : "reason=non_pending_upsert",
      };
    }
    if (msg === "STOCK_MOVEMENT_ID_CONFLICT") return { status: 409, error: "STOCK_MOVEMENT_ID_CONFLICT" };
    throw e;
  }

  return {
    orderId,
    total,
    items: resultItems,
    inventoryWarnings: sortInventoryWarningsStable(inventoryWarnings),
  };
}

export async function handleCancelLines(
  ctx: AuthenticatedRestaurantContext,
  intent: CancelLinesIntent,
): Promise<{ orderId: string; total: number; cancelledLineIds: string[] } | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.cancel_line");
  if (capErr) return capErr;

  const orderId = intent.orderId.trim();
  if (!orderId) return { status: 400, error: "ORDER_ID_REQUIRED" };
  if (intent.lineIds.length === 0) return { status: 400, error: "LINE_IDS_REQUIRED" };

  const uniqueIds = [...new Set(intent.lineIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length !== intent.lineIds.length) return { status: 400, error: "DUPLICATE_LINE_ID" };

  const orderRef = ctx.db.collection("orders").doc(orderId);
  const nowMs = Date.now();
  let cancelledLineIds: string[] = [];
  let total = 0;

  try {
    await ctx.db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      const orderData = readOrderSnapData(orderSnap);
      if (!orderData) throw new Error("ORDER_NOT_FOUND");
      if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TENANT_MISMATCH");
      const verErr = assertExpectedVersion(orderData, intent.expectedUpdatedAtMs);
      if (verErr) throw new Error(verErr.error);

      const existingItems = existingItemsArray(orderData.items);
      const byId = indexItemsByLineId(existingItems);
      cancelledLineIds = [];

      for (const lineId of uniqueIds) {
        const line = byId.get(lineId);
        if (!line) throw new Error(`LINE_NOT_FOUND:${lineId}`);
        const st = normalizeProductionLineStatus(line.status);
        if (st === "cancelled") {
          cancelledLineIds.push(lineId);
          continue;
        }
        if (st === "pending") throw new Error(`LINE_NOT_CANCELABLE:${lineId}`);
        byId.set(lineId, applyLineCancellation(line, nowMs));
        cancelledLineIds.push(lineId);
      }

      const merged = [...byId.values()];
      const dupErr = assertNoDuplicateLineIds(merged);
      if (dupErr) throw new Error(dupErr);

      const prevCancelled = Array.isArray(orderData.cancelledLineIds)
        ? (orderData.cancelledLineIds as unknown[]).filter((id): id is string => typeof id === "string")
        : [];
      const allCancelled = [...new Set([...prevCancelled, ...cancelledLineIds])];

      const orderItemsSnap = await loadOrderItemsForOrderInTransaction(
        tx,
        ctx.db,
        ctx.restaurantId,
        orderId,
      );
      const loaded = indexLoadedOrderItems(orderItemsSnap);
      const meta = orderProjectionMetaFromOrder(orderId, orderData, ctx.restaurantId);
      const plan = planOrderProjectionWrites(ctx.db, meta, merged, loaded, nowMs);
      total = computeAuthoritativeOrderTotal(plan.itemsWithDocIds);

      tx.update(orderRef, {
        items: plan.itemsWithDocIds,
        total,
        cancelledLineIds: allCancelled,
        updatedAt: FieldValue.serverTimestamp(),
      });
      applyProjectionWritePlan(tx, plan);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    if (msg.startsWith("LINE_NOT_FOUND:")) return { status: 400, error: "LINE_NOT_FOUND", details: msg.split(":")[1] };
    if (msg.startsWith("LINE_NOT_CANCELABLE:")) {
      return { status: 400, error: "LINE_NOT_CANCELABLE", details: msg.split(":")[1] };
    }
    throw e;
  }

  return { orderId, total, cancelledLineIds };
}

export async function handleTransitionLineStatus(
  ctx: AuthenticatedRestaurantContext,
  intent: TransitionLineStatusIntent,
): Promise<TransitionLineStatusResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "kds.manage");
  if (capErr) return capErr;

  const orderId = intent.orderId.trim();
  const lineId = intent.lineId.trim();
  if (!orderId || !lineId) return { status: 400, error: "ORDER_AND_LINE_REQUIRED" };

  const next = normalizeProductionLineStatus(intent.nextStatus);
  if (next === "cancelled") return { status: 400, error: "KDS_CANNOT_CANCEL" };

  const orderRef = ctx.db.collection("orders").doc(orderId);
  const idemKey = intent.idempotencyKey?.trim();
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, "transition_line_status", {
      orderId,
      lineId,
      expectedStatus: intent.expectedStatus,
      nextStatus: intent.nextStatus,
    }),
  );

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idemRef(ctx.db, ctx.restaurantId, idemKey).get(),
      "transition_line_status",
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.orderId) {
      return transitionLineStatusResultFromIdempotencyHit(hit, orderId, lineId, next);
    }
  }

  const nowMs = Date.now();
  let resultStatus = next;
  let inventoryWarnings: ModifierStockConsumptionWarning[] = [];
  let rehydratedResult: TransitionLineStatusResult | null = null;

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idemRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, "transition_line_status", payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.orderId) {
          rehydratedResult = transitionLineStatusResultFromIdempotencyHit(hit, orderId, lineId, next);
          throw new Error("IDEM_OK");
        }
      }

      const orderSnap = await tx.get(orderRef);
      const orderData = readOrderSnapData(orderSnap);
      if (!orderData) throw new Error("ORDER_NOT_FOUND");
      if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TENANT_MISMATCH");
      const verErr = assertExpectedVersion(orderData, intent.expectedUpdatedAtMs);
      if (verErr) throw new Error(verErr.error);

      const existingItems = existingItemsArray(orderData.items);
      const beforeItemsForStock = existingItems.map((line) => ({ ...line }));
      const byId = indexItemsByLineId(existingItems);
      const line = byId.get(lineId);
      if (!line) throw new Error("LINE_NOT_FOUND");

      const currentStatus = normalizeProductionLineStatus(line.status);
      const expected = normalizeProductionLineStatus(intent.expectedStatus);
      if (currentStatus !== expected) throw new Error(`STATUS_MISMATCH:${currentStatus}`);
      if (!isAllowedKdsLineStatusTransition(currentStatus, next)) throw new Error("TRANSITION_NOT_ALLOWED");

      byId.set(lineId, applyKdsLineStatusTransition(line, next, nowMs));
      const merged = [...byId.values()];

      const orderItemsSnap = await loadOrderItemsForOrderInTransaction(
        tx,
        ctx.db,
        ctx.restaurantId,
        orderId,
      );
      const loaded = indexLoadedOrderItems(orderItemsSnap);
      const meta = orderProjectionMetaFromOrder(orderId, orderData, ctx.restaurantId);
      const plan = planOrderProjectionWrites(ctx.db, meta, merged, loaded, nowMs);
      const inventoryPlan = await applyModifierStockForItemTransition(
        tx,
        ctx,
        orderId,
        beforeItemsForStock,
        plan.itemsWithDocIds,
        nowMs,
      );
      inventoryWarnings = inventoryPlan.warnings;

      tx.update(orderRef, {
        items: plan.itemsWithDocIds,
        updatedAt: FieldValue.serverTimestamp(),
      });
      applyProjectionWritePlan(tx, plan);
      resultStatus = next;

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idemRef(ctx.db, ctx.restaurantId, idemKey),
          "transition_line_status",
          payloadHash,
          buildIdempotencyResultWithInventoryWarnings(
            { orderId, lineId, status: next },
            inventoryPlan.warnings,
          ),
        );
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "IDEM_OK" && rehydratedResult) return rehydratedResult;
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "LINE_NOT_FOUND") return { status: 404, error: "LINE_NOT_FOUND" };
    if (msg === "TRANSITION_NOT_ALLOWED") return { status: 400, error: "TRANSITION_NOT_ALLOWED" };
    if (msg.startsWith("STATUS_MISMATCH:")) return { status: 409, error: "STATUS_MISMATCH", details: msg.slice(14) };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "STOCK_MOVEMENT_ID_CONFLICT") return { status: 409, error: "STOCK_MOVEMENT_ID_CONFLICT" };
    throw e;
  }

  return {
    orderId,
    lineId,
    status: resultStatus,
    inventoryWarnings: sortInventoryWarningsStable(inventoryWarnings),
  };
}

export async function handleTransitionLineQuantity(
  ctx: AuthenticatedRestaurantContext,
  intent: TransitionLineQuantityIntent,
): Promise<TransitionLineQuantityResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "kds.manage");
  if (capErr) return capErr;

  const orderId = intent.orderId.trim();
  const lineId = intent.lineId.trim();
  if (!orderId || !lineId) return { status: 400, error: "ORDER_AND_LINE_REQUIRED" };

  const next = normalizeProductionLineStatus(intent.nextStatus);
  if (next === "cancelled") return { status: 400, error: "KDS_CANNOT_CANCEL" };

  const orderRef = ctx.db.collection("orders").doc(orderId);
  const idemKey = intent.idempotencyKey?.trim();
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, "transition_line_quantity", {
      orderId,
      lineId,
      units: intent.units,
      expectedStatus: intent.expectedStatus,
      nextStatus: intent.nextStatus,
    }),
  );

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idemRef(ctx.db, ctx.restaurantId, idemKey).get(),
      "transition_line_quantity",
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.advancedLineId) {
      return transitionLineQuantityResultFromIdempotencyHit(hit, orderId, lineId, next);
    }
  }

  const nowMs = Date.now();
  let advancedLineId = "";
  let inventoryWarnings: ModifierStockConsumptionWarning[] = [];
  let rehydratedResult: TransitionLineQuantityResult | null = null;
  const stableNewLineId = idemKey ? deriveStableSplitLineId(lineId, idemKey) : undefined;

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idemRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, "transition_line_quantity", payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.advancedLineId) {
          rehydratedResult = transitionLineQuantityResultFromIdempotencyHit(hit, orderId, lineId, next);
          throw new Error("IDEM_OK");
        }
      }

      const orderSnap = await tx.get(orderRef);
      const orderData = readOrderSnapData(orderSnap);
      if (!orderData) throw new Error("ORDER_NOT_FOUND");
      if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TENANT_MISMATCH");
      const verErr = assertExpectedVersion(orderData, intent.expectedUpdatedAtMs);
      if (verErr) throw new Error(verErr.error);

      const existingItems = existingItemsArray(orderData.items);
      const beforeItemsForStock = existingItems.map((line) => ({ ...line }));
      const line = indexItemsByLineId(existingItems).get(lineId);
      if (!line) throw new Error("LINE_NOT_FOUND");
      const currentStatus = normalizeProductionLineStatus(line.status);
      const expected = normalizeProductionLineStatus(intent.expectedStatus);
      if (currentStatus !== expected) throw new Error(`STATUS_MISMATCH:${currentStatus}`);
      if (!isAllowedKdsLineStatusTransition(currentStatus, next)) throw new Error("TRANSITION_NOT_ALLOWED");

      const split = splitLineQuantityForKdsTransition(
        existingItems,
        lineId,
        intent.units,
        next,
        nowMs,
        stableNewLineId,
      );
      if ("error" in split) throw new Error(split.error);

      advancedLineId = split.advancedLineId;
      const orderItemsSnap = await loadOrderItemsForOrderInTransaction(
        tx,
        ctx.db,
        ctx.restaurantId,
        orderId,
      );
      const loaded = indexLoadedOrderItems(orderItemsSnap);
      const meta = orderProjectionMetaFromOrder(orderId, orderData, ctx.restaurantId);
      const plan = planOrderProjectionWrites(ctx.db, meta, split.items, loaded, nowMs);
      const inventoryPlan = await applyModifierStockForItemTransition(
        tx,
        ctx,
        orderId,
        beforeItemsForStock,
        plan.itemsWithDocIds,
        nowMs,
      );
      inventoryWarnings = inventoryPlan.warnings;

      tx.update(orderRef, {
        items: plan.itemsWithDocIds,
        total: computeAuthoritativeOrderTotal(plan.itemsWithDocIds),
        updatedAt: FieldValue.serverTimestamp(),
      });
      applyProjectionWritePlan(tx, plan);

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idemRef(ctx.db, ctx.restaurantId, idemKey),
          "transition_line_quantity",
          payloadHash,
          buildIdempotencyResultWithInventoryWarnings(
            { advancedLineId, status: next, orderId, lineId },
            inventoryPlan.warnings,
          ),
        );
      }
    });
  } catch (e) {
    if (e instanceof DuplicateOrderItemLineError) {
      return { status: 409, error: e.code, details: e.lineId };
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg === "IDEM_OK" && rehydratedResult) return rehydratedResult;
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "LINE_NOT_FOUND") return { status: 404, error: "LINE_NOT_FOUND" };
    if (msg === "UNITS_INVALID" || msg === "UNITS_NOT_PARTIAL" || msg === "DUPLICATE_LINE_ID") {
      return { status: 400, error: msg };
    }
    if (msg === "TRANSITION_NOT_ALLOWED") return { status: 400, error: "TRANSITION_NOT_ALLOWED" };
    if (msg.startsWith("STATUS_MISMATCH:")) return { status: 409, error: "STATUS_MISMATCH", details: msg.slice(14) };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    if (msg === "STOCK_MOVEMENT_ID_CONFLICT") return { status: 409, error: "STOCK_MOVEMENT_ID_CONFLICT" };
    throw e;
  }

  return {
    orderId,
    lineId,
    advancedLineId,
    status: next,
    inventoryWarnings: sortInventoryWarningsStable(inventoryWarnings),
  };
}
