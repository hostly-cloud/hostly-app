import { FieldValue } from "firebase-admin/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";
import { computeAuthoritativeOrderTotal } from "@/lib/server/tpv/build-authoritative-sale-line";
import type { TpvMutationError } from "@/lib/server/tpv/handle-tpv-order-mutations";
import { requireTpvCapability } from "@/lib/server/tpv/handle-tpv-order-mutations";
import { applyLineCancellation } from "@/lib/server/tpv/line-status-transitions";
import { assertNoDuplicateLineIds } from "@/lib/server/tpv/line-quantity-split";
import { applyModifierStockReversalInTransaction, isModifierReversalBlockedError } from "@/lib/server/tpv/plan-modifier-stock-reversal";
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
import { isActiveOrderStatus, lineHasActiveQuantity } from "@/lib/server/tpv/table-group-order-utils";
import {
  releaseTableOrderLockIfOwnerInTransaction,
  tableOrderLockRef,
  writeTableOrderLockRelease,
} from "@/lib/server/tpv/table-order-lock";
import {
  computeOrderBalance,
  hasPaidPaymentRecords,
  isOrderEconomicallySettled,
  isOrderEmptyWithZeroTotal,
  MONEY_EPS,
} from "@/lib/server/tpv/order-payment-balance";
import {
  loadOrderPaymentsInTransaction,
  loadTableOrdersInTransaction,
} from "@/lib/server/tpv/table-occupancy-server";
import {
  buildIdempotencyPayload,
  idempotencyDocRef,
  readIdempotencyHit,
  stablePayloadHash,
  writeIdempotencyRecord,
} from "@/lib/server/tpv/tpv-idempotency";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function existingItemsArray(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord);
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

export type OrderLifecycleIntent = {
  orderId: string;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
};

export type PatchOrderMetadataIntent = OrderLifecycleIntent & {
  note?: string;
  paymentRequestedAt?: number | null;
};

export type RemoveLineUnitIntent = OrderLifecycleIntent & {
  lineId: string;
};

export type CompLineIntent = OrderLifecycleIntent & {
  lineId: string;
  comped: boolean;
  reason?: string;
};

export type AutoCloseTableIntent = {
  tableId: string;
  idempotencyKey?: string;
};

export async function handleCloseOrder(
  ctx: AuthenticatedRestaurantContext,
  intent: OrderLifecycleIntent,
): Promise<{ orderId: string; status: string } | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const orderId = intent.orderId.trim();
  if (!orderId) return { status: 400, error: "ORDER_ID_REQUIRED" };

  const orderRef = ctx.db.collection("orders").doc(orderId);
  const idemKey = intent.idempotencyKey?.trim();
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, "close_order", { orderId }),
  );

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey).get(),
      "close_order",
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.orderId) return { orderId: String(hit.orderId), status: "closed" };
  }

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, "close_order", payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.orderId) throw new Error(`IDEM_OK:${hit.orderId}`);
      }

      const orderSnap = await tx.get(orderRef);
      const orderData = readOrderSnapData(orderSnap);
      if (!orderData) throw new Error("ORDER_NOT_FOUND");
      if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TENANT_MISMATCH");
      const verErr = assertExpectedVersion(orderData, intent.expectedUpdatedAtMs);
      if (verErr) throw new Error(verErr.error);

      const items = existingItemsArray(orderData.items);
      const payments = await loadOrderPaymentsInTransaction(
        tx,
        ctx.db,
        ctx.restaurantId,
        orderId,
      );
      const { remaining } = computeOrderBalance(orderData, items, payments);

      const tableId = String(orderData.tableId ?? "").trim();
      let tableRef: FirebaseFirestore.DocumentReference | null = null;
      let tableSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      let tableOrders: Awaited<ReturnType<typeof loadTableOrdersInTransaction>> = [];
      if (tableId) {
        tableRef = ctx.db.collection("tables").doc(tableId);
        tableSnap = await tx.get(tableRef);
        tableOrders = await loadTableOrdersInTransaction(tx, ctx.db, ctx.restaurantId, tableId);
      }

      // Lecturas de lock antes de cualquier write.
      const lockRef = tableId ? tableOrderLockRef(ctx.db, ctx.restaurantId, tableId) : null;
      const lockSnap = lockRef ? await tx.get(lockRef) : null;

      const status = String(orderData.status ?? "").trim().toLowerCase();
      if (status === "closed") {
        if (lockRef && lockSnap) {
          releaseTableOrderLockIfOwnerInTransaction(tx, lockRef, lockSnap, {
            restaurantId: ctx.restaurantId,
            tableId,
            orderId,
            claimedByUid: ctx.uid,
            lastOperation: "close_order",
            lastClaimKey: idemKey ?? null,
          });
        }
        if (idemKey) {
          writeIdempotencyRecord(
            tx,
            idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
            "close_order",
            payloadHash,
            { orderId },
          );
        }
        return;
      }
      if (status === "open" || status === "sent") {
        if (remaining > MONEY_EPS && !isOrderEmptyWithZeroTotal(orderData)) {
          throw new Error("UNPAID_BALANCE");
        }
      } else if (status === "paid") {
        if (remaining > MONEY_EPS) throw new Error("UNPAID_BALANCE");
      } else {
        throw new Error("STATUS_TRANSITION_NOT_ALLOWED");
      }

      let canFreeTable = true;
      for (const { ref, data } of tableOrders) {
        if (ref.id === orderId) continue;
        if (isActiveOrderStatus(data.status)) {
          canFreeTable = false;
          break;
        }
      }

      tx.update(orderRef, {
        status: "closed",
        closedAt: Date.now(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (canFreeTable && tableRef && tableSnap?.exists) {
        tx.update(tableRef, {
          status: "free",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (lockRef && lockSnap) {
        releaseTableOrderLockIfOwnerInTransaction(tx, lockRef, lockSnap, {
          restaurantId: ctx.restaurantId,
          tableId,
          orderId,
          claimedByUid: ctx.uid,
          lastOperation: "close_order",
          lastClaimKey: idemKey ?? null,
        });
      }

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
          "close_order",
          payloadHash,
          { orderId },
        );
      }
    });
  } catch (e) {
    if (e instanceof DuplicateOrderItemLineError) {
      return { status: 409, error: e.code, details: e.lineId };
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("IDEM_OK:")) return { orderId: msg.slice(8), status: "closed" };
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    if (msg === "STATUS_TRANSITION_NOT_ALLOWED" || msg === "UNPAID_BALANCE") {
      return { status: 400, error: msg };
    }
    throw e;
  }

  return { orderId, status: "closed" };
}

export async function handleReopenOrder(
  ctx: AuthenticatedRestaurantContext,
  intent: OrderLifecycleIntent,
): Promise<{ orderId: string; status: string } | TpvMutationError> {
  if (!serverRoleHasCapability(ctx.role, "tpv.charge")) {
    return { status: 403, error: "TPV_CHARGE_REQUIRED" };
  }

  const orderId = intent.orderId.trim();
  if (!orderId) return { status: 400, error: "ORDER_ID_REQUIRED" };
  const orderRef = ctx.db.collection("orders").doc(orderId);

  try {
    await ctx.db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      const orderData = readOrderSnapData(orderSnap);
      if (!orderData) throw new Error("ORDER_NOT_FOUND");
      if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TENANT_MISMATCH");
      const verErr = assertExpectedVersion(orderData, intent.expectedUpdatedAtMs);
      if (verErr) throw new Error(verErr.error);

      const items = existingItemsArray(orderData.items);
      const payments = await loadOrderPaymentsInTransaction(
        tx,
        ctx.db,
        ctx.restaurantId,
        orderId,
      );

      const status = String(orderData.status ?? "").trim().toLowerCase();
      if (status === "paid") throw new Error("REOPEN_REQUIRES_REFUND");
      if (status !== "closed") throw new Error("STATUS_TRANSITION_NOT_ALLOWED");
      if (
        hasPaidPaymentRecords(payments) &&
        !isOrderEconomicallySettled(orderData, items, payments)
      ) {
        throw new Error("REOPEN_REQUIRES_REFUND");
      }

      const tableId = String(orderData.tableId ?? "").trim();
      let tableRef: FirebaseFirestore.DocumentReference | null = null;
      let tableSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      if (tableId) {
        tableRef = ctx.db.collection("tables").doc(tableId);
        tableSnap = await tx.get(tableRef);
      }

      tx.update(orderRef, {
        status: "open",
        reopenedAt: Date.now(),
        closedAt: FieldValue.delete(),
        paidAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (tableId && tableRef && tableSnap?.exists) {
        tx.update(tableRef, {
          status: "occupied",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    if (msg === "STATUS_TRANSITION_NOT_ALLOWED" || msg === "REOPEN_REQUIRES_REFUND") {
      return { status: 400, error: msg };
    }
    throw e;
  }

  return { orderId, status: "open" };
}

export async function handlePatchOrderMetadata(
  ctx: AuthenticatedRestaurantContext,
  intent: PatchOrderMetadataIntent,
): Promise<{ orderId: string } | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const orderId = intent.orderId.trim();
  if (!orderId) return { status: 400, error: "ORDER_ID_REQUIRED" };
  const orderRef = ctx.db.collection("orders").doc(orderId);
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (intent.note !== undefined) update.note = intent.note;
  if (intent.paymentRequestedAt !== undefined) {
    update.paymentRequestedAt = intent.paymentRequestedAt;
  }

  try {
    await ctx.db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      const orderData = readOrderSnapData(orderSnap);
      if (!orderData) throw new Error("ORDER_NOT_FOUND");
      if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TENANT_MISMATCH");
      const verErr = assertExpectedVersion(orderData, intent.expectedUpdatedAtMs);
      if (verErr) throw new Error(verErr.error);
      tx.update(orderRef, update);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    throw e;
  }

  return { orderId };
}

export async function handleRemoveLineUnit(
  ctx: AuthenticatedRestaurantContext,
  intent: RemoveLineUnitIntent,
): Promise<{ orderId: string; total: number; lineId: string } | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const orderId = intent.orderId.trim();
  const lineId = intent.lineId.trim();
  if (!orderId || !lineId) return { status: 400, error: "ORDER_AND_LINE_REQUIRED" };

  const orderRef = ctx.db.collection("orders").doc(orderId);
  const nowMs = Date.now();
  let total = 0;
  const idemKey = intent.idempotencyKey?.trim();
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, "remove_line_unit", {
      orderId,
      lineId,
      expectedUpdatedAtMs: intent.expectedUpdatedAtMs ?? null,
    }),
  );

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey).get(),
      "remove_line_unit",
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.orderId) {
      return {
        orderId: String(hit.orderId),
        total: Number(hit.total) || 0,
        lineId: String(hit.lineId ?? lineId),
      };
    }
  }

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, "remove_line_unit", payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.orderId) {
          throw new Error(`IDEM_OK:${hit.orderId}:${hit.total ?? 0}:${hit.lineId ?? lineId}`);
        }
      }

      const orderSnap = await tx.get(orderRef);
      const orderData = readOrderSnapData(orderSnap);
      if (!orderData) throw new Error("ORDER_NOT_FOUND");
      if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TENANT_MISMATCH");
      const verErr = assertExpectedVersion(orderData, intent.expectedUpdatedAtMs);
      if (verErr) throw new Error(verErr.error);

      const items = existingItemsArray(orderData.items);
      const beforeItems = items.map((row) => ({ ...row }));
      const idx = items.findIndex((row) => String(row.id ?? "").trim() === lineId);
      if (idx < 0) throw new Error("LINE_NOT_FOUND");

      const line = { ...items[idx]! };
      const st = normalizeProductionLineStatus(line.status);
      const qty = Math.floor(Number(line.quantity ?? line.qty) || 0);
      let merged: Record<string, unknown>[];

      if (qty <= 1) {
        if (st === "pending") {
          merged = items.filter((row) => String(row.id ?? "").trim() !== lineId);
        } else {
          merged = items.map((row) =>
            String(row.id ?? "").trim() === lineId ? applyLineCancellation(row, nowMs) : row,
          );
        }
      } else {
        const unitTotal = Number(line.total) / qty;
        const nextQty = qty - 1;
        line.quantity = nextQty;
        line.qty = nextQty;
        line.total = Math.round(unitTotal * nextQty * 100) / 100;
        line.updatedAt = nowMs;
        merged = items.map((row, i) => (i === idx ? line : row));
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
      total = computeAuthoritativeOrderTotal(plan.itemsWithDocIds);

      await applyModifierStockReversalInTransaction({
        tx,
        db: ctx.db,
        restaurantId: ctx.restaurantId,
        orderId,
        actorUid: ctx.uid,
        beforeItems,
        afterItems: plan.itemsWithDocIds,
        nowMs,
        operationKind: "remove_line_unit",
        externalOperationIdempotencyKey: idemKey,
        lineIds: [lineId],
      });

      tx.update(orderRef, {
        items: plan.itemsWithDocIds,
        total,
        updatedAt: FieldValue.serverTimestamp(),
      });
      applyProjectionWritePlan(tx, plan);

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
          "remove_line_unit",
          payloadHash,
          { orderId, total, lineId },
        );
      }
    });
  } catch (e) {
    if (e instanceof DuplicateOrderItemLineError) {
      return { status: 409, error: e.code, details: e.lineId };
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("IDEM_OK:")) {
      const [, oid, tot, lid] = msg.split(":");
      return { orderId: oid!, total: Number(tot) || 0, lineId: lid ?? lineId };
    }
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "STOCK_MOVEMENT_ID_CONFLICT") {
      return { status: 409, error: "STOCK_MOVEMENT_ID_CONFLICT" };
    }
    if (isModifierReversalBlockedError(msg)) {
      return { status: 409, error: msg };
    }
    if (msg === "ORDER_NOT_FOUND" || msg === "LINE_NOT_FOUND") {
      return { status: 404, error: msg };
    }
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    throw e;
  }

  return { orderId, total, lineId };
}

export async function handleCompLine(
  ctx: AuthenticatedRestaurantContext,
  intent: CompLineIntent,
): Promise<{ orderId: string; total: number; lineId: string; isComped: boolean } | TpvMutationError> {
  if (!serverRoleHasCapability(ctx.role, "tpv.discount")) {
    return { status: 403, error: "TPV_DISCOUNT_REQUIRED" };
  }

  const orderId = intent.orderId.trim();
  const lineId = intent.lineId.trim();
  if (!orderId || !lineId) return { status: 400, error: "ORDER_AND_LINE_REQUIRED" };

  const orderRef = ctx.db.collection("orders").doc(orderId);
  const nowMs = Date.now();
  let total = 0;
  const idemKey = intent.idempotencyKey?.trim();
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, "comp_line", {
      orderId,
      lineId,
      comped: intent.comped,
      reason: intent.reason ?? null,
      expectedUpdatedAtMs: intent.expectedUpdatedAtMs ?? null,
    }),
  );

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey).get(),
      "comp_line",
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.orderId) {
      return {
        orderId: String(hit.orderId),
        total: Number(hit.total) || 0,
        lineId: String(hit.lineId ?? lineId),
        isComped: hit.isComped === true,
      };
    }
  }

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, "comp_line", payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.orderId) {
          throw new Error(
            `IDEM_OK:${hit.orderId}:${hit.total ?? 0}:${hit.lineId ?? lineId}:${hit.isComped === true}`,
          );
        }
      }

      const orderSnap = await tx.get(orderRef);
      const orderData = readOrderSnapData(orderSnap);
      if (!orderData) throw new Error("ORDER_NOT_FOUND");
      if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) throw new Error("TENANT_MISMATCH");
      const verErr = assertExpectedVersion(orderData, intent.expectedUpdatedAtMs);
      if (verErr) throw new Error(verErr.error);

      const items = existingItemsArray(orderData.items);
      if (!items.some((row) => String(row.id ?? "").trim() === lineId)) {
        throw new Error("LINE_NOT_FOUND");
      }
      const merged = items.map((row) => {
        if (String(row.id ?? "").trim() !== lineId) return row;
        const next = { ...row };
        if (intent.comped) {
          next.isComped = true;
          next.compedAt = nowMs;
          next.compedBy = ctx.uid;
          if (intent.reason) next.compReason = intent.reason;
        } else {
          delete next.isComped;
          delete next.compedAt;
          delete next.compedBy;
          delete next.compReason;
        }
        next.updatedAt = nowMs;
        return next;
      });

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
        updatedAt: FieldValue.serverTimestamp(),
      });
      applyProjectionWritePlan(tx, plan);

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
          "comp_line",
          payloadHash,
          { orderId, total, lineId, isComped: intent.comped },
        );
      }
    });
  } catch (e) {
    if (e instanceof DuplicateOrderItemLineError) {
      return { status: 409, error: e.code, details: e.lineId };
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("IDEM_OK:")) {
      const [, oid, tot, lid, compedFlag] = msg.split(":");
      return {
        orderId: oid!,
        total: Number(tot) || 0,
        lineId: lid ?? lineId,
        isComped: compedFlag === "true",
      };
    }
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "ORDER_NOT_FOUND" || msg === "LINE_NOT_FOUND") {
      return { status: 404, error: msg };
    }
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    throw e;
  }

  return { orderId, total, lineId, isComped: intent.comped };
}

export async function handleAutoCloseEmptyTable(
  ctx: AuthenticatedRestaurantContext,
  intent: AutoCloseTableIntent,
): Promise<{ closedOrderIds: string[] } | TpvMutationError> {
  const capErr = requireTpvCapability(ctx, "tpv.sell");
  if (capErr) return capErr;

  const tableId = intent.tableId.trim();
  if (!tableId) return { status: 400, error: "TABLE_ID_REQUIRED" };

  const idemKey = intent.idempotencyKey?.trim();
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, "auto_close_table", { tableId }),
  );
  const tableRef = ctx.db.collection("tables").doc(tableId);
  const closedOrderIds: string[] = [];

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, "auto_close_table", payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (Array.isArray(hit?.closedOrderIds)) {
          throw new Error(`IDEM_OK:${JSON.stringify(hit.closedOrderIds)}`);
        }
      }

      const tableOrders = await loadTableOrdersInTransaction(tx, ctx.db, ctx.restaurantId, tableId);
      const tableSnap = await tx.get(tableRef);

      for (const { ref, data } of tableOrders) {
        if (!isActiveOrderStatus(data.status)) continue;
        const items = existingItemsArray(data.items);
        if (items.some((line) => lineHasActiveQuantity(line))) continue;
        if (!isOrderEmptyWithZeroTotal(data)) continue;

        const payments = await loadOrderPaymentsInTransaction(tx, ctx.db, ctx.restaurantId, ref.id);
        const { remaining } = computeOrderBalance(data, items, payments);
        if (remaining > MONEY_EPS) continue;

        tx.update(ref, {
          status: "closed",
          closedAt: Date.now(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        closedOrderIds.push(ref.id);
      }

      let canFreeTable = true;
      for (const { ref, data } of tableOrders) {
        if (closedOrderIds.includes(ref.id)) continue;
        if (isActiveOrderStatus(data.status)) {
          canFreeTable = false;
          break;
        }
      }
      if (canFreeTable && tableSnap.exists) {
        tx.update(tableRef, {
          status: "free",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
          "auto_close_table",
          payloadHash,
          { closedOrderIds },
        );
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("IDEM_OK:")) {
      try {
        const ids = JSON.parse(msg.slice(8)) as string[];
        return { closedOrderIds: Array.isArray(ids) ? ids : [] };
      } catch {
        return { closedOrderIds: [] };
      }
    }
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    throw e;
  }

  return { closedOrderIds };
}

/** Reemplaza pay-table-order: solo cierra mesa si todas las orders están pagadas/cerradas. */
export async function handleFinalizeTableAfterPayment(
  ctx: AuthenticatedRestaurantContext,
  intent: { tableId: string; idempotencyKey?: string },
): Promise<{ tableId: string; tableStatus: string } | TpvMutationError> {
  const capErr = serverRoleHasCapability(ctx.role, "tpv.charge")
    ? null
    : { status: 403 as const, error: "TPV_CHARGE_REQUIRED" };
  if (capErr) return capErr;

  const tableId = intent.tableId.trim();
  if (!tableId) return { status: 400, error: "TABLE_ID_REQUIRED" };

  const idemKey = intent.idempotencyKey?.trim();
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, "finalize_table", { tableId }),
  );
  const tableRef = ctx.db.collection("tables").doc(tableId);

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey).get(),
      "finalize_table",
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.tableId) {
      return { tableId: String(hit.tableId), tableStatus: String(hit.tableStatus ?? "free") };
    }
  }

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, "finalize_table", payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.tableId) throw new Error(`IDEM_OK:${hit.tableId}:${hit.tableStatus ?? "free"}`);
      }

      const tableSnap = await tx.get(tableRef);
      if (!tableSnap.exists) throw new Error("TABLE_NOT_FOUND");
      const tableData = tableSnap.data() as Record<string, unknown>;
      if (String(tableData.restaurantId ?? "") !== ctx.restaurantId) {
        throw new Error("TABLE_TENANT_MISMATCH");
      }

      const tableOrders = await loadTableOrdersInTransaction(tx, ctx.db, ctx.restaurantId, tableId);
      for (const { ref, data } of tableOrders) {
        const status = String(data.status ?? "").trim().toLowerCase();
        if (!isActiveOrderStatus(status) && status !== "paid" && status !== "closed") continue;
        const items = existingItemsArray(data.items);
        const payments = await loadOrderPaymentsInTransaction(tx, ctx.db, ctx.restaurantId, ref.id);
        if (!isOrderEconomicallySettled(data, items, payments) && !isOrderEmptyWithZeroTotal(data)) {
          throw new Error("TABLE_HAS_UNPAID_ORDERS");
        }
        if (isActiveOrderStatus(status) && !isOrderEmptyWithZeroTotal(data)) {
          throw new Error("TABLE_HAS_UNPAID_ORDERS");
        }
      }

      const lockRef = tableOrderLockRef(ctx.db, ctx.restaurantId, tableId);
      // Lectura requerida antes de liberar (reglas de transacción Firestore).
      await tx.get(lockRef);

      tx.update(tableRef, {
        status: "free",
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Mesa sin pedidos activos pendientes de cobro: liberar ownership.
      writeTableOrderLockRelease(tx, lockRef, {
        restaurantId: ctx.restaurantId,
        tableId,
        claimedByUid: ctx.uid,
        lastOperation: "finalize_table",
        lastClaimKey: idemKey ?? null,
      });

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
          "finalize_table",
          payloadHash,
          { tableId, tableStatus: "free" },
        );
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("IDEM_OK:")) {
      const [, tid, st] = msg.split(":");
      return { tableId: tid!, tableStatus: st ?? "free" };
    }
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "TABLE_NOT_FOUND") return { status: 404, error: "TABLE_NOT_FOUND" };
    if (msg === "TABLE_TENANT_MISMATCH") return { status: 403, error: "TABLE_TENANT_MISMATCH" };
    if (msg === "TABLE_HAS_UNPAID_ORDERS") return { status: 409, error: msg };
    throw e;
  }

  return { tableId, tableStatus: "free" };
}
