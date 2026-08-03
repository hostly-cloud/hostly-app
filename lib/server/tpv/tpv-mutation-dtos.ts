/** DTOs e intención mínima para mutaciones TPV autoritativas (server-side). */

export const MAX_SALE_LINES_PER_REQUEST = 200;
export const MAX_CANCEL_LINE_IDS = 100;
export const MAX_LINE_NOTE_LENGTH = 500;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
export const MAX_PAYMENT_ITEM_IDS = 200;

export type ModifierSelectionIntent = {
  groupId: string;
  optionId: string;
};

export type SaleLineIntent = {
  lineId: string;
  productId: string;
  quantity: number;
  selectedModifiers?: ModifierSelectionIntent[];
  note?: string;
};

export const SALE_LINE_INTENT_KEYS = [
  "lineId",
  "productId",
  "quantity",
  "selectedModifiers",
  "note",
] as const;

export const MODIFIER_INTENT_KEYS = ["groupId", "optionId"] as const;

export type PaymentInvoiceIntent = {
  name: string;
  taxId: string;
  email: string;
};

export type ChargeOrderIntent = {
  orderId: string;
  tableId?: string;
  tableName?: string;
  paymentMethod: "cash" | "card" | "voucher";
  type: "table_amount" | "split_equal" | "split_by_items";
  amount: number;
  itemIds?: string[];
  part?: number;
  totalParts?: number;
  orderSessionId?: string;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
  tip?: number;
  received?: number;
  cashReceived?: number;
  change?: number;
  voucherAmount?: number;
  voucherNumber?: string;
  ticketNumber?: string;
  invoiceNumber?: string;
  invoice?: PaymentInvoiceIntent;
  waiterId?: string;
  waiterEmail?: string;
};

export type RefundPaymentIntent = {
  paymentId: string;
  idempotencyKey?: string;
};

export type VoidPaymentIntent = {
  paymentId: string;
  idempotencyKey?: string;
};

export type TransitionLineQuantityIntent = {
  orderId: string;
  lineId: string;
  units: number;
  expectedStatus: string;
  nextStatus: string;
  idempotencyKey: string;
  expectedUpdatedAtMs?: number;
};

export type TransitionLineStatusIntent = {
  orderId: string;
  lineId: string;
  expectedStatus: string;
  nextStatus: string;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
};

export type CancelLinesIntent = {
  orderId: string;
  lineIds: string[];
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
};

export type UpsertSaleLinesIntent = {
  orderId: string;
  lines: SaleLineIntent[];
  markSent?: boolean;
  idempotencyKey?: string;
  expectedUpdatedAtMs?: number;
};

export type CreateOpenOrderIntent = {
  tableId: string;
  tableLabel?: string;
  lines: SaleLineIntent[];
  markSent?: boolean;
  idempotencyKey?: string;
  operatorAssignment?: {
    assignedOperatorId: string;
    assignedOperatorName: string;
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(data: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(data).every((k) => set.has(k));
}

export function parseSaleLineIntent(raw: unknown): SaleLineIntent | { error: string } {
  if (!isRecord(raw)) return { error: "LINE_NOT_OBJECT" };
  if (!hasOnlyKeys(raw, SALE_LINE_INTENT_KEYS)) return { error: "LINE_UNKNOWN_KEY" };
  const lineId = typeof raw.lineId === "string" ? raw.lineId.trim() : "";
  const productId = typeof raw.productId === "string" ? raw.productId.trim() : "";
  const quantity = Number(raw.quantity);
  if (!lineId) return { error: "LINE_ID_REQUIRED" };
  if (!productId) return { error: "PRODUCT_ID_REQUIRED" };
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
    return { error: "QUANTITY_INVALID" };
  }
  let selectedModifiers: ModifierSelectionIntent[] | undefined;
  if (raw.selectedModifiers != null) {
    if (!Array.isArray(raw.selectedModifiers)) return { error: "MODIFIERS_INVALID" };
    selectedModifiers = [];
    for (const row of raw.selectedModifiers) {
      if (!isRecord(row) || !hasOnlyKeys(row, MODIFIER_INTENT_KEYS)) {
        return { error: "MODIFIER_UNKNOWN_KEY" };
      }
      const groupId = typeof row.groupId === "string" ? row.groupId.trim() : "";
      const optionId = typeof row.optionId === "string" ? row.optionId.trim() : "";
      if (!groupId || !optionId) return { error: "MODIFIER_ID_REQUIRED" };
      selectedModifiers.push({ groupId, optionId });
    }
  }
  const note =
    typeof raw.note === "string" && raw.note.trim()
      ? raw.note.trim().slice(0, MAX_LINE_NOTE_LENGTH)
      : undefined;
  return { lineId, productId, quantity, selectedModifiers, note };
}

export function parseSaleLineIntents(
  raw: unknown,
): SaleLineIntent[] | { error: string } {
  if (!Array.isArray(raw)) return { error: "LINES_REQUIRED" };
  if (raw.length > MAX_SALE_LINES_PER_REQUEST) return { error: "LINES_LIMIT_EXCEEDED" };
  const out: SaleLineIntent[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const parsed = parseSaleLineIntent(row);
    if ("error" in parsed) return parsed;
    if (seen.has(parsed.lineId)) return { error: "DUPLICATE_LINE_ID" };
    seen.add(parsed.lineId);
    out.push(parsed);
  }
  return out;
}

export function parseIdempotencyKey(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const key = raw.trim();
  if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) return undefined;
  return key;
}

export function parseExpectedVersion(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.floor(raw);
}

function rejectRestaurantIdInBody(body: Record<string, unknown>): string | null {
  if ("restaurantId" in body && body.restaurantId != null) {
    return "RESTAURANT_ID_NOT_ALLOWED";
  }
  return null;
}

const CREATE_OPEN_KEYS = [
  "tableId",
  "tableLabel",
  "lines",
  "markSent",
  "idempotencyKey",
  "operatorAssignment",
] as const;

const UPSERT_KEYS = [
  "orderId",
  "lines",
  "markSent",
  "idempotencyKey",
  "expectedUpdatedAtMs",
] as const;

const CANCEL_KEYS = ["orderId", "lineIds", "idempotencyKey", "expectedUpdatedAtMs"] as const;

const TRANSITION_KEYS = [
  "orderId",
  "lineId",
  "expectedStatus",
  "nextStatus",
  "idempotencyKey",
  "expectedUpdatedAtMs",
] as const;

const TRANSITION_QTY_KEYS = [
  "orderId",
  "lineId",
  "units",
  "expectedStatus",
  "nextStatus",
  "idempotencyKey",
  "expectedUpdatedAtMs",
] as const;

const CHARGE_KEYS = [
  "orderId",
  "tableId",
  "tableName",
  "paymentMethod",
  "type",
  "amount",
  "itemIds",
  "part",
  "totalParts",
  "orderSessionId",
  "idempotencyKey",
  "expectedUpdatedAtMs",
  "tip",
  "received",
  "cashReceived",
  "change",
  "voucherAmount",
  "voucherNumber",
  "ticketNumber",
  "invoiceNumber",
  "invoice",
  "waiterId",
  "waiterEmail",
] as const;

const REFUND_KEYS = ["paymentId", "idempotencyKey"] as const;
const VOID_KEYS = ["paymentId", "idempotencyKey"] as const;

export function parseCreateOpenOrderBody(
  raw: unknown,
): CreateOpenOrderIntent | { error: string } {
  if (!isRecord(raw)) return { error: "INVALID_JSON" };
  const err = rejectRestaurantIdInBody(raw);
  if (err) return { error: err };
  if (!hasOnlyKeys(raw, CREATE_OPEN_KEYS)) return { error: "UNKNOWN_KEY" };
  const tableId = typeof raw.tableId === "string" ? raw.tableId.trim() : "";
  if (!tableId) return { error: "TABLE_ID_REQUIRED" };
  const lines = parseSaleLineIntents(raw.lines);
  if ("error" in lines) return lines;
  return {
    tableId,
    tableLabel: typeof raw.tableLabel === "string" ? raw.tableLabel.trim() : undefined,
    lines,
    markSent: raw.markSent === true,
    idempotencyKey: parseIdempotencyKey(raw.idempotencyKey),
    operatorAssignment:
      raw.operatorAssignment != null && isRecord(raw.operatorAssignment)
        ? {
            assignedOperatorId: String(raw.operatorAssignment.assignedOperatorId ?? "").trim(),
            assignedOperatorName: String(raw.operatorAssignment.assignedOperatorName ?? "").trim(),
          }
        : null,
  };
}

export function parseUpsertSaleLinesBody(
  raw: unknown,
): UpsertSaleLinesIntent | { error: string } {
  if (!isRecord(raw)) return { error: "INVALID_JSON" };
  const err = rejectRestaurantIdInBody(raw);
  if (err) return { error: err };
  if (!hasOnlyKeys(raw, UPSERT_KEYS)) return { error: "UNKNOWN_KEY" };
  const orderId = typeof raw.orderId === "string" ? raw.orderId.trim() : "";
  if (!orderId) return { error: "ORDER_ID_REQUIRED" };
  const lines = parseSaleLineIntents(raw.lines);
  if ("error" in lines) return lines;
  return {
    orderId,
    lines,
    markSent: raw.markSent === true,
    idempotencyKey: parseIdempotencyKey(raw.idempotencyKey),
    expectedUpdatedAtMs: parseExpectedVersion(raw.expectedUpdatedAtMs),
  };
}

export function parseCancelLinesBody(raw: unknown): CancelLinesIntent | { error: string } {
  if (!isRecord(raw)) return { error: "INVALID_JSON" };
  const err = rejectRestaurantIdInBody(raw);
  if (err) return { error: err };
  if (!hasOnlyKeys(raw, CANCEL_KEYS)) return { error: "UNKNOWN_KEY" };
  const orderId = typeof raw.orderId === "string" ? raw.orderId.trim() : "";
  if (!orderId) return { error: "ORDER_ID_REQUIRED" };
  if (!Array.isArray(raw.lineIds)) return { error: "LINE_IDS_REQUIRED" };
  if (raw.lineIds.length > MAX_CANCEL_LINE_IDS) return { error: "LINE_IDS_LIMIT" };
  const lineIds = raw.lineIds
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean);
  if (lineIds.length === 0) return { error: "LINE_IDS_REQUIRED" };
  return {
    orderId,
    lineIds,
    idempotencyKey: parseIdempotencyKey(raw.idempotencyKey),
    expectedUpdatedAtMs: parseExpectedVersion(raw.expectedUpdatedAtMs),
  };
}

export function parseTransitionLineStatusBody(
  raw: unknown,
): TransitionLineStatusIntent | { error: string } {
  if (!isRecord(raw)) return { error: "INVALID_JSON" };
  const err = rejectRestaurantIdInBody(raw);
  if (err) return { error: err };
  if (!hasOnlyKeys(raw, TRANSITION_KEYS)) return { error: "UNKNOWN_KEY" };
  const orderId = typeof raw.orderId === "string" ? raw.orderId.trim() : "";
  const lineId = typeof raw.lineId === "string" ? raw.lineId.trim() : "";
  const expectedStatus = typeof raw.expectedStatus === "string" ? raw.expectedStatus.trim() : "";
  const nextStatus = typeof raw.nextStatus === "string" ? raw.nextStatus.trim() : "";
  if (!orderId || !lineId || !expectedStatus || !nextStatus) {
    return { error: "TRANSITION_FIELDS_REQUIRED" };
  }
  return {
    orderId,
    lineId,
    expectedStatus,
    nextStatus,
    idempotencyKey: parseIdempotencyKey(raw.idempotencyKey),
    expectedUpdatedAtMs: parseExpectedVersion(raw.expectedUpdatedAtMs),
  };
}

export function parseTransitionLineQuantityBody(
  raw: unknown,
): TransitionLineQuantityIntent | { error: string } {
  if (!isRecord(raw)) return { error: "INVALID_JSON" };
  const err = rejectRestaurantIdInBody(raw);
  if (err) return { error: err };
  if (!hasOnlyKeys(raw, TRANSITION_QTY_KEYS)) return { error: "UNKNOWN_KEY" };
  const orderId = typeof raw.orderId === "string" ? raw.orderId.trim() : "";
  const lineId = typeof raw.lineId === "string" ? raw.lineId.trim() : "";
  const expectedStatus = typeof raw.expectedStatus === "string" ? raw.expectedStatus.trim() : "";
  const nextStatus = typeof raw.nextStatus === "string" ? raw.nextStatus.trim() : "";
  const units = Number(raw.units);
  if (!orderId || !lineId || !expectedStatus || !nextStatus) {
    return { error: "TRANSITION_FIELDS_REQUIRED" };
  }
  if (!Number.isInteger(units) || units <= 0) return { error: "UNITS_INVALID" };
  const idempotencyKey = parseIdempotencyKey(raw.idempotencyKey);
  if (!idempotencyKey) return { error: "IDEMPOTENCY_KEY_REQUIRED" };
  return {
    orderId,
    lineId,
    units,
    expectedStatus,
    nextStatus,
    idempotencyKey,
    expectedUpdatedAtMs: parseExpectedVersion(raw.expectedUpdatedAtMs),
  };
}

function parseOptionalMoney(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

function parseInvoiceIntent(raw: unknown): PaymentInvoiceIntent | undefined {
  if (!isRecord(raw)) return undefined;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const taxId = typeof raw.taxId === "string" ? raw.taxId.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim() : "";
  if (!name && !taxId && !email) return undefined;
  return { name, taxId, email };
}

export function parseChargeOrderBody(raw: unknown): ChargeOrderIntent | { error: string } {
  if (!isRecord(raw)) return { error: "INVALID_JSON" };
  const err = rejectRestaurantIdInBody(raw);
  if (err) return { error: err };
  if (!hasOnlyKeys(raw, CHARGE_KEYS)) return { error: "UNKNOWN_KEY" };
  const orderId = typeof raw.orderId === "string" ? raw.orderId.trim() : "";
  if (!orderId) return { error: "ORDER_ID_REQUIRED" };
  const paymentMethod = raw.paymentMethod;
  if (paymentMethod !== "cash" && paymentMethod !== "card" && paymentMethod !== "voucher") {
    return { error: "PAYMENT_METHOD_INVALID" };
  }
  const type = raw.type;
  if (type !== "table_amount" && type !== "split_equal" && type !== "split_by_items") {
    return { error: "PAYMENT_TYPE_INVALID" };
  }
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount)) return { error: "AMOUNT_INVALID" };
  let itemIds: string[] | undefined;
  if (raw.itemIds != null) {
    if (!Array.isArray(raw.itemIds)) return { error: "ITEM_IDS_INVALID" };
    itemIds = raw.itemIds
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter(Boolean);
    if (itemIds.length > MAX_PAYMENT_ITEM_IDS) return { error: "ITEM_IDS_LIMIT" };
  }
  return {
    orderId,
    tableId: typeof raw.tableId === "string" ? raw.tableId.trim() : undefined,
    tableName: typeof raw.tableName === "string" ? raw.tableName.trim() : undefined,
    paymentMethod,
    type,
    amount,
    itemIds,
    part: typeof raw.part === "number" ? raw.part : undefined,
    totalParts: typeof raw.totalParts === "number" ? raw.totalParts : undefined,
    orderSessionId:
      typeof raw.orderSessionId === "string" ? raw.orderSessionId.trim() : undefined,
    idempotencyKey: parseIdempotencyKey(raw.idempotencyKey),
    expectedUpdatedAtMs: parseExpectedVersion(raw.expectedUpdatedAtMs),
    tip: parseOptionalMoney(raw.tip),
    received: parseOptionalMoney(raw.received),
    cashReceived: parseOptionalMoney(raw.cashReceived),
    change: parseOptionalMoney(raw.change),
    voucherAmount: parseOptionalMoney(raw.voucherAmount),
    voucherNumber:
      typeof raw.voucherNumber === "string" ? raw.voucherNumber.trim() : undefined,
    ticketNumber:
      typeof raw.ticketNumber === "string" ? raw.ticketNumber.trim() : undefined,
    invoiceNumber:
      typeof raw.invoiceNumber === "string" ? raw.invoiceNumber.trim() : undefined,
    invoice: parseInvoiceIntent(raw.invoice),
    waiterId: typeof raw.waiterId === "string" ? raw.waiterId.trim() : undefined,
    waiterEmail:
      typeof raw.waiterEmail === "string" ? raw.waiterEmail.trim() : undefined,
  };
}

export function parseVoidPaymentBody(raw: unknown): VoidPaymentIntent | { error: string } {
  if (!isRecord(raw)) return { error: "INVALID_JSON" };
  const err = rejectRestaurantIdInBody(raw);
  if (err) return { error: err };
  if (!hasOnlyKeys(raw, VOID_KEYS)) return { error: "UNKNOWN_KEY" };
  const paymentId = typeof raw.paymentId === "string" ? raw.paymentId.trim() : "";
  if (!paymentId) return { error: "PAYMENT_ID_REQUIRED" };
  return {
    paymentId,
    idempotencyKey: parseIdempotencyKey(raw.idempotencyKey),
  };
}

export function parseRefundPaymentBody(raw: unknown): RefundPaymentIntent | { error: string } {
  if (!isRecord(raw)) return { error: "INVALID_JSON" };
  const err = rejectRestaurantIdInBody(raw);
  if (err) return { error: err };
  if (!hasOnlyKeys(raw, REFUND_KEYS)) return { error: "UNKNOWN_KEY" };
  const paymentId = typeof raw.paymentId === "string" ? raw.paymentId.trim() : "";
  if (!paymentId) return { error: "PAYMENT_ID_REQUIRED" };
  return {
    paymentId,
    idempotencyKey: parseIdempotencyKey(raw.idempotencyKey),
  };
}
