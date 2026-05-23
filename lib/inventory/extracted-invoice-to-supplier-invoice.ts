import type { ExtractedSupplierInvoiceDraft, ExtractedSupplierInvoiceLine } from "@/lib/inventory/extracted-supplier-invoice-types";
import { roundInventoryCost } from "@/lib/inventory/inventory-cost";
import type { CreateSupplierInvoiceParams } from "@/lib/firestore/supplier-invoices";
import {
  type SupplierInvoiceLineInput,
} from "@/lib/inventory/supplier-invoice-types";
import { normalizeInventoryUnitAlias, roundInventoryQuantity } from "@/lib/inventory/unit-conversions";

export type ExtractedInvoiceLineDraft = ExtractedSupplierInvoiceLine & {
  included: boolean;
};

export type ExtractedLineValidationIssue =
  | "missing_product"
  | "invalid_quantity"
  | "invalid_unit"
  | "invalid_cost";

export type ExtractedLineValidationResult = {
  index: number;
  included: boolean;
  isValid: boolean;
  pending: boolean;
  issues: ExtractedLineValidationIssue[];
};

export type ExtractedInvoiceValidationSummary = {
  lineResults: ExtractedLineValidationResult[];
  validIncludedCount: number;
  invalidIncludedCount: number;
  excludedCount: number;
  canRegister: boolean;
  blockingReason: string | null;
};

function readFinitePositive(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseInvoiceDateMs(isoDate: string | undefined): number | null {
  const trimmed = isoDate?.trim();
  if (!trimmed) return null;
  const ms = new Date(`${trimmed}T12:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function resolveInventoryUnit(unit: string | undefined): string | null {
  const raw = unit?.trim();
  if (!raw) return null;
  const normalized = normalizeInventoryUnitAlias(raw);
  return normalized || raw;
}

function validateSingleExtractedLine(
  line: ExtractedInvoiceLineDraft,
  index: number,
): ExtractedLineValidationResult {
  const included = line.included !== false;
  const issues: ExtractedLineValidationIssue[] = [];

  const productId = line.matchedInventoryProductId?.trim();
  if (!productId) {
    issues.push("missing_product");
  }

  const quantity = readFinitePositive(line.quantity);
  if (!quantity) {
    issues.push("invalid_quantity");
  }

  const unit = resolveInventoryUnit(line.unit);
  if (!unit) {
    issues.push("invalid_unit");
  }

  const unitPrice = readFinitePositive(line.unitPrice);
  const totalPrice = readFinitePositive(line.totalPrice);
  if (!unitPrice && !totalPrice) {
    issues.push("invalid_cost");
  }

  const isValid = issues.length === 0;
  return {
    index,
    included,
    isValid,
    pending: included && !isValid,
    issues,
  };
}

export function validateExtractedInvoiceLinesForRecording(
  lines: readonly ExtractedInvoiceLineDraft[],
): ExtractedInvoiceValidationSummary {
  const lineResults = lines.map((line, index) => validateSingleExtractedLine(line, index));
  const validIncludedCount = lineResults.filter((row) => row.included && row.isValid).length;
  const invalidIncludedCount = lineResults.filter((row) => row.pending).length;
  const excludedCount = lineResults.filter((row) => !row.included).length;

  let blockingReason: string | null = null;
  if (validIncludedCount === 0) {
    blockingReason = "Incluye al menos una línea válida con producto Hostly, cantidad y coste.";
  } else if (invalidIncludedCount > 0) {
    blockingReason = `${invalidIncludedCount} línea(s) incluida(s) están pendientes de revisión. Corrígelas o desmárcalas.`;
  }

  return {
    lineResults,
    validIncludedCount,
    invalidIncludedCount,
    excludedCount,
    canRegister: blockingReason == null,
    blockingReason,
  };
}

function mapExtractedLineToSupplierInput(
  line: ExtractedInvoiceLineDraft,
): SupplierInvoiceLineInput | null {
  const productId = line.matchedInventoryProductId?.trim();
  const productName =
    line.matchedInventoryProductName?.trim() ||
    line.detectedProductName?.trim() ||
    line.rawText?.trim();
  const quantity = readFinitePositive(line.quantity);
  const unit = resolveInventoryUnit(line.unit);

  if (!productId || !productName || !quantity || !unit) return null;

  const unitPrice = readFinitePositive(line.unitPrice);
  const totalPrice = readFinitePositive(line.totalPrice);

  let realUnitCost = unitPrice ?? 0;
  let realTotalCost = totalPrice ?? 0;

  if (realUnitCost <= 0 && realTotalCost > 0) {
    realUnitCost = realTotalCost / quantity;
  } else if (realUnitCost > 0 && realTotalCost <= 0) {
    realTotalCost = quantity * realUnitCost;
  }

  if (realUnitCost <= 0 || realTotalCost <= 0) return null;

  return {
    productId,
    productName: productName.slice(0, 160),
    quantity: roundInventoryQuantity(quantity),
    unit,
    realUnitCost: roundInventoryCost(realUnitCost),
    realTotalCost: roundInventoryCost(realTotalCost),
  };
}

export function calculateExtractedInvoiceTotals(
  lines: readonly ExtractedInvoiceLineDraft[],
): { subtotal: number; total: number; validIncludedCount: number } {
  const validation = validateExtractedInvoiceLinesForRecording(lines);
  const supplierLines: SupplierInvoiceLineInput[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const result = validation.lineResults[index];
    if (!result?.included || !result.isValid) continue;
    const mapped = mapExtractedLineToSupplierInput(lines[index]!);
    if (mapped) supplierLines.push(mapped);
  }

  let subtotal = 0;
  for (const line of supplierLines) {
    subtotal += line.realTotalCost ?? roundInventoryCost(line.quantity * line.realUnitCost);
  }
  const rounded = roundInventoryCost(subtotal);

  return {
    subtotal: rounded,
    total: rounded,
    validIncludedCount: validation.validIncludedCount,
  };
}

export function buildSupplierInvoiceInputFromExtractedDraft(params: {
  restaurantId: string;
  draft: ExtractedSupplierInvoiceDraft;
  lines: readonly ExtractedInvoiceLineDraft[];
  notes?: string | null;
}): CreateSupplierInvoiceParams {
  const validation = validateExtractedInvoiceLinesForRecording(params.lines);
  if (!validation.canRegister) {
    throw new Error(validation.blockingReason ?? "INVALID_EXTRACTED_INVOICE");
  }

  const lineInputs: SupplierInvoiceLineInput[] = [];
  for (let index = 0; index < params.lines.length; index += 1) {
    const result = validation.lineResults[index];
    if (!result?.included || !result.isValid) continue;
    const mapped = mapExtractedLineToSupplierInput(params.lines[index]!);
    if (mapped) lineInputs.push(mapped);
  }

  if (lineInputs.length === 0) {
    throw new Error("No hay líneas válidas para registrar.");
  }

  return {
    restaurantId: params.restaurantId.trim(),
    supplierName: params.draft.supplierName?.trim() || null,
    invoiceNumber: params.draft.invoiceNumber?.trim() || null,
    invoiceDate: parseInvoiceDateMs(params.draft.invoiceDate),
    notes: params.notes?.trim() || "Registrada desde OCR (revisión manual)",
    lines: lineInputs,
  };
}
