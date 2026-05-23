import type { PurchaseRiskLevel } from "@/lib/inventory/purchase-intelligence";
import {
  computeSuggestedDraftTotalEstimatedCost,
  type SuggestedPurchaseDraft,
  type SuggestedPurchaseDraftLine,
} from "@/lib/inventory/suggested-purchase-draft";
import {
  normalizeInventoryUnitAlias,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";
import { Timestamp } from "firebase/firestore";

export type PurchaseDraftStatus = "draft" | "archived";
export type PurchaseDraftSource = "purchase_intelligence";

export type PurchaseDraftDocument = {
  id: string;
  restaurantId: string;
  status: PurchaseDraftStatus;
  source: PurchaseDraftSource;
  targetCoverageDays: number;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
  lines: SuggestedPurchaseDraftLine[];
  totalEstimatedCost: number | null;
  notes?: string | null;
  linkedPurchaseOrderId?: string;
  archivedAt?: number;
};

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

export function readPurchaseDraftTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Timestamp) return value.toMillis();
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return null;
}

function sanitizeRiskLevel(value: unknown): PurchaseRiskLevel {
  const key = typeof value === "string" ? value.trim() : "";
  if (VALID_RISK_LEVELS.has(key as PurchaseRiskLevel)) {
    return key as PurchaseRiskLevel;
  }
  return "unknown";
}

export function sanitizePurchaseDraftLine(raw: unknown): SuggestedPurchaseDraftLine | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const productId = readTrimmedString(rec.productId, 128);
  const productName = readTrimmedString(rec.productName, MAX_NAME_LENGTH);
  if (!productId || !productName) return null;

  const unitRaw = readTrimmedString(rec.unit, 16) ?? "ud";
  const unit = normalizeInventoryUnitAlias(unitRaw) || unitRaw;

  const averageDailyConsumption = readFiniteNumber(rec.averageDailyConsumption);
  const suggestedQuantity = readFiniteNumber(rec.suggestedQuantity);
  const editableQuantity = readFiniteNumber(rec.editableQuantity);
  const targetCoverageDays = readFiniteNumber(rec.targetCoverageDays);

  if (
    averageDailyConsumption == null ||
    averageDailyConsumption <= 0 ||
    suggestedQuantity == null ||
    editableQuantity == null ||
    targetCoverageDays == null ||
    targetCoverageDays <= 0
  ) {
    return null;
  }

  const currentStockRaw = rec.currentStock;
  const currentStock =
    currentStockRaw == null
      ? null
      : readFiniteNumber(currentStockRaw);

  const estimatedCostRaw = rec.estimatedCost;
  const estimatedCost =
    estimatedCostRaw == null ? null : readFiniteNumber(estimatedCostRaw);

  return {
    productId,
    productName,
    supplierName: readTrimmedString(rec.supplierName, MAX_NAME_LENGTH),
    productFamilyName: readTrimmedString(rec.productFamilyName, MAX_NAME_LENGTH),
    productKind: readTrimmedString(rec.productKind, 64),
    currentStock: currentStock != null ? roundInventoryQuantity(Math.max(0, currentStock)) : null,
    unit,
    averageDailyConsumption: roundInventoryQuantity(averageDailyConsumption),
    targetCoverageDays: Math.max(1, Math.floor(targetCoverageDays)),
    suggestedQuantity: roundInventoryQuantity(Math.max(0, suggestedQuantity)),
    editableQuantity: roundInventoryQuantity(Math.max(0, editableQuantity)),
    estimatedCost:
      estimatedCost != null && estimatedCost >= 0
        ? roundInventoryQuantity(estimatedCost)
        : null,
    riskLevel: sanitizeRiskLevel(rec.riskLevel),
  };
}

export function sanitizePurchaseDraftLines(raw: unknown): SuggestedPurchaseDraftLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: SuggestedPurchaseDraftLine[] = [];
  for (const item of raw) {
    if (lines.length >= MAX_LINES) break;
    const line = sanitizePurchaseDraftLine(item);
    if (line) lines.push(line);
  }
  return lines;
}

export function normalizePurchaseDraftDocument(
  draftId: string,
  raw: unknown,
  restaurantId: string,
): PurchaseDraftDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rid =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : restaurantId.trim();
  if (!rid || rid !== restaurantId.trim()) return null;

  const statusRaw = typeof data.status === "string" ? data.status.trim() : "";
  const status: PurchaseDraftStatus =
    statusRaw === "archived" ? "archived" : "draft";

  const sourceRaw = typeof data.source === "string" ? data.source.trim() : "";
  const source: PurchaseDraftSource =
    sourceRaw === "purchase_intelligence" ? "purchase_intelligence" : "purchase_intelligence";

  const targetCoverageDays = readFiniteNumber(data.targetCoverageDays);
  const createdAt = readPurchaseDraftTimestampMs(data.createdAt);
  const updatedAt = readPurchaseDraftTimestampMs(data.updatedAt);
  if (targetCoverageDays == null || targetCoverageDays <= 0 || createdAt == null) {
    return null;
  }

  const lines = sanitizePurchaseDraftLines(data.lines);
  if (lines.length === 0) return null;

  const totalRaw = data.totalEstimatedCost;
  const totalEstimatedCost =
    totalRaw == null ? computeSuggestedDraftTotalEstimatedCost(lines) : readFiniteNumber(totalRaw);

  const linkedPurchaseOrderId = readTrimmedString(data.linkedPurchaseOrderId, 128) ?? undefined;
  const archivedAt = readPurchaseDraftTimestampMs(data.archivedAt) ?? undefined;

  return {
    id: draftId.trim(),
    restaurantId: rid,
    status,
    source,
    targetCoverageDays: Math.max(1, Math.floor(targetCoverageDays)),
    createdAt,
    updatedAt: updatedAt ?? createdAt,
    createdBy: readTrimmedString(data.createdBy, 128) ?? undefined,
    updatedBy: readTrimmedString(data.updatedBy, 128) ?? undefined,
    lines,
    totalEstimatedCost,
    notes: readTrimmedString(data.notes, MAX_NOTES_LENGTH),
    linkedPurchaseOrderId,
    archivedAt,
  };
}

export function purchaseDraftDocumentToSuggestedDraft(
  doc: PurchaseDraftDocument,
): SuggestedPurchaseDraft {
  return {
    createdAt: doc.createdAt,
    targetCoverageDays: doc.targetCoverageDays,
    lines: doc.lines,
  };
}

export function sanitizeDraftForPersistence(draft: SuggestedPurchaseDraft): {
  targetCoverageDays: number;
  lines: SuggestedPurchaseDraftLine[];
  totalEstimatedCost: number | null;
} {
  const lines = sanitizePurchaseDraftLines(draft.lines);
  const targetCoverageDays = Math.max(1, Math.floor(draft.targetCoverageDays));
  return {
    targetCoverageDays,
    lines,
    totalEstimatedCost: computeSuggestedDraftTotalEstimatedCost(lines),
  };
}

export function buildPurchaseDraftWritePayload(params: {
  restaurantId: string;
  draft: SuggestedPurchaseDraft;
  status?: PurchaseDraftStatus;
  notes?: string | null;
  userId?: string;
  preserveCreatedAt?: number;
  preserveCreatedBy?: string;
}): Record<string, unknown> {
  const sanitized = sanitizeDraftForPersistence(params.draft);
  const now = Date.now();
  const uid = params.userId?.trim() || undefined;

  return {
    restaurantId: params.restaurantId.trim(),
    status: params.status ?? "draft",
    source: "purchase_intelligence" satisfies PurchaseDraftSource,
    targetCoverageDays: sanitized.targetCoverageDays,
    createdAt: params.preserveCreatedAt ?? now,
    updatedAt: now,
    ...(params.preserveCreatedBy ? { createdBy: params.preserveCreatedBy } : uid ? { createdBy: uid } : {}),
    ...(uid ? { updatedBy: uid } : {}),
    lines: sanitized.lines,
    totalEstimatedCost: sanitized.totalEstimatedCost,
    ...(params.notes?.trim()
      ? { notes: params.notes.trim().slice(0, MAX_NOTES_LENGTH) }
      : {}),
  };
}
