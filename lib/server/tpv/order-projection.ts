import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  QuerySnapshot,
  Transaction,
} from "firebase-admin/firestore";
import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";
import { lineNeedsProjection } from "@/lib/server/tpv/line-quantity-split";

export type OrderProjectionMeta = {
  restaurantId: string;
  orderId: string;
  tableId: string;
  tableName: string;
};

export type LoadedOrderItemProjection = {
  byLineId: Map<string, { ref: DocumentReference; data: Record<string, unknown> }>;
  byDocId: Map<string, { ref: DocumentReference; data: Record<string, unknown> }>;
  allRefs: DocumentReference[];
};

export function orderProjectionMetaFromOrder(
  orderId: string,
  orderData: Record<string, unknown>,
  restaurantId: string,
): OrderProjectionMeta {
  return {
    restaurantId,
    orderId,
    tableId: String(orderData.tableId ?? orderData.mesaId ?? ""),
    tableName: String(orderData.table ?? orderData.mesaName ?? orderData.tableId ?? ""),
  };
}

export class DuplicateOrderItemLineError extends Error {
  readonly code = "DUPLICATE_ORDER_ITEM_LINE_ID" as const;
  constructor(readonly lineId: string) {
    super(`DUPLICATE_ORDER_ITEM_LINE_ID:${lineId}`);
    this.name = "DuplicateOrderItemLineError";
  }
}

export function indexLoadedOrderItems(snap: QuerySnapshot): LoadedOrderItemProjection {
  const byLineId = new Map<string, { ref: DocumentReference; data: Record<string, unknown> }>();
  const byDocId = new Map<string, { ref: DocumentReference; data: Record<string, unknown> }>();
  const allRefs: DocumentReference[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const lineId = typeof data.lineId === "string" ? data.lineId.trim() : "";
    const entry = { ref: doc.ref, data };
    byDocId.set(doc.id, entry);
    allRefs.push(doc.ref);
    if (lineId) {
      if (byLineId.has(lineId)) throw new DuplicateOrderItemLineError(lineId);
      byLineId.set(lineId, entry);
    }
  }
  return { byLineId, byDocId, allRefs };
}

function buildOrderItemPayload(
  line: Record<string, unknown>,
  meta: OrderProjectionMeta,
  nowMs: number,
): Record<string, unknown> {
  const lineStatus = normalizeProductionLineStatus(line.status);
  const payload: Record<string, unknown> = {
    restaurantId: meta.restaurantId,
    orderId: meta.orderId,
    tableId: meta.tableId,
    tableName: meta.tableName,
    lineId: String(line.id ?? ""),
    productId: String(line.productId ?? ""),
    name: String(line.displayName ?? line.name ?? line.productName ?? ""),
    quantity: Number(line.quantity ?? line.qty) || 0,
    qty: Number(line.quantity ?? line.qty) || 0,
    status: lineStatus === "sent" ? "pending" : lineStatus,
    price: Number(line.price ?? line.precio) || 0,
    updatedAt: nowMs,
  };
  if (line.extras) payload.extras = line.extras;
  if (line.categoryName) payload.categoryName = line.categoryName;
  if (line.categoria) payload.categoryName = line.categoria;
  if (line.course != null) payload.course = line.course;
  if (line.note) payload.note = line.note;
  if (line.displayName) payload.displayName = line.displayName;
  if (line.selectedModifiers) payload.selectedModifiers = line.selectedModifiers;
  if (line.modifierTotal != null) payload.modifierTotal = line.modifierTotal;
  if (line.stationId) payload.stationId = line.stationId;
  if (line.stationName) payload.stationName = line.stationName;
  if (line.operationStationId) payload.operationStationId = line.operationStationId;
  if (line.operationStationName) payload.operationStationName = line.operationStationName;
  if (line.inventoryCost) payload.inventoryCost = line.inventoryCost;
  if (line.sentAt != null) payload.sentAt = line.sentAt;
  if (line.createdAt != null) payload.createdAt = line.createdAt;
  if (line.preparedAt != null) payload.preparedAt = line.preparedAt;
  if (line.servedAt != null) payload.servedAt = line.servedAt;
  if (line.preparingAt != null) payload.preparingAt = line.preparingAt;
  if (line.readyAt != null) payload.readyAt = line.readyAt;
  if (line.cancelledAt != null) payload.cancelledAt = line.cancelledAt;
  if (line.cancelledBy) payload.cancelledBy = line.cancelledBy;
  if (line.tableGroupSourceTableId) payload.tableGroupSourceTableId = line.tableGroupSourceTableId;
  if (line.tableGroupSourceOrderId) payload.tableGroupSourceOrderId = line.tableGroupSourceOrderId;
  return payload;
}

export type ProjectionWritePlan = {
  itemsWithDocIds: Record<string, unknown>[];
  writes: Array<{ ref: DocumentReference; payload: Record<string, unknown>; merge: boolean }>;
};

export function planOrderProjectionWrites(
  db: Firestore,
  meta: OrderProjectionMeta,
  items: readonly Record<string, unknown>[],
  loaded: LoadedOrderItemProjection,
  nowMs: number,
): ProjectionWritePlan {
  const activeLineIds = new Set<string>();
  const itemsWithDocIds: Record<string, unknown>[] = [];
  const writes: ProjectionWritePlan["writes"] = [];

  for (const line of items) {
    const lineId = typeof line.id === "string" ? line.id.trim() : "";
    if (!lineId) continue;
    const outLine = { ...line };
    if (lineNeedsProjection(outLine)) {
      activeLineIds.add(lineId);
      const existingDocId =
        typeof outLine.orderItemDocId === "string" && outLine.orderItemDocId.trim()
          ? outLine.orderItemDocId.trim()
          : loaded.byLineId.get(lineId)?.ref.id ?? null;
      const payload = buildOrderItemPayload(outLine, meta, nowMs);
      if (existingDocId) {
        outLine.orderItemDocId = existingDocId;
        writes.push({
          ref: db.collection("orderItems").doc(existingDocId),
          payload,
          merge: true,
        });
      } else {
        const ref = db.collection("orderItems").doc();
        outLine.orderItemDocId = ref.id;
        writes.push({
          ref,
          payload: { ...payload, createdAt: outLine.createdAt ?? nowMs },
          merge: false,
        });
      }
    }
    itemsWithDocIds.push(outLine);
  }

  for (const [lineId, entry] of loaded.byLineId.entries()) {
    if (activeLineIds.has(lineId)) continue;
    const st = normalizeProductionLineStatus(entry.data.status);
    if (st === "cancelled") continue;
    writes.push({
      ref: entry.ref,
      payload: {
        status: "cancelled",
        quantity: 0,
        qty: 0,
        cancelledAt: nowMs,
        updatedAt: nowMs,
      },
      merge: true,
    });
  }

  return { itemsWithDocIds, writes };
}

export function applyProjectionWritePlan(tx: Transaction, plan: ProjectionWritePlan): void {
  for (const w of plan.writes) {
    if (w.merge) tx.set(w.ref, w.payload, { merge: true });
    else tx.set(w.ref, w.payload);
  }
}

export function readOrderUpdatedAtMs(data: Record<string, unknown>): number | null {
  const raw = data.updatedAt;
  if (
    raw &&
    typeof raw === "object" &&
    "toMillis" in raw &&
    typeof (raw as { toMillis: () => number }).toMillis === "function"
  ) {
    return (raw as { toMillis: () => number }).toMillis();
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return null;
}

export async function loadOrderItemsForOrder(
  db: Firestore,
  restaurantId: string,
  orderId: string,
): Promise<QuerySnapshot> {
  return db
    .collection("orderItems")
    .where("restaurantId", "==", restaurantId)
    .where("orderId", "==", orderId)
    .get();
}

export async function loadOrderItemsForOrderInTransaction(
  tx: Transaction,
  db: Firestore,
  restaurantId: string,
  orderId: string,
): Promise<QuerySnapshot> {
  return tx.get(
    db
      .collection("orderItems")
      .where("restaurantId", "==", restaurantId)
      .where("orderId", "==", orderId),
  );
}

export function readOrderSnapData(snap: DocumentSnapshot): Record<string, unknown> | null {
  if (!snap.exists) return null;
  return snap.data() as Record<string, unknown>;
}
