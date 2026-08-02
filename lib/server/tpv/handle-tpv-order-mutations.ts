import type { Firestore, Transaction } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { AuthorizedTpvRestaurantContext } from "@/lib/server/tpv/require-authorized-tpv-restaurant";
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
import { deriveStableSplitLineId } from "@/lib/server/tpv/derive-stable-split-line-id";
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
  PersistDraftItemsIntent,
  SaleLineIntent,
  TransitionLineQuantityIntent,
  TransitionLineStatusIntent,
  UpsertSaleLinesIntent,
} from "@/lib/server/tpv/tpv-mutation-dtos";
import {
  mergeOrderItemsForPersist,
  normalizeProductionLineStatus,
  resolvePersistOrderLineId,
  selectDraftPersistableFirestoreItems,
} from "@/lib/firestore/merge-order-items-for-persist";
import { firestoreItemsToSaleLineIntents } from "@/lib/firestore/firestore-items-to-sale-intent";
import {
  applyInitialModifierStockConsumptionInTransaction,
  type ModifierStockConsumptionPlan,
} from "@/lib/server/tpv/plan-initial-modifier-stock-consumption";
import type { ModifierStockConsumptionWarning } from "@/lib/inventory/stock-movement-types";
import { isActiveTpvOrderStatus } from "@/lib/server/tpv/is-active-tpv-order-status";
import {
  assertTableOrderLockIntegrity,
  filterActiveOrdersForTable,
  readTableOrderLockData,
  releaseTableOrderLockIfOwnerInTransaction,
  tableOrderLockRef,
  writeTableOrderLockClaim,
} from "@/lib/server/tpv/table-order-lock";

export type TpvMutationError = { status: number; error: string; details?: string };

export type CreateOpenOrderResult = {
  orderId: string;
  total: number;
  inventoryWarnings: ModifierStockConsumptionWarning[];
  reusedExistingOrder?: boolean;
  items?: Record<string, unknown>[];
  /** Versión autoritativa post-mutación (ms). Cliente debe usarla en CAS. */
  updatedAtMs?: number;
};

export type UpsertSaleLinesResult = {
  orderId: string;
  total: number;
  items: Record<string, unknown>[];
  inventoryWarnings: ModifierStockConsumptionWarning[];
  updatedAtMs?: number;
};

export type PersistDraftItemsResult = {
  orderId: string;
  total: number;
  items: Record<string, unknown>[];
  pendingRemoved: number;
  nonPendingPreserved: number;
  updatedAtMs?: number;
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

function readUpdatedAtMsFromHit(hit: Record<string, unknown>): number | undefined {
  const raw = hit.updatedAtMs;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function createOpenResultFromIdempotencyHit(hit: Record<string, unknown>): CreateOpenOrderResult {
  return {
    orderId: String(hit.orderId),
    total: Number(hit.total) || 0,
    inventoryWarnings: readInventoryWarningsFromIdempotencyResult(hit),
    reusedExistingOrder: hit.reusedExistingOrder === true,
    items: Array.isArray(hit.items) ? (hit.items as Record<string, unknown>[]) : undefined,
    updatedAtMs: readUpdatedAtMsFromHit(hit),
  };
}

/** Lee updatedAt real tras commit (serverTimestamp ya materializado). */
async function loadAuthoritativeUpdatedAtMs(
  db: Firestore,
  orderId: string,
): Promise<number | undefined> {
  const snap = await db.collection("orders").doc(orderId).get();
  if (!snap.exists) return undefined;
  const ms = readOrderUpdatedAtMs(snap.data() as Record<string, unknown>);
  return ms ?? undefined;
}

async function withAuthoritativeUpdatedAtMs<T extends { orderId: string; updatedAtMs?: number }>(
  db: Firestore,
  result: T,
): Promise<T> {
  if (result.updatedAtMs != null) return result;
  const updatedAtMs = await loadAuthoritativeUpdatedAtMs(db, result.orderId);
  return updatedAtMs != null ? { ...result, updatedAtMs } : result;
}

function isMutationError(value: unknown): value is TpvMutationError {
  return (
    value != null &&
    typeof value === "object" &&
    "status" in value &&
    "error" in value &&
    typeof (value as TpvMutationError).status === "number"
  );
}

function upsertSaleLinesResultFromIdempotencyHit(hit: Record<string, unknown>): UpsertSaleLinesResult {
  return {
    orderId: String(hit.orderId),
    total: Number(hit.total) || 0,
    items: Array.isArray(hit.items) ? (hit.items as Record<string, unknown>[]) : [],
    inventoryWarnings: readInventoryWarningsFromIdempotencyResult(hit),
    updatedAtMs: readUpdatedAtMsFromHit(hit),
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
  ctx: AuthorizedTpvRestaurantContext,
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

/** Permisos de transition-line-status: served con tpv.sell|kds.manage; resto kds.manage. */
export function assertTransitionLineStatusCapability(
  ctx: AuthorizedTpvRestaurantContext,
  nextStatus: string,
): TpvMutationError | null {
  const next = normalizeProductionLineStatus(nextStatus);
  if (next === "cancelled") return { status: 400, error: "KDS_CANNOT_CANCEL" };
  if (next === "served") {
    const canServe =
      serverRoleHasCapability(ctx.role, "tpv.sell") ||
      serverRoleHasCapability(ctx.role, "kds.manage");
    if (!canServe) return { status: 403, error: "TPV_SELL_REQUIRED" };
    return null;
  }
  return requireTpvCapability(ctx, "kds.manage");
}

async function applyModifierStockForItemTransition(
  tx: Transaction,
  ctx: AuthorizedTpvRestaurantContext,
  orderId: string,
  beforeItems: readonly Record<string, unknown>[],
  afterItems: readonly Record<string, unknown>[],
  nowMs: number,
): Promise<ModifierStockConsumptionPlan> {
  // Modifier planner also runs recipe consumption with all reads before writes.
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

export async function handleCreateOpenOrder(
  ctx: AuthorizedTpvRestaurantContext,
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
      return withAuthoritativeUpdatedAtMs(
        ctx.db,
        createOpenResultFromIdempotencyHit(hit),
      );
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
  let inventoryWarnings: ModifierStockConsumptionWarning[] = [];
  let rehydratedResult: CreateOpenOrderResult | null = null;
  let createdOrderId: string | null = null;
  let reuseOrderId: string | null = null;

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

      const lockRef = tableOrderLockRef(ctx.db, ctx.restaurantId, tableId);
      const lockSnap = await tx.get(lockRef);
      const ordersSnap = await tx.get(
        ctx.db
          .collection("orders")
          .where("restaurantId", "==", ctx.restaurantId)
          .where("tableId", "==", tableId),
      );

      const activeOrders = filterActiveOrdersForTable(
        ordersSnap.docs.map((d) => ({
          id: d.id,
          data: () => d.data() as Record<string, unknown>,
        })),
        ctx.restaurantId,
        tableId,
      );

      let resolvedReuseId: string | null = null;
      let repairLockToFree = false;

      const lock = readTableOrderLockData(lockSnap);
      if (lock) {
        const integrity = assertTableOrderLockIntegrity(lock, ctx.restaurantId, tableId);
        if (integrity) {
          throw new Error(integrity.code);
        }
        const lockedOrderId = lock.orderId?.trim() || "";
        if (lockedOrderId) {
          let lockedOrderDoc = ordersSnap.docs.find((d) => d.id === lockedOrderId) ?? null;
          let lockedData: Record<string, unknown> | null = lockedOrderDoc
            ? ((lockedOrderDoc.data() as Record<string, unknown>) ?? null)
            : null;
          if (!lockedOrderDoc) {
            const orphanSnap = await tx.get(ctx.db.collection("orders").doc(lockedOrderId));
            if (orphanSnap.exists) {
              lockedData = (orphanSnap.data() as Record<string, unknown>) ?? null;
            }
          }
          if (!lockedData) {
            console.warn("[tableOrderLock] orphan lock; repairing", {
              restaurantId: ctx.restaurantId,
              tableId,
              orderId: lockedOrderId,
            });
            repairLockToFree = true;
          } else {
            const orderRid = String(lockedData.restaurantId ?? "").trim();
            const orderTid = String(lockedData.tableId ?? "").trim();
            if (orderRid !== ctx.restaurantId) {
              throw new Error("LOCK_ORDER_TENANT_MISMATCH");
            }
            if (orderTid !== tableId) {
              throw new Error("LOCK_ORDER_TABLE_MISMATCH");
            }
            if (isActiveTpvOrderStatus(lockedData.status)) {
              resolvedReuseId = lockedOrderId;
            } else {
              console.warn("[tableOrderLock] terminal order in lock; repairing", {
                restaurantId: ctx.restaurantId,
                tableId,
                orderId: lockedOrderId,
              });
              repairLockToFree = true;
            }
          }
        }
      }

      if (!resolvedReuseId) {
        if (activeOrders.length > 1) {
          throw new Error("MULTIPLE_ACTIVE_ORDERS_FOR_TABLE");
        }
        if (activeOrders.length === 1) {
          resolvedReuseId = activeOrders[0]!.id;
        }
      }

      if (resolvedReuseId) {
        writeTableOrderLockClaim(tx, lockRef, {
          restaurantId: ctx.restaurantId,
          tableId,
          orderId: resolvedReuseId,
          create: !lockSnap.exists,
        });
        reuseOrderId = resolvedReuseId;
        return;
      }

      // repairLockToFree: lock huérfano/terminal — se sobrescribe al reclamar el nuevo order.
      void repairLockToFree;

      const orderRef = ctx.db.collection("orders").doc();
      const loaded = { byLineId: new Map(), byDocId: new Map(), allRefs: [] };
      const meta = orderProjectionMetaFromOrder(
        orderRef.id,
        { tableId, table: intent.tableLabel?.trim() || tableId },
        ctx.restaurantId,
      );
      const plan = planOrderProjectionWrites(ctx.db, meta, built, loaded, nowMs);
      // Todas las lecturas del planner de stock deben ocurrir antes de cualquier write.
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
      writeTableOrderLockClaim(tx, lockRef, {
        restaurantId: ctx.restaurantId,
        tableId,
        orderId: orderRef.id,
        create: !lockSnap.exists,
      });

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
              reusedExistingOrder: false,
            },
            inventoryPlan.warnings,
          ),
        );
      }
      createdOrderId = orderRef.id;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "IDEM_OK" && rehydratedResult) {
      return withAuthoritativeUpdatedAtMs(ctx.db, rehydratedResult);
    }
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "TABLE_NOT_FOUND") return { status: 404, error: "TABLE_NOT_FOUND" };
    if (msg === "TABLE_TENANT_MISMATCH") return { status: 403, error: "TABLE_TENANT_MISMATCH" };
    if (msg === "STOCK_MOVEMENT_ID_CONFLICT") return { status: 409, error: "STOCK_MOVEMENT_ID_CONFLICT" };
    if (msg === "MULTIPLE_ACTIVE_ORDERS_FOR_TABLE") {
      return { status: 409, error: "MULTIPLE_ACTIVE_ORDERS_FOR_TABLE" };
    }
    if (msg === "LOCK_TENANT_MISMATCH" || msg === "LOCK_ORDER_TENANT_MISMATCH") {
      return { status: 409, error: "LOCK_TENANT_MISMATCH" };
    }
    if (msg === "LOCK_TABLE_MISMATCH" || msg === "LOCK_ORDER_TABLE_MISMATCH") {
      return { status: 409, error: "LOCK_TABLE_MISMATCH" };
    }
    throw e;
  }

  if (reuseOrderId) {
    const upsert = await handleUpsertSaleLines(ctx, {
      orderId: reuseOrderId,
      lines: intent.lines,
      markSent: intent.markSent === true,
      idempotencyKey: idemKey ? `${idemKey}__create_open_reuse_upsert` : undefined,
    });
    if (isMutationError(upsert)) return upsert;

    if (idemKey) {
      try {
        await ctx.db.runTransaction(async (tx) => {
          const idemSnap = await tx.get(idemRef(ctx.db, ctx.restaurantId, idemKey));
          const hit = readIdempotencyHit(idemSnap, "create_open_order", payloadHash);
          if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
          if (hit?.orderId) {
            rehydratedResult = createOpenResultFromIdempotencyHit(hit);
            throw new Error("IDEM_OK");
          }
          writeIdempotencyRecord(
            tx,
            idemRef(ctx.db, ctx.restaurantId, idemKey),
            "create_open_order",
            payloadHash,
            buildIdempotencyResultWithInventoryWarnings(
              {
                orderId: reuseOrderId,
                total: upsert.total,
                reusedExistingOrder: true,
                items: upsert.items,
              },
              upsert.inventoryWarnings,
            ),
          );
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "IDEM_OK" && rehydratedResult) {
          return withAuthoritativeUpdatedAtMs(ctx.db, rehydratedResult);
        }
        if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
        throw e;
      }
    }

    return {
      orderId: reuseOrderId,
      total: upsert.total,
      inventoryWarnings: sortInventoryWarningsStable(upsert.inventoryWarnings),
      reusedExistingOrder: true,
      items: upsert.items,
      updatedAtMs:
        upsert.updatedAtMs ??
        (await loadAuthoritativeUpdatedAtMs(ctx.db, reuseOrderId)),
    };
  }

  if (!createdOrderId) {
    return { status: 500, error: "CREATE_OPEN_NO_ORDER" };
  }

  return {
    orderId: createdOrderId,
    total,
    inventoryWarnings: sortInventoryWarningsStable(inventoryWarnings),
    reusedExistingOrder: false,
    updatedAtMs: await loadAuthoritativeUpdatedAtMs(ctx.db, createdOrderId),
  };
}

export async function handleUpsertSaleLines(
  ctx: AuthorizedTpvRestaurantContext,
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
      return withAuthoritativeUpdatedAtMs(
        ctx.db,
        upsertSaleLinesResultFromIdempotencyHit(hit),
      );
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
    if (msg === "IDEM_OK" && rehydratedResult) {
      return withAuthoritativeUpdatedAtMs(ctx.db, rehydratedResult);
    }
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    if (msg === "DUPLICATE_LINE_ID") return { status: 400, error: msg };
    if (msg.startsWith("LINE_STATE_CONFLICT:")) {
      return { status: 409, error: "LINE_STATE_CONFLICT", details: msg.slice(20) };
    }
    if (msg === "STOCK_MOVEMENT_ID_CONFLICT") return { status: 409, error: "STOCK_MOVEMENT_ID_CONFLICT" };
    throw e;
  }

  return {
    orderId,
    total,
    items: resultItems,
    inventoryWarnings: sortInventoryWarningsStable(inventoryWarnings),
    updatedAtMs: await loadAuthoritativeUpdatedAtMs(ctx.db, orderId),
  };
}

export async function handleCancelLines(
  ctx: AuthorizedTpvRestaurantContext,
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
  ctx: AuthorizedTpvRestaurantContext,
  intent: TransitionLineStatusIntent,
): Promise<TransitionLineStatusResult | TpvMutationError> {
  const orderId = intent.orderId.trim();
  const lineId = intent.lineId.trim();
  if (!orderId || !lineId) return { status: 400, error: "ORDER_AND_LINE_REQUIRED" };

  const next = normalizeProductionLineStatus(intent.nextStatus);
  const capErr = assertTransitionLineStatusCapability(ctx, next);
  if (capErr) return capErr;

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
      if (!isActiveTpvOrderStatus(orderData.status)) throw new Error("ORDER_NOT_EDITABLE");
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
    if (msg === "ORDER_NOT_EDITABLE") return { status: 409, error: "ORDER_NOT_EDITABLE" };
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
  ctx: AuthorizedTpvRestaurantContext,
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
      if (!isActiveTpvOrderStatus(orderData.status)) throw new Error("ORDER_NOT_EDITABLE");
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
    if (msg === "ORDER_NOT_EDITABLE") return { status: 409, error: "ORDER_NOT_EDITABLE" };
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

export type CloseTpvOrderResult = {
  orderId: string;
  status: "closed";
  lockReleased: boolean;
};

export type ReopenTpvOrderResult = {
  orderId: string;
  status: "open";
  lockAcquired: boolean;
  updatedAtMs?: number;
};

export type ResolveActiveOrderForTableResult = {
  tableId: string;
  orderId: string | null;
};

/**
 * Cierra un pedido y libera el lock de mesa si este order es el propietario.
 * Atómico: status terminal + release en la misma transacción.
 */
export async function handleCloseTpvOrder(
  ctx: AuthorizedTpvRestaurantContext,
  intent: { orderId: string; idempotencyKey?: string },
): Promise<CloseTpvOrderResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const orderId = intent.orderId.trim();
  if (!orderId) return { status: 400, error: "ORDER_ID_REQUIRED" };

  const orderRef = ctx.db.collection("orders").doc(orderId);
  let lockReleased = false;

  try {
    await ctx.db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error("ORDER_NOT_FOUND");
      const orderData = orderSnap.data() as Record<string, unknown>;
      if (String(orderData.restaurantId ?? "").trim() !== ctx.restaurantId) {
        throw new Error("TENANT_MISMATCH");
      }
      const tableId = String(orderData.tableId ?? "").trim();
      if (!tableId) throw new Error("ORDER_TABLE_ID_REQUIRED");

      const lockRef = tableOrderLockRef(ctx.db, ctx.restaurantId, tableId);
      const lockSnap = await tx.get(lockRef);

      if (!isActiveTpvOrderStatus(orderData.status)) {
        const release = releaseTableOrderLockIfOwnerInTransaction(tx, lockRef, lockSnap, {
          restaurantId: ctx.restaurantId,
          tableId,
          orderId,
        });
        lockReleased = release.released && release.reason !== "already_free";
        if (release.reason === "already_free") lockReleased = true;
        return;
      }

      tx.update(orderRef, {
        status: "closed",
        closedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        paymentRequestedAt: null,
      });
      const release = releaseTableOrderLockIfOwnerInTransaction(tx, lockRef, lockSnap, {
        restaurantId: ctx.restaurantId,
        tableId,
        orderId,
      });
      lockReleased = release.released;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "ORDER_TABLE_ID_REQUIRED") return { status: 400, error: "ORDER_TABLE_ID_REQUIRED" };
    throw e;
  }

  return { orderId, status: "closed", lockReleased };
}

/**
 * Reabre un pedido terminal y adquiere el lock si la mesa está libre.
 */
export async function handleReopenTpvOrder(
  ctx: AuthorizedTpvRestaurantContext,
  intent: { orderId: string },
): Promise<ReopenTpvOrderResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const orderId = intent.orderId.trim();
  if (!orderId) return { status: 400, error: "ORDER_ID_REQUIRED" };

  const orderRef = ctx.db.collection("orders").doc(orderId);
  let lockAcquired = false;

  try {
    await ctx.db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error("ORDER_NOT_FOUND");
      const orderData = orderSnap.data() as Record<string, unknown>;
      if (String(orderData.restaurantId ?? "").trim() !== ctx.restaurantId) {
        throw new Error("TENANT_MISMATCH");
      }
      const tableId = String(orderData.tableId ?? "").trim();
      if (!tableId) throw new Error("ORDER_TABLE_ID_REQUIRED");

      const lockRef = tableOrderLockRef(ctx.db, ctx.restaurantId, tableId);
      const lockSnap = await tx.get(lockRef);
      const lock = readTableOrderLockData(lockSnap);
      if (lock) {
        const integrity = assertTableOrderLockIntegrity(lock, ctx.restaurantId, tableId);
        if (integrity) throw new Error(integrity.code);
      }

      if (isActiveTpvOrderStatus(orderData.status)) {
        if (lock?.orderId === orderId) {
          lockAcquired = true;
          return;
        }
        if (lock?.orderId && lock.orderId !== orderId) {
          throw new Error("TABLE_ALREADY_HAS_ACTIVE_ORDER");
        }
        writeTableOrderLockClaim(tx, lockRef, {
          restaurantId: ctx.restaurantId,
          tableId,
          orderId,
          create: !lockSnap.exists,
        });
        lockAcquired = true;
        return;
      }

      const lockedOrderId = lock?.orderId?.trim() || "";
      if (lockedOrderId && lockedOrderId !== orderId) {
        const otherSnap = await tx.get(ctx.db.collection("orders").doc(lockedOrderId));
        if (otherSnap.exists) {
          const other = otherSnap.data() as Record<string, unknown>;
          if (
            String(other.restaurantId ?? "").trim() === ctx.restaurantId &&
            String(other.tableId ?? "").trim() === tableId &&
            isActiveTpvOrderStatus(other.status)
          ) {
            throw new Error("TABLE_ALREADY_HAS_ACTIVE_ORDER");
          }
        }
      }

      // Lecturas adicionales de legacy activos antes de escribir.
      const ordersSnap = await tx.get(
        ctx.db
          .collection("orders")
          .where("restaurantId", "==", ctx.restaurantId)
          .where("tableId", "==", tableId),
      );
      const actives = filterActiveOrdersForTable(
        ordersSnap.docs.map((d) => ({
          id: d.id,
          data: () => d.data() as Record<string, unknown>,
        })),
        ctx.restaurantId,
        tableId,
      ).filter((o) => o.id !== orderId);
      if (actives.length > 0) {
        throw new Error("TABLE_ALREADY_HAS_ACTIVE_ORDER");
      }

      tx.update(orderRef, {
        status: "open",
        reopenedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeTableOrderLockClaim(tx, lockRef, {
        restaurantId: ctx.restaurantId,
        tableId,
        orderId,
        create: !lockSnap.exists,
      });
      lockAcquired = true;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "ORDER_TABLE_ID_REQUIRED") return { status: 400, error: "ORDER_TABLE_ID_REQUIRED" };
    if (msg === "TABLE_ALREADY_HAS_ACTIVE_ORDER") {
      return { status: 409, error: "TABLE_ALREADY_HAS_ACTIVE_ORDER" };
    }
    if (msg === "LOCK_TENANT_MISMATCH") return { status: 409, error: "LOCK_TENANT_MISMATCH" };
    if (msg === "LOCK_TABLE_MISMATCH") return { status: 409, error: "LOCK_TABLE_MISMATCH" };
    throw e;
  }

  return {
    orderId,
    status: "open",
    lockAcquired,
    updatedAtMs: await loadAuthoritativeUpdatedAtMs(ctx.db, orderId),
  };
}

/** Lectura autorizada del orderId activo vía lock determinista (recuperación tras timeout). */
export async function handleResolveActiveOrderForTable(
  ctx: AuthorizedTpvRestaurantContext,
  intent: { tableId: string },
): Promise<ResolveActiveOrderForTableResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const tableId = intent.tableId.trim();
  if (!tableId) return { status: 400, error: "TABLE_ID_REQUIRED" };

  const lockRef = tableOrderLockRef(ctx.db, ctx.restaurantId, tableId);
  const lockSnap = await lockRef.get();
  const lock = readTableOrderLockData(lockSnap);
  if (!lock || !lock.orderId) {
    return { tableId, orderId: null };
  }
  const integrity = assertTableOrderLockIntegrity(lock, ctx.restaurantId, tableId);
  if (integrity) {
    return { status: 409, error: integrity.code };
  }

  const orderSnap = await ctx.db.collection("orders").doc(lock.orderId).get();
  if (!orderSnap.exists) {
    return { tableId, orderId: null };
  }
  const orderData = orderSnap.data() as Record<string, unknown>;
  if (String(orderData.restaurantId ?? "").trim() !== ctx.restaurantId) {
    return { status: 409, error: "LOCK_ORDER_TENANT_MISMATCH" };
  }
  if (String(orderData.tableId ?? "").trim() !== tableId) {
    return { status: 409, error: "LOCK_ORDER_TABLE_MISMATCH" };
  }
  if (!isActiveTpvOrderStatus(orderData.status)) {
    return { tableId, orderId: null };
  }
  return { tableId, orderId: lock.orderId };
}

function assertDraftPersistClientItemShape(
  item: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  const id = resolvePersistOrderLineId(item);
  if (!id) return { ok: false, error: "LINE_ID_REQUIRED" };
  const productId =
    typeof item.productId === "string" ? item.productId.trim() : "";
  if (!productId) return { ok: false, error: "PRODUCT_ID_REQUIRED" };
  if (normalizeProductionLineStatus(item.status) !== "pending") {
    return { ok: false, error: "DRAFT_NON_PENDING_FORBIDDEN" };
  }
  const qty = Number(item.quantity ?? item.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "LINE_QTY_INVALID" };
  }
  return { ok: true };
}

/**
 * Sync autoritativo del borrador TPV (incluye `items: []`).
 * Merge server-side: elimina pending omitidas; conserva sent/prepared/served.
 * Líneas pending se reconstruyen con buildAuthoritativeSaleLine (no confía en precio/routing cliente).
 */
export async function handlePersistDraftItems(
  ctx: AuthorizedTpvRestaurantContext,
  intent: PersistDraftItemsIntent,
): Promise<PersistDraftItemsResult | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const orderId = intent.orderId.trim();
  if (!orderId) return { status: 400, error: "ORDER_ID_REQUIRED" };

  const draftOnly = selectDraftPersistableFirestoreItems(intent.items);
  for (const row of draftOnly) {
    const shape = assertDraftPersistClientItemShape(row);
    if (!shape.ok) return { status: 400, error: shape.error };
  }
  const draftIntents = firestoreItemsToSaleLineIntents(draftOnly);

  const orderRef = ctx.db.collection("orders").doc(orderId);
  const idemKey = intent.idempotencyKey?.trim();
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, "persist_draft_items", {
      orderId,
      items: draftIntents,
    }),
  );

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idemRef(ctx.db, ctx.restaurantId, idemKey).get(),
      "persist_draft_items",
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.orderId) {
      return {
        orderId: String(hit.orderId),
        total: Number(hit.total) || 0,
        items: Array.isArray(hit.items) ? (hit.items as Record<string, unknown>[]) : [],
        pendingRemoved: Number(hit.pendingRemoved) || 0,
        nonPendingPreserved: Number(hit.nonPendingPreserved) || 0,
      };
    }
  }

  const preSnap = await orderRef.get();
  if (!preSnap.exists) return { status: 404, error: "ORDER_NOT_FOUND" };
  const preData = preSnap.data() as Record<string, unknown>;
  if (String(preData.restaurantId ?? "") !== ctx.restaurantId) {
    return { status: 403, error: "TENANT_MISMATCH" };
  }
  if (!isActiveTpvOrderStatus(preData.status)) {
    return { status: 409, error: "ORDER_NOT_EDITABLE" };
  }

  const preExistingById = indexItemsByLineId(existingItemsArray(preData.items));
  let normalizedLocal: Record<string, unknown>[] = [];
  if (draftIntents.length > 0) {
    const built = await preloadCatalogForIntents(
      ctx.db,
      ctx.restaurantId,
      draftIntents,
      preExistingById,
      "pending",
    );
    if (!Array.isArray(built)) return built;
    normalizedLocal = built;
  }

  let resultItems: Record<string, unknown>[] = [];
  let total = 0;
  let pendingRemoved = 0;
  let nonPendingPreserved = 0;
  let rehydrated: PersistDraftItemsResult | null = null;

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idemRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, "persist_draft_items", payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.orderId) {
          rehydrated = {
            orderId: String(hit.orderId),
            total: Number(hit.total) || 0,
            items: Array.isArray(hit.items)
              ? (hit.items as Record<string, unknown>[])
              : [],
            pendingRemoved: Number(hit.pendingRemoved) || 0,
            nonPendingPreserved: Number(hit.nonPendingPreserved) || 0,
          };
          throw new Error("IDEM_OK");
        }
      }

      const orderSnap = await tx.get(orderRef);
      const orderData = readOrderSnapData(orderSnap);
      if (!orderData) throw new Error("ORDER_NOT_FOUND");
      if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) {
        throw new Error("TENANT_MISMATCH");
      }
      if (!isActiveTpvOrderStatus(orderData.status)) {
        throw new Error("ORDER_NOT_EDITABLE");
      }
      const verErr = assertExpectedVersion(orderData, intent.expectedUpdatedAtMs);
      if (verErr) throw new Error(verErr.error);

      const txExistingItems = existingItemsArray(orderData.items);
      const serverPending = txExistingItems.filter(
        (row) => normalizeProductionLineStatus(row.status) === "pending",
      ).length;
      const merged = mergeOrderItemsForPersist(txExistingItems, normalizedLocal);
      const mergedPending = merged.filter(
        (row) => normalizeProductionLineStatus(row.status) === "pending",
      ).length;
      pendingRemoved = Math.max(0, serverPending - mergedPending);
      nonPendingPreserved = merged.filter(
        (row) => normalizeProductionLineStatus(row.status) !== "pending",
      ).length;

      const dupErr = assertNoDuplicateLineIds(merged);
      if (dupErr) throw new Error(dupErr);

      const nowMs = Date.now();
      const orderItemsSnap = await loadOrderItemsForOrderInTransaction(
        tx,
        ctx.db,
        ctx.restaurantId,
        orderId,
      );
      const loaded = indexLoadedOrderItems(orderItemsSnap);
      const meta = orderProjectionMetaFromOrder(orderId, orderData, ctx.restaurantId);
      const plan = planOrderProjectionWrites(ctx.db, meta, merged, loaded, nowMs);
      resultItems = plan.itemsWithDocIds;
      total = computeAuthoritativeOrderTotal(plan.itemsWithDocIds);

      tx.update(orderRef, {
        items: plan.itemsWithDocIds,
        total,
        updatedAt: FieldValue.serverTimestamp(),
      });
      applyProjectionWritePlan(tx, plan);

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idemRef(ctx.db, ctx.restaurantId, idemKey),
          "persist_draft_items",
          payloadHash,
          {
            orderId,
            total,
            items: plan.itemsWithDocIds,
            pendingRemoved,
            nonPendingPreserved,
          },
        );
      }
    });
  } catch (e) {
    if (e instanceof DuplicateOrderItemLineError) {
      return { status: 409, error: e.code, details: e.lineId };
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg === "IDEM_OK" && rehydrated) return rehydrated;
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "ORDER_NOT_EDITABLE") return { status: 409, error: "ORDER_NOT_EDITABLE" };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    if (msg === "DUPLICATE_LINE_ID") return { status: 400, error: msg };
    throw e;
  }

  return {
    orderId,
    total,
    items: resultItems,
    pendingRemoved,
    nonPendingPreserved,
    updatedAtMs: await loadAuthoritativeUpdatedAtMs(ctx.db, orderId),
  };
}
