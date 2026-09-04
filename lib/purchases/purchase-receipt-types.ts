import { readPurchaseDraftTimestampMs } from "@/lib/inventory/purchase-draft-types";
import {
  getPurchaseOrderLineRemainingQuantity,
  type PurchaseOrderDocument,
  type PurchaseOrderLine,
} from "@/lib/purchases/purchase-order-types";
import {
  normalizeInventoryUnitAlias,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";

export type PurchaseReceiptLine = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  orderedQuantity?: number;
  previouslyReceivedQuantity?: number;
  remainingAfterQuantity?: number;
  /** Coste unitario esperado del pedido en el momento de la recepción. */
  estimatedUnitCost?: number | null;
  /** Proveedor resuelto para esta línea en el momento de la recepción. */
  supplierName?: string | null;
};

export type PurchaseReceiptApplySummary = {
  applied: number;
  skipped: number;
  failed: number;
};

export type PurchaseReceiptDocument = {
  id: string;
  restaurantId: string;
  purchaseOrderId: string;
  createdAt: number;
  createdBy?: string;
  lines: PurchaseReceiptLine[];
  totalReceivedQuantity: number;
  notes?: string | null;
  movementIds?: string[];
  applySummary?: PurchaseReceiptApplySummary;
};

const MAX_LINES = 200;
const MAX_NAME_LENGTH = 160;
const MAX_NOTES_LENGTH = 500;

function readFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readTrimmedString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

export function sanitizePurchaseReceiptLine(raw: unknown): PurchaseReceiptLine | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const productId = readTrimmedString(rec.productId, 128);
  const productName = readTrimmedString(rec.productName, MAX_NAME_LENGTH);
  if (!productId || !productName) return null;

  const quantity = readFiniteNumber(rec.quantity);
  if (quantity == null || quantity <= 0) return null;

  const unitRaw = readTrimmedString(rec.unit, 16) ?? "ud";
  const unit = normalizeInventoryUnitAlias(unitRaw) || unitRaw;

  const orderedQuantity = readFiniteNumber(rec.orderedQuantity);
  const previouslyReceivedQuantity = readFiniteNumber(rec.previouslyReceivedQuantity);
  const remainingAfterQuantity = readFiniteNumber(rec.remainingAfterQuantity);
  const estimatedUnitCost = readFiniteNumber(rec.estimatedUnitCost);

  return {
    productId,
    productName,
    quantity: roundInventoryQuantity(quantity),
    unit,
    orderedQuantity:
      orderedQuantity != null && orderedQuantity >= 0
        ? roundInventoryQuantity(orderedQuantity)
        : undefined,
    previouslyReceivedQuantity:
      previouslyReceivedQuantity != null && previouslyReceivedQuantity >= 0
        ? roundInventoryQuantity(previouslyReceivedQuantity)
        : undefined,
    remainingAfterQuantity:
      remainingAfterQuantity != null && remainingAfterQuantity >= 0
        ? roundInventoryQuantity(remainingAfterQuantity)
        : undefined,
    estimatedUnitCost:
      estimatedUnitCost != null && estimatedUnitCost >= 0
        ? roundInventoryQuantity(estimatedUnitCost)
        : null,
    supplierName: readTrimmedString(rec.supplierName, MAX_NAME_LENGTH),
  };
}

export function sanitizePurchaseReceiptLines(raw: unknown): PurchaseReceiptLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: PurchaseReceiptLine[] = [];
  for (const item of raw) {
    if (lines.length >= MAX_LINES) break;
    const line = sanitizePurchaseReceiptLine(item);
    if (line) lines.push(line);
  }
  return lines;
}

export function computePurchaseReceiptTotalQuantity(
  lines: PurchaseReceiptLine[],
): number {
  let total = 0;
  for (const line of lines) {
    total += line.quantity;
  }
  return roundInventoryQuantity(total);
}

export function normalizePurchaseReceiptDocument(
  receiptId: string,
  raw: unknown,
  restaurantId: string,
): PurchaseReceiptDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rid =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : restaurantId.trim();
  if (!rid || rid !== restaurantId.trim()) return null;

  const purchaseOrderId = readTrimmedString(data.purchaseOrderId, 128);
  if (!purchaseOrderId) return null;

  const createdAt = readPurchaseDraftTimestampMs(data.createdAt);
  if (createdAt == null) return null;

  const lines = sanitizePurchaseReceiptLines(data.lines);
  if (lines.length === 0) return null;

  const totalRaw = data.totalReceivedQuantity;
  const totalReceivedQuantity =
    totalRaw == null
      ? computePurchaseReceiptTotalQuantity(lines)
      : readFiniteNumber(totalRaw) ?? computePurchaseReceiptTotalQuantity(lines);

  const movementIdsRaw = data.movementIds;
  const movementIds = Array.isArray(movementIdsRaw)
    ? movementIdsRaw
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
        .slice(0, MAX_LINES)
    : undefined;

  const applySummaryRaw =
    data.applySummary && typeof data.applySummary === "object"
      ? (data.applySummary as Record<string, unknown>)
      : null;
  const applySummary = applySummaryRaw
    ? {
        applied: Math.max(0, Math.floor(readFiniteNumber(applySummaryRaw.applied) ?? 0)),
        skipped: Math.max(0, Math.floor(readFiniteNumber(applySummaryRaw.skipped) ?? 0)),
        failed: Math.max(0, Math.floor(readFiniteNumber(applySummaryRaw.failed) ?? 0)),
      }
    : undefined;

  return {
    id: receiptId.trim(),
    restaurantId: rid,
    purchaseOrderId,
    createdAt,
    createdBy: readTrimmedString(data.createdBy, 128) ?? undefined,
    lines,
    totalReceivedQuantity,
    notes: readTrimmedString(data.notes, MAX_NOTES_LENGTH),
    movementIds,
    applySummary,
  };
}

export type PurchaseReceiptInputLine = {
  productId: string;
  quantity: number;
};

function aggregateReceiptInputLines(
  inputLines: PurchaseReceiptInputLine[],
): PurchaseReceiptInputLine[] {
  const quantityByProductId = new Map<string, number>();
  for (const input of inputLines) {
    const productId = input.productId.trim();
    if (!productId) continue;
    const qty = readFiniteNumber(input.quantity);
    if (qty == null || qty <= 0) continue;
    quantityByProductId.set(
      productId,
      roundInventoryQuantity((quantityByProductId.get(productId) ?? 0) + qty),
    );
  }
  return [...quantityByProductId.entries()]
    .slice(0, MAX_LINES)
    .map(([productId, quantity]) => ({ productId, quantity }));
}

export function buildPurchaseReceiptLinesFromOrder(params: {
  order: PurchaseOrderDocument;
  inputLines: PurchaseReceiptInputLine[];
}): PurchaseReceiptLine[] {
  const orderLineByProductId = new Map<string, PurchaseOrderLine>();
  for (const line of params.order.lines) {
    orderLineByProductId.set(line.productId, line);
  }

  const receiptLines: PurchaseReceiptLine[] = [];
  const aggregatedInputs = aggregateReceiptInputLines(params.inputLines);

  for (const input of aggregatedInputs) {
    const productId = input.productId;
    const orderLine = orderLineByProductId.get(productId);
    if (!orderLine) {
      throw new PurchaseReceiptFromOrderError("unknown_product");
    }

    const remaining = getPurchaseOrderLineRemainingQuantity(orderLine);
    if (remaining <= 0) continue;

    if (input.quantity > remaining) {
      throw new PurchaseReceiptFromOrderError("quantity_exceeds_remaining");
    }

    const quantity = roundInventoryQuantity(input.quantity);
    if (quantity <= 0) continue;

    const previouslyReceived = orderLine.receivedQuantity ?? 0;

    receiptLines.push({
      productId: orderLine.productId,
      productName: orderLine.productName,
      quantity,
      unit: orderLine.unit,
      orderedQuantity: orderLine.quantity,
      previouslyReceivedQuantity: previouslyReceived,
      remainingAfterQuantity: roundInventoryQuantity(
        Math.max(0, orderLine.quantity - previouslyReceived - quantity),
      ),
      estimatedUnitCost: orderLine.estimatedUnitCost ?? null,
      supplierName:
        orderLine.supplierName?.trim() || params.order.supplierName?.trim() || null,
    });
  }

  return receiptLines;
}

export class PurchaseReceiptFromOrderError extends Error {
  readonly code:
    | "auth_or_params_unavailable"
    | "order_not_found"
    | "order_invalid"
    | "order_not_receivable"
    | "empty_lines"
    | "quantity_exceeds_remaining"
    | "unknown_product";

  constructor(
    code: PurchaseReceiptFromOrderError["code"],
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PurchaseReceiptFromOrderError";
    this.code = code;
  }
}
