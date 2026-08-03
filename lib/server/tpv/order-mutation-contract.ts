import {
  computeBillableTotalFromPersistItems,
  mergeOrderItemsForPersist,
  normalizeProductionLineStatus,
} from "@/lib/firestore/merge-order-items-for-persist";

/** Claves top-level permitidas al crear una order desde cliente waiter. Sin items[]. */
export const ORDER_WAITER_CREATE_KEYS = [
  "restaurantId",
  "tableId",
  "table",
  "mesaId",
  "mesaName",
  "mesaZone",
  "zoneName",
  "status",
  "createdAt",
  "updatedAt",
  "total",
  "source",
  "updatedBy",
  "updatedFrom",
  "assignedOperatorId",
  "assignedOperatorName",
  "assignedAt",
] as const;

/** Claves top-level que waiter puede actualizar sin tocar items[] (cliente). */
export const ORDER_WAITER_METADATA_UPDATE_KEYS = [
  "paymentRequestedAt",
  "updatedAt",
  "note",
  "status",
  "paidAt",
  "closedAt",
  "sentAt",
  "reopenedAt",
  "total",
  "cancelledLineIds",
  "assignedOperatorId",
  "assignedOperatorName",
  "assignedAt",
] as const;

export const ORDER_PRIVILEGED_CREATE_KEYS = [
  "discountAmount",
  "discountPercent",
  "discountTotal",
  "discount",
  "mergedIntoOrderId",
  "mergedIntoTableId",
  "tableGroupMergeOriginalStatus",
  "tableGroupMergeOriginalPaymentRequestedAt",
  "refund",
  "refunded",
  "refundedAt",
  "refundAmount",
] as const;

export const ORDER_EMBEDDED_LINE_KEYS = [
  "id",
  "productId",
  "name",
  "qty",
  "quantity",
  "status",
  "addedAt",
  "createdAt",
  "sentAt",
  "preparedAt",
  "servedAt",
  "readyAt",
  "preparingAt",
  "cancelledAt",
  "cancelledBy",
  "isComped",
  "compedAt",
  "compedReason",
  "price",
  "precio",
  "extras",
  "selectedModifiers",
  "modifierTotal",
  "displayName",
  "total",
  "categoria",
  "categoryName",
  "productName",
  "note",
  "course",
  "inventoryCost",
  "orderItemDocId",
  "tableGroupSourceTableId",
  "tableGroupSourceOrderId",
  "stationId",
  "stationName",
  "operationStationId",
  "operationStationName",
  /** Buckets KDS históricos (d8f8b83 / 5fd1195): kitchen|bar|cocktail + área ES. */
  "station",
  "preparationArea",
  "modifiersLabel",
] as const;

const ORDER_EMBEDDED_LINE_KEY_SET = new Set<string>(ORDER_EMBEDDED_LINE_KEYS);

/** Estados permitidos en líneas embebidas escritas por TPV (sell/cancel). */
const TPV_LINE_STATUSES = new Set(["pending", "sent", "cancelled"]);

const KDS_LINE_STATUSES = new Set(["preparing", "prepared", "ready", "served"]);

const PRIVILEGED_LINE_KEYS = new Set([
  "preparedAt",
  "servedAt",
  "readyAt",
  "preparingAt",
  "tableGroupSourceTableId",
  "tableGroupSourceOrderId",
]);

export type TpvOrderItemsOperation =
  | "create_open"
  | "persist_items"
  | "send_items"
  | "cancel_lines";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(data: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(data).every((key) => allowedSet.has(key));
}

export function orderCreateHasPrivilegedFields(data: Record<string, unknown>): boolean {
  return ORDER_PRIVILEGED_CREATE_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(data, key),
  );
}

export function isWaiterSafeOrderCreate(data: Record<string, unknown>): boolean {
  if (orderCreateHasPrivilegedFields(data)) return false;
  if (!hasOnlyKeys(data, [...ORDER_WAITER_CREATE_KEYS])) return false;
  if (Object.prototype.hasOwnProperty.call(data, "items")) return false;
  const status = String(data.status ?? "").toLowerCase();
  return status === "open" || status === "sent";
}

export function validateEmbeddedLineForTpv(
  line: Record<string, unknown>,
  operation: TpvOrderItemsOperation,
): string | null {
  for (const key of Object.keys(line)) {
    if (!ORDER_EMBEDDED_LINE_KEY_SET.has(key)) {
      return `LINE_UNKNOWN_KEY:${key}`;
    }
  }
  const status = normalizeProductionLineStatus(line.status);
  if (KDS_LINE_STATUSES.has(status)) {
    return "LINE_KDS_STATUS_FORBIDDEN";
  }
  if (!TPV_LINE_STATUSES.has(status)) {
    return "LINE_STATUS_INVALID";
  }
  if (operation !== "cancel_lines" && status === "cancelled") {
    return "LINE_CANCELLED_WITHOUT_CAPABILITY";
  }
  for (const key of PRIVILEGED_LINE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(line, key)) {
      return `LINE_PRIVILEGED_KEY:${key}`;
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(line, "tableGroupSourceTableId") ||
    Object.prototype.hasOwnProperty.call(line, "tableGroupSourceOrderId")
  ) {
    return "LINE_GROUP_PROVENANCE_FORBIDDEN";
  }
  const qty = Number(line.quantity ?? line.qty);
  if (!Number.isFinite(qty) || qty < 0) {
    return "LINE_QTY_INVALID";
  }
  return null;
}

export function sanitizeAndMergeOrderItems(
  serverItems: unknown,
  clientItems: readonly Record<string, unknown>[],
  operation: TpvOrderItemsOperation,
): { items: Record<string, unknown>[]; total: number } | { error: string } {
  for (const line of clientItems) {
    if (!isRecord(line)) return { error: "LINE_NOT_OBJECT" };
    const issue = validateEmbeddedLineForTpv(line, operation);
    if (issue) return { error: issue };
  }
  const merged = mergeOrderItemsForPersist(serverItems, clientItems);
  const total = computeBillableTotalFromPersistItems(merged);
  return { items: merged, total };
}

/** orderItems — create allowlist */
export const ORDER_ITEM_CREATE_KEYS = [
  "restaurantId",
  "orderId",
  "tableId",
  "tableName",
  "mesaId",
  "lineId",
  "productId",
  "name",
  "quantity",
  "qty",
  "status",
  "sentAt",
  "createdAt",
  "updatedAt",
  "categoryName",
  "course",
  "extras",
  "selectedModifiers",
  "modifierTotal",
  "modifiersLabel",
  "displayName",
  "note",
  "stationId",
  "stationName",
  "operationStationId",
  "operationStationName",
  "station",
  "preparationArea",
  "inventoryCost",
  "id",
  "price",
] as const;

export const ORDER_ITEM_TPV_SELL_UPDATE_KEYS = [
  "quantity",
  "qty",
  "updatedAt",
  "extras",
  "note",
  "displayName",
  "isComped",
  "compedAt",
  "compedReason",
  "selectedModifiers",
  "modifierTotal",
  "modifiersLabel",
] as const;

export const ORDER_ITEM_CANCEL_UPDATE_KEYS = [
  "status",
  "cancelledAt",
  "cancelledBy",
  "updatedAt",
  "quantity",
  "qty",
] as const;

export const ORDER_ITEM_KDS_UPDATE_KEYS = [
  "status",
  "preparingAt",
  "readyAt",
  "preparedAt",
  "servedAt",
  "kitchenStatus",
  "updatedAt",
] as const;

/** payments — create allowlist (shapes reales TPV) */
export const PAYMENT_CREATE_KEYS = [
  "restaurantId",
  "tableId",
  "tableName",
  "total",
  "amount",
  "originalTotal",
  "discountAmount",
  "discountPercent",
  "discountPercentAmount",
  "discountTotal",
  "finalTotal",
  "paymentMethod",
  "orderSessionId",
  "orderId",
  "waiterId",
  "waiterEmail",
  "tip",
  "received",
  "voucherAmount",
  "voucherUsed",
  "voucherRemaining",
  "voucherNumber",
  "part",
  "totalParts",
  "ticketNumber",
  "status",
  "type",
  "paymentKind",
  "isPartial",
  "remainingAfterPayment",
  "accountFinalTotal",
  "createdBy",
  "createdAt",
  "updatedAt",
  "cashReceived",
  "change",
  "itemIds",
  "invoiceName",
  "invoiceTaxId",
  "invoiceAddress",
  "invoiceEmail",
] as const;

export const PAYMENT_REFUND_KEYS = [
  "refund",
  "refunded",
  "refundedAt",
  "refundAmount",
] as const;

export function isSafePaymentCreate(data: Record<string, unknown>): boolean {
  if (!hasOnlyKeys(data, [...PAYMENT_CREATE_KEYS])) return false;
  if (PAYMENT_REFUND_KEYS.some((k) => Object.prototype.hasOwnProperty.call(data, k))) {
    return false;
  }
  const amount = Number(data.amount ?? data.total);
  if (!Number.isFinite(amount) || amount < 0) return false;
  const status = String(data.status ?? "").toLowerCase();
  if (status !== "paid") return false;
  const type = String(data.type ?? "").toLowerCase();
  if (!["table_amount", "split_equal", "split_by_items"].includes(type)) return false;
  if (
    Object.prototype.hasOwnProperty.call(data, "paymentKind") &&
    String(data.paymentKind).toLowerCase() === "refund"
  ) {
    return false;
  }
  return true;
}
