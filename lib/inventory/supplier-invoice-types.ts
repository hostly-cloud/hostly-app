import { readPurchaseDraftTimestampMs } from "@/lib/inventory/purchase-draft-types";
import { roundInventoryCost } from "@/lib/inventory/inventory-cost";
import {
  normalizeInventoryUnitAlias,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";
import type { PurchaseOrderDocument } from "@/lib/purchases/purchase-order-types";

export type SupplierInvoiceStatus = "draft" | "recorded";

export type SupplierInvoiceLine = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  realUnitCost: number;
  realTotalCost: number;
  previousUnitCost?: number | null;
  updatedInventoryUnitCost?: number | null;
  purchaseReceiptId?: string | null;
};

export type SupplierInvoiceDocument = {
  id: string;
  restaurantId: string;
  purchaseOrderId?: string;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: number | null;
  status: SupplierInvoiceStatus;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
  lines: SupplierInvoiceLine[];
  subtotal: number;
  total: number;
  notes?: string | null;
};

export type SupplierInvoiceLineInput = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  realUnitCost: number;
  realTotalCost?: number;
  purchaseReceiptId?: string | null;
};

const MAX_LINES = 200;
const MAX_NAME_LENGTH = 160;
const MAX_NOTES_LENGTH = 500;
const MAX_INVOICE_NUMBER_LENGTH = 64;

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

export function sanitizeSupplierInvoiceLine(raw: unknown): SupplierInvoiceLine | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const productId = readTrimmedString(rec.productId, 128);
  const productName = readTrimmedString(rec.productName, MAX_NAME_LENGTH);
  if (!productId || !productName) return null;

  const quantity = readFiniteNumber(rec.quantity);
  const realUnitCost = readFiniteNumber(rec.realUnitCost);
  if (quantity == null || quantity <= 0 || realUnitCost == null || realUnitCost <= 0) {
    return null;
  }

  const unitRaw = readTrimmedString(rec.unit, 16) ?? "ud";
  const unit = normalizeInventoryUnitAlias(unitRaw) || unitRaw;

  const realTotalCostRaw = rec.realTotalCost;
  const realTotalCost =
    realTotalCostRaw == null
      ? roundInventoryCost(quantity * realUnitCost)
      : readFiniteNumber(realTotalCostRaw);
  if (realTotalCost == null || realTotalCost <= 0) return null;

  const previousUnitCost = readFiniteNumber(rec.previousUnitCost);
  const updatedInventoryUnitCost = readFiniteNumber(rec.updatedInventoryUnitCost);

  return {
    productId,
    productName,
    quantity: roundInventoryQuantity(quantity),
    unit,
    realUnitCost: roundInventoryCost(realUnitCost),
    realTotalCost: roundInventoryCost(realTotalCost),
    previousUnitCost: previousUnitCost != null ? roundInventoryCost(previousUnitCost) : null,
    updatedInventoryUnitCost:
      updatedInventoryUnitCost != null
        ? roundInventoryCost(updatedInventoryUnitCost)
        : null,
    purchaseReceiptId: readTrimmedString(rec.purchaseReceiptId, 128),
  };
}

export function sanitizeSupplierInvoiceLines(raw: unknown): SupplierInvoiceLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: SupplierInvoiceLine[] = [];
  for (const item of raw) {
    if (lines.length >= MAX_LINES) break;
    const line = sanitizeSupplierInvoiceLine(item);
    if (line) lines.push(line);
  }
  return lines;
}

export function computeSupplierInvoiceTotals(lines: SupplierInvoiceLine[]): {
  subtotal: number;
  total: number;
} {
  let subtotal = 0;
  for (const line of lines) {
    subtotal += line.realTotalCost;
  }
  const rounded = roundInventoryCost(subtotal);
  return { subtotal: rounded, total: rounded };
}

export function sanitizeSupplierInvoiceLineInputs(
  raw: SupplierInvoiceLineInput[],
): SupplierInvoiceLine[] {
  const lines: SupplierInvoiceLine[] = [];
  for (const input of raw) {
    if (lines.length >= MAX_LINES) break;
    const parsed = sanitizeSupplierInvoiceLine({
      ...input,
      realTotalCost:
        input.realTotalCost ??
        roundInventoryCost(input.quantity * input.realUnitCost),
    });
    if (parsed) lines.push(parsed);
  }
  return lines;
}

export function normalizeSupplierInvoiceDocument(
  invoiceId: string,
  raw: unknown,
  restaurantId: string,
): SupplierInvoiceDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rid =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : restaurantId.trim();
  if (!rid || rid !== restaurantId.trim()) return null;

  const statusRaw = typeof data.status === "string" ? data.status.trim() : "";
  const status: SupplierInvoiceStatus =
    statusRaw === "recorded" ? "recorded" : "draft";

  const createdAt = readPurchaseDraftTimestampMs(data.createdAt);
  const updatedAt = readPurchaseDraftTimestampMs(data.updatedAt);
  if (createdAt == null) return null;

  const lines = sanitizeSupplierInvoiceLines(data.lines);
  if (lines.length === 0) return null;

  const totals = computeSupplierInvoiceTotals(lines);
  const subtotalRaw = readFiniteNumber(data.subtotal);
  const totalRaw = readFiniteNumber(data.total);

  return {
    id: invoiceId.trim(),
    restaurantId: rid,
    purchaseOrderId: readTrimmedString(data.purchaseOrderId, 128) ?? undefined,
    supplierName: readTrimmedString(data.supplierName, MAX_NAME_LENGTH),
    invoiceNumber: readTrimmedString(data.invoiceNumber, MAX_INVOICE_NUMBER_LENGTH),
    invoiceDate: readPurchaseDraftTimestampMs(data.invoiceDate) ?? undefined,
    status,
    createdAt,
    updatedAt: updatedAt ?? createdAt,
    createdBy: readTrimmedString(data.createdBy, 128) ?? undefined,
    updatedBy: readTrimmedString(data.updatedBy, 128) ?? undefined,
    lines,
    subtotal: subtotalRaw ?? totals.subtotal,
    total: totalRaw ?? totals.total,
    notes: readTrimmedString(data.notes, MAX_NOTES_LENGTH),
  };
}

export function buildSupplierInvoiceDraftLinesFromPurchaseOrder(
  order: PurchaseOrderDocument,
): SupplierInvoiceLineInput[] {
  const lines: SupplierInvoiceLineInput[] = [];
  for (const line of order.lines) {
    if (lines.length >= MAX_LINES) break;
    const received = line.receivedQuantity ?? 0;
    const quantity = received > 0 ? received : line.quantity;
    if (quantity <= 0) continue;

    const estimatedUnit =
      line.estimatedUnitCost != null && line.estimatedUnitCost > 0
        ? line.estimatedUnitCost
        : line.estimatedTotalCost != null && quantity > 0
          ? line.estimatedTotalCost / quantity
          : 0;

    lines.push({
      productId: line.productId,
      productName: line.productName,
      quantity,
      unit: line.unit,
      realUnitCost: roundInventoryCost(Math.max(0.0001, estimatedUnit)),
      realTotalCost:
        line.estimatedTotalCost != null && received <= 0
          ? line.estimatedTotalCost
          : roundInventoryCost(quantity * Math.max(0.0001, estimatedUnit)),
    });
  }
  return lines;
}

export class SupplierInvoiceError extends Error {
  readonly code:
    | "auth_or_params_unavailable"
    | "invoice_not_found"
    | "invoice_invalid"
    | "already_recorded"
    | "empty_lines"
    | "cost_apply_failed";

  constructor(code: SupplierInvoiceError["code"], message?: string) {
    super(message ?? code);
    this.name = "SupplierInvoiceError";
    this.code = code;
  }
}
