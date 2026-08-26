import type { PurchaseRiskLevel } from "@/lib/inventory/purchase-intelligence";
import {
  readPurchaseDraftTimestampMs,
  type PurchaseDraftDocument,
} from "@/lib/inventory/purchase-draft-types";
import type { SuggestedPurchaseDraftLine } from "@/lib/inventory/suggested-purchase-draft";
import {
  normalizeInventoryUnitAlias,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";
export type PurchaseOrderSource = "purchase_draft" | "manual";

export type PurchaseOrderLine = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  receivedQuantity?: number;
  estimatedUnitCost?: number | null;
  estimatedTotalCost?: number | null;
  supplierName?: string | null;
  currentStock?: number | null;
  averageDailyConsumption?: number | null;
  riskLevel?: PurchaseRiskLevel | null;
};

export type PurchaseOrderDocument = {
  id: string;
  restaurantId: string;
  status: PurchaseOrderStatus;
  source: PurchaseOrderSource;
  purchaseDraftId?: string;
  supplierName?: string | null;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
  orderedAt?: number;
  orderedBy?: string;
  lines: PurchaseOrderLine[];
  totalEstimatedCost: number | null;
  notes?: string | null;
};

const VALID_STATUSES = new Set<PurchaseOrderStatus>([
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
]);

const VALID_RISK_LEVELS = new Set<PurchaseRiskLevel>([
  "out",
  "urgent",
  "soon",
  "watch",
  "ok",
  "unknown",
]);

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

function sanitizeRiskLevel(value: unknown): PurchaseRiskLevel | null {
  const key = typeof value === "string" ? value.trim() : "";
  if (VALID_RISK_LEVELS.has(key as PurchaseRiskLevel)) {
    return key as PurchaseRiskLevel;
  }
  return null;
}

export function sanitizePurchaseOrderLine(raw: unknown): PurchaseOrderLine | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const productId = readTrimmedString(rec.productId, 128);
  const productName = readTrimmedString(rec.productName, MAX_NAME_LENGTH);
  if (!productId || !productName) return null;

  const quantity = readFiniteNumber(rec.quantity);
  if (quantity == null || quantity <= 0) return null;

  const unitRaw = readTrimmedString(rec.unit, 16) ?? "ud";
  const unit = normalizeInventoryUnitAlias(unitRaw) || unitRaw;

  const estimatedUnitCostRaw = rec.estimatedUnitCost;
  const estimatedUnitCost =
    estimatedUnitCostRaw == null ? null : readFiniteNumber(estimatedUnitCostRaw);

  const estimatedTotalCostRaw = rec.estimatedTotalCost;
  const estimatedTotalCost =
    estimatedTotalCostRaw == null ? null : readFiniteNumber(estimatedTotalCostRaw);

  const currentStockRaw = rec.currentStock;
  const currentStock =
    currentStockRaw == null ? null : readFiniteNumber(currentStockRaw);

  const averageDailyConsumptionRaw = rec.averageDailyConsumption;
  const averageDailyConsumption =
    averageDailyConsumptionRaw == null
      ? null
      : readFiniteNumber(averageDailyConsumptionRaw);

  const receivedQuantityRaw = rec.receivedQuantity;
  const receivedQuantity =
    receivedQuantityRaw == null ? 0 : readFiniteNumber(receivedQuantityRaw);
  const safeReceived =
    receivedQuantity != null && receivedQuantity >= 0
      ? roundInventoryQuantity(Math.min(receivedQuantity, quantity))
      : 0;

  return {
    productId,
    productName,
    quantity: roundInventoryQuantity(quantity),
    unit,
    receivedQuantity: safeReceived,
    estimatedUnitCost:
      estimatedUnitCost != null && estimatedUnitCost >= 0
        ? roundInventoryQuantity(estimatedUnitCost)
        : null,
    estimatedTotalCost:
      estimatedTotalCost != null && estimatedTotalCost >= 0
        ? roundInventoryQuantity(estimatedTotalCost)
        : null,
    supplierName: readTrimmedString(rec.supplierName, MAX_NAME_LENGTH),
    currentStock:
      currentStock != null ? roundInventoryQuantity(Math.max(0, currentStock)) : null,
    averageDailyConsumption:
      averageDailyConsumption != null && averageDailyConsumption > 0
        ? roundInventoryQuantity(averageDailyConsumption)
        : null,
    riskLevel: sanitizeRiskLevel(rec.riskLevel),
  };
}

export function sanitizePurchaseOrderLines(raw: unknown): PurchaseOrderLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: PurchaseOrderLine[] = [];
  for (const item of raw) {
    if (lines.length >= MAX_LINES) break;
    const line = sanitizePurchaseOrderLine(item);
    if (line) lines.push(line);
  }
  return lines;
}

export function computePurchaseOrderTotalEstimatedCost(
  lines: PurchaseOrderLine[],
): number | null {
  let total = 0;
  let hasAny = false;
  for (const line of lines) {
    if (line.estimatedTotalCost != null && line.estimatedTotalCost >= 0) {
      total += line.estimatedTotalCost;
      hasAny = true;
    }
  }
  return hasAny ? roundInventoryQuantity(total) : null;
}

export function mapDraftLineToPurchaseOrderLine(
  line: SuggestedPurchaseDraftLine,
): PurchaseOrderLine | null {
  const quantity = line.editableQuantity;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const estimatedTotalCost =
    line.estimatedCost != null && line.estimatedCost >= 0 ? line.estimatedCost : null;
  const estimatedUnitCost =
    estimatedTotalCost != null && quantity > 0
      ? roundInventoryQuantity(estimatedTotalCost / quantity)
      : null;

  return {
    productId: line.productId,
    productName: line.productName,
    quantity: roundInventoryQuantity(quantity),
    unit: line.unit,
    estimatedUnitCost,
    estimatedTotalCost,
    supplierName: line.supplierName?.trim() || null,
    currentStock: line.currentStock,
    averageDailyConsumption: line.averageDailyConsumption,
    riskLevel: line.riskLevel,
  };
}

export function mapDraftLinesToPurchaseOrderLines(
  lines: SuggestedPurchaseDraftLine[],
): PurchaseOrderLine[] {
  const result: PurchaseOrderLine[] = [];
  for (const line of lines) {
    if (result.length >= MAX_LINES) break;
    const mapped = mapDraftLineToPurchaseOrderLine(line);
    if (mapped) result.push(mapped);
  }
  return result;
}

export function normalizePurchaseOrderDocument(
  orderId: string,
  raw: unknown,
  restaurantId: string,
): PurchaseOrderDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rid =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : restaurantId.trim();
  if (!rid || rid !== restaurantId.trim()) return null;

  const statusRaw = typeof data.status === "string" ? data.status.trim() : "";
  const status: PurchaseOrderStatus = VALID_STATUSES.has(statusRaw as PurchaseOrderStatus)
    ? (statusRaw as PurchaseOrderStatus)
    : "draft";

  const sourceRaw = typeof data.source === "string" ? data.source.trim() : "";
  const source: PurchaseOrderSource = sourceRaw === "manual" ? "manual" : "purchase_draft";

  const purchaseDraftId = readTrimmedString(data.purchaseDraftId, 128) ?? undefined;
  if (source === "purchase_draft" && !purchaseDraftId) return null;

  const createdAt = readPurchaseDraftTimestampMs(data.createdAt);
  const updatedAt = readPurchaseDraftTimestampMs(data.updatedAt);
  if (createdAt == null) return null;

  const lines = sanitizePurchaseOrderLines(data.lines);
  if (lines.length === 0) return null;

  const totalRaw = data.totalEstimatedCost;
  const totalEstimatedCost =
    totalRaw == null ? computePurchaseOrderTotalEstimatedCost(lines) : readFiniteNumber(totalRaw);

  return {
    id: orderId.trim(),
    restaurantId: rid,
    status,
    source,
    ...(purchaseDraftId ? { purchaseDraftId } : {}),
    supplierName: readTrimmedString(data.supplierName, MAX_NAME_LENGTH),
    createdAt,
    updatedAt: updatedAt ?? createdAt,
    createdBy: readTrimmedString(data.createdBy, 128) ?? undefined,
    updatedBy: readTrimmedString(data.updatedBy, 128) ?? undefined,
    orderedAt: readPurchaseDraftTimestampMs(data.orderedAt) ?? undefined,
    orderedBy: readTrimmedString(data.orderedBy, 128) ?? undefined,
    lines,
    totalEstimatedCost,
    notes: readTrimmedString(data.notes, MAX_NOTES_LENGTH),
  };
}

export function buildPurchaseOrderWritePayloadFromDraft(params: {
  restaurantId: string;
  draft: PurchaseDraftDocument;
  userId?: string;
}): Record<string, unknown> {
  const lines = mapDraftLinesToPurchaseOrderLines(params.draft.lines);
  if (lines.length === 0) {
    throw new Error("buildPurchaseOrderWritePayloadFromDraft: empty_lines");
  }

  const uid = params.userId?.trim() || undefined;
  const uniqueSuppliers = new Set(
    lines.map((line) => line.supplierName?.trim()).filter(Boolean),
  );
  const supplierName =
    uniqueSuppliers.size === 1 ? [...uniqueSuppliers][0] ?? null : null;

  return {
    restaurantId: params.restaurantId.trim(),
    status: "draft" satisfies PurchaseOrderStatus,
    source: "purchase_draft" satisfies PurchaseOrderSource,
    purchaseDraftId: params.draft.id.trim(),
    ...(supplierName ? { supplierName } : {}),
    lines,
    totalEstimatedCost: computePurchaseOrderTotalEstimatedCost(lines),
    ...(params.draft.notes?.trim()
      ? { notes: params.draft.notes.trim().slice(0, MAX_NOTES_LENGTH) }
      : {}),
    ...(uid ? { createdBy: uid, updatedBy: uid } : {}),
  };
}

export class PurchaseOrderFromDraftError extends Error {
  readonly code:
    | "auth_or_params_unavailable"
    | "draft_not_found"
    | "draft_already_linked"
    | "draft_invalid"
    | "empty_lines";

  constructor(
    code: PurchaseOrderFromDraftError["code"],
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PurchaseOrderFromDraftError";
    this.code = code;
  }
}

export function getPurchaseOrderLineRemainingQuantity(line: PurchaseOrderLine): number {
  const ordered = line.quantity;
  const received = line.receivedQuantity ?? 0;
  return roundInventoryQuantity(Math.max(0, ordered - received));
}

export function isPurchaseOrderReceivableStatus(status: PurchaseOrderStatus): boolean {
  return status === "draft" || status === "ordered" || status === "partially_received";
}

export function computePurchaseOrderStatusFromLines(
  lines: PurchaseOrderLine[],
): PurchaseOrderStatus {
  if (lines.length === 0) return "draft";

  let anyReceived = false;
  let allComplete = true;

  for (const line of lines) {
    const received = line.receivedQuantity ?? 0;
    if (received > 0) anyReceived = true;
    if (received < line.quantity) allComplete = false;
  }

  if (allComplete && anyReceived) return "received";
  if (anyReceived) return "partially_received";
  return "draft";
}

export function purchaseOrderStatusLabel(status: PurchaseOrderStatus): string {
  switch (status) {
    case "draft":
      return "Borrador";
    case "ordered":
      return "Enviado al proveedor";
    case "partially_received":
      return "Recepción parcial";
    case "received":
      return "Recibido";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
}

export function canMarkPurchaseOrderAsOrdered(status: PurchaseOrderStatus): boolean {
  return status === "draft";
}

export function canPreparePurchaseOrderShipment(status: PurchaseOrderStatus): boolean {
  return status === "draft" || status === "ordered";
}
