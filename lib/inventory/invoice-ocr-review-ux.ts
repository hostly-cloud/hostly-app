import type { ExtractedInvoiceLineDraft } from "@/lib/inventory/extracted-invoice-to-supplier-invoice";
import type { ExtractedInvoiceValidationSummary } from "@/lib/inventory/extracted-invoice-to-supplier-invoice";
import type { SupplierInvoiceExtractionMeta } from "@/lib/inventory/extracted-supplier-invoice-types";
import {
  calculateProductMatchConfidence,
  normalizeSupplierProductText,
} from "@/lib/inventory/invoice-product-matching";

export const SIMILAR_LINES_APPLY_THRESHOLD = 0.72;

export type LineVisualKind =
  | "learned"
  | "high_match"
  | "manual_review"
  | "pending"
  | "no_product"
  | "excluded"
  | "ready";

export type LineVisualState = {
  kind: LineVisualKind;
  label: string;
};

export type LineVisualContext = {
  manuallyEditedProduct?: boolean;
  matchedViaLearnedAlias?: boolean;
};

export type ReviewKpiSummary = {
  totalLines: number;
  readyCount: number;
  pendingCount: number;
  excludedCount: number;
  totalAmount: number;
};

export type ExtractionStatusBadge = {
  label: string;
  sublabel?: string;
  tone: "success" | "warning" | "muted" | "demo";
  warnings: string[];
};

export type SessionLearningEntry = {
  id: string;
  rawText: string;
  productName: string;
};

export type InvoiceOcrFieldId = "product" | "quantity" | "unit" | "unitPrice";

export function getLineMatchText(line: Pick<ExtractedInvoiceLineDraft, "rawText" | "detectedProductName">): string {
  return line.rawText?.trim() || line.detectedProductName?.trim() || "";
}

export function resolveLineVisualState(
  line: ExtractedInvoiceLineDraft,
  validation: ExtractedInvoiceValidationSummary["lineResults"][number] | undefined,
  context?: LineVisualContext,
): LineVisualState {
  if (!line.included) {
    return { kind: "excluded", label: "— Excluida" };
  }

  if (!line.matchedInventoryProductId) {
    return { kind: "no_product", label: "× Sin producto" };
  }

  if (validation?.pending || !validation?.isValid) {
    return { kind: "pending", label: "! Pendiente" };
  }

  if (context?.manuallyEditedProduct) {
    return { kind: "manual_review", label: "✓ Revisado manualmente" };
  }

  if (context?.matchedViaLearnedAlias) {
    return { kind: "learned", label: "✓ Aprendido" };
  }

  if (line.status === "matched" && (line.confidence ?? 0) >= 0.75) {
    return { kind: "high_match", label: "✓ Coincidencia alta" };
  }

  return { kind: "ready", label: "✓ Lista" };
}

export function computeReviewKpiSummary(
  lineRows: readonly ExtractedInvoiceLineDraft[],
  validation: ExtractedInvoiceValidationSummary,
  totalAmount: number,
): ReviewKpiSummary {
  let readyCount = 0;
  let pendingCount = 0;
  let excludedCount = 0;

  for (const result of validation.lineResults) {
    if (!result.included) {
      excludedCount += 1;
    } else if (result.isValid) {
      readyCount += 1;
    } else if (result.pending) {
      pendingCount += 1;
    }
  }

  return {
    totalLines: lineRows.length,
    readyCount,
    pendingCount,
    excludedCount,
    totalAmount,
  };
}

export function findSimilarPendingLineKeys(
  sourceRowKey: string,
  lines: ReadonlyArray<ExtractedInvoiceLineDraft & { rowKey: string }>,
  validation: ExtractedInvoiceValidationSummary,
): string[] {
  const sourceIndex = lines.findIndex((line) => line.rowKey === sourceRowKey);
  if (sourceIndex < 0) return [];

  const sourceLine = lines[sourceIndex]!;
  const sourceText = getLineMatchText(sourceLine);
  if (!sourceText) return [];

  const sourceNorm = normalizeSupplierProductText(sourceText);
  const keys: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (index === sourceIndex) continue;
    const result = validation.lineResults[index];
    if (!result?.included || !result.pending) continue;

    const line = lines[index]!;
    const text = getLineMatchText(line);
    if (!text) continue;

    const confidence = calculateProductMatchConfidence(sourceText, text);
    const sameNorm = normalizeSupplierProductText(text) === sourceNorm;
    if (sameNorm || confidence >= SIMILAR_LINES_APPLY_THRESHOLD) {
      keys.push(line.rowKey);
    }
  }

  return keys;
}

export function findNextPendingRowKey(
  lines: ReadonlyArray<ExtractedInvoiceLineDraft & { rowKey: string }>,
  validation: ExtractedInvoiceValidationSummary,
  afterRowKey?: string,
): string | null {
  const startIndex = afterRowKey ? lines.findIndex((line) => line.rowKey === afterRowKey) + 1 : 0;

  for (let index = Math.max(0, startIndex); index < lines.length; index += 1) {
    const result = validation.lineResults[index];
    if (result?.pending) return lines[index]!.rowKey;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const result = validation.lineResults[index];
    if (result?.pending) return lines[index]!.rowKey;
  }

  return null;
}

export function getIncludedRowKeys(
  lines: ReadonlyArray<ExtractedInvoiceLineDraft & { rowKey: string }>,
): string[] {
  return lines.filter((line) => line.included !== false).map((line) => line.rowKey);
}

export function getAdjacentIncludedRowKey(
  lines: ReadonlyArray<ExtractedInvoiceLineDraft & { rowKey: string }>,
  currentRowKey: string,
  direction: "up" | "down",
): string | null {
  const included = getIncludedRowKeys(lines);
  const index = included.indexOf(currentRowKey);
  if (index < 0) {
    return direction === "down" ? (included[0] ?? null) : (included[included.length - 1] ?? null);
  }
  const nextIndex = direction === "down" ? index + 1 : index - 1;
  return included[nextIndex] ?? null;
}

export function getNextFieldInRow(field: InvoiceOcrFieldId): InvoiceOcrFieldId | null {
  switch (field) {
    case "product":
      return "quantity";
    case "quantity":
      return "unit";
    case "unit":
      return "unitPrice";
    default:
      return null;
  }
}

export function appendSessionLearningEntry(
  entries: SessionLearningEntry[],
  rawText: string,
  productName: string,
): SessionLearningEntry[] {
  const trimmedRaw = rawText.trim();
  const trimmedProduct = productName.trim();
  if (!trimmedRaw || !trimmedProduct) return entries;

  const next = [
    { id: `${Date.now()}-${trimmedRaw}`, rawText: trimmedRaw.slice(0, 48), productName: trimmedProduct },
    ...entries.filter((entry) => entry.rawText !== trimmedRaw.slice(0, 48)),
  ];
  return next.slice(0, 5);
}

export function getExtractionStatusBadge(
  isDemo: boolean,
  meta: SupplierInvoiceExtractionMeta | null,
): ExtractionStatusBadge | null {
  if (isDemo) {
    return {
      label: "Demo QA",
      tone: "demo",
      warnings: meta?.warnings ?? [],
    };
  }
  if (!meta) return null;

  switch (meta.source) {
    case "vision_ai":
      return {
        label: "Vision + IA",
        tone: "success",
        warnings: meta.warnings,
      };
    case "mock_fallback":
      return {
        label: "Mock fallback",
        sublabel: "Fallback",
        tone: "warning",
        warnings: meta.warnings,
      };
    case "demo":
      return {
        label: "Demo QA",
        tone: "demo",
        warnings: meta.warnings,
      };
    default:
      return {
        label: meta.source,
        tone: "muted",
        warnings: meta.warnings,
      };
  }
}
