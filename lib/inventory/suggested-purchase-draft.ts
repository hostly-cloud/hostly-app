import {
  calculateInventoryUnitCost,
  convertCostToConsumptionUnit,
  normalizePurchaseCostInput,
  readStoredUnitCostUnit,
  roundInventoryCost,
  type PurchaseUnit,
  type UnitCostBaseUnit,
} from "@/lib/inventory/inventory-cost";
import type { PurchaseIntelligenceRow, PurchaseRiskLevel } from "@/lib/inventory/purchase-intelligence";
import {
  normalizeInventoryUnitAlias,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";

export const DEFAULT_SUGGESTED_DRAFT_RISK_LEVELS: PurchaseRiskLevel[] = [
  "out",
  "urgent",
  "soon",
];

export const SUGGESTED_DRAFT_COVERAGE_OPTIONS = [3, 7, 14] as const;
export type SuggestedDraftCoverageDays = (typeof SUGGESTED_DRAFT_COVERAGE_OPTIONS)[number];

export type SuggestedPurchaseCostInput = {
  purchaseCost?: number | null;
  purchaseQuantity?: number | null;
  purchaseUnit?: PurchaseUnit | string | null;
  unitCost?: number | null;
  unitCostUnit?: UnitCostBaseUnit | string | null;
};

export type SuggestedPurchaseDraftLine = {
  productId: string;
  productName: string;
  supplierName?: string | null;
  productFamilyName?: string | null;
  productKind?: string | null;
  currentStock: number | null;
  unit: string;
  averageDailyConsumption: number;
  targetCoverageDays: number;
  suggestedQuantity: number;
  editableQuantity: number;
  estimatedCost: number | null;
  riskLevel: PurchaseRiskLevel;
};

export type SuggestedPurchaseDraft = {
  createdAt: number;
  targetCoverageDays: number;
  lines: SuggestedPurchaseDraftLine[];
};

export type SuggestedPurchaseDraftSourceLine = PurchaseIntelligenceRow & {
  supplierName?: string | null;
  productFamilyName?: string | null;
  productKind?: string | null;
  purchaseCost?: number | null;
  purchaseQuantity?: number | null;
  purchaseUnit?: PurchaseUnit | string | null;
  unitCost?: number | null;
  unitCostUnit?: UnitCostBaseUnit | string | null;
};

export type BuildSuggestedPurchaseDraftParams = {
  rows: SuggestedPurchaseDraftSourceLine[];
  targetCoverageDays: number;
  riskLevels?: PurchaseRiskLevel[];
  createdAt?: number;
};

export function calculateSuggestedPurchaseQuantity(params: {
  averageDailyConsumption: number;
  targetCoverageDays: number;
  currentStock: number | null;
}): number {
  const daily = params.averageDailyConsumption;
  const days = Math.max(1, Math.floor(params.targetCoverageDays));
  if (!Number.isFinite(daily) || daily <= 0) return 0;
  const stock =
    params.currentStock != null && Number.isFinite(params.currentStock)
      ? Math.max(0, params.currentStock)
      : 0;
  const needed = daily * days - stock;
  return roundInventoryQuantity(Math.max(0, needed));
}

export function estimatePurchaseLineCost(params: {
  quantity: number;
  productUnit: string;
  cost?: SuggestedPurchaseCostInput | null;
}): number | null {
  const quantity = params.quantity;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const productUnit =
    normalizeInventoryUnitAlias(params.productUnit) || params.productUnit || "unit";
  const costInput = params.cost;

  const storedUnitCost = costInput?.unitCost;
  const storedUnitCostUnit = readStoredUnitCostUnit(costInput?.unitCostUnit);
  if (
    storedUnitCost != null &&
    Number.isFinite(storedUnitCost) &&
    storedUnitCost > 0 &&
    storedUnitCostUnit
  ) {
    const costPerProductUnit = convertCostToConsumptionUnit({
      unitCost: storedUnitCost,
      unitCostUnit: storedUnitCostUnit,
      toUnit: productUnit,
    });
    if (costPerProductUnit != null) {
      return roundInventoryCost(costPerProductUnit * quantity);
    }
  }

  const calculated = calculateInventoryUnitCost({
    purchaseCost: costInput?.purchaseCost,
    purchaseQuantity: costInput?.purchaseQuantity,
    purchaseUnit: costInput?.purchaseUnit,
  });
  const normalized = normalizePurchaseCostInput({
    purchaseCost: costInput?.purchaseCost,
    purchaseQuantity: costInput?.purchaseQuantity,
    purchaseUnit: costInput?.purchaseUnit,
  });
  if (!calculated || !normalized) return null;

  const costPerConsumptionUnit = convertCostToConsumptionUnit({
    unitCost: calculated.unitCost,
    unitCostUnit: calculated.unitCostUnit,
    toUnit: productUnit,
  });
  if (costPerConsumptionUnit == null) return null;
  return roundInventoryCost(costPerConsumptionUnit * quantity);
}

export function buildSuggestedPurchaseDraft(
  params: BuildSuggestedPurchaseDraftParams,
): SuggestedPurchaseDraft {
  const targetCoverageDays = Math.max(
    1,
    Math.floor(params.targetCoverageDays),
  );
  const riskLevels = params.riskLevels ?? DEFAULT_SUGGESTED_DRAFT_RISK_LEVELS;
  const lines: SuggestedPurchaseDraftLine[] = [];

  for (const row of params.rows) {
    if (!riskLevels.includes(row.riskLevel)) continue;
    if (row.dailyConsumption == null || row.dailyConsumption <= 0) continue;

    const suggestedQuantity = calculateSuggestedPurchaseQuantity({
      averageDailyConsumption: row.dailyConsumption,
      targetCoverageDays,
      currentStock: row.currentStock,
    });
    if (suggestedQuantity <= 0) continue;

    const costInput: SuggestedPurchaseCostInput = {
      purchaseCost: row.purchaseCost,
      purchaseQuantity: row.purchaseQuantity,
      purchaseUnit: row.purchaseUnit,
      unitCost: row.unitCost,
      unitCostUnit: row.unitCostUnit,
    };

    lines.push({
      productId: row.productId,
      productName: row.productName,
      supplierName: row.supplierName ?? null,
      productFamilyName:
        row.productFamilyName?.trim() ||
        (row.familyLabel !== "Sin familia" ? row.familyLabel : null),
      productKind: row.productKind ?? (row.kindLabel !== "—" ? row.kindLabel : null),
      currentStock: row.currentStock,
      unit: row.unit,
      averageDailyConsumption: row.dailyConsumption,
      targetCoverageDays,
      suggestedQuantity,
      editableQuantity: suggestedQuantity,
      estimatedCost: estimatePurchaseLineCost({
        quantity: suggestedQuantity,
        productUnit: row.unit,
        cost: costInput,
      }),
      riskLevel: row.riskLevel,
    });
  }

  lines.sort((a, b) => a.productName.localeCompare(b.productName, "es", { sensitivity: "base" }));

  return {
    createdAt: params.createdAt ?? Date.now(),
    targetCoverageDays,
    lines,
  };
}

export function groupSuggestedDraftLinesBySupplier(
  lines: SuggestedPurchaseDraftLine[],
): Map<string, SuggestedPurchaseDraftLine[]> {
  const map = new Map<string, SuggestedPurchaseDraftLine[]>();
  for (const line of lines) {
    const key = line.supplierName?.trim() || "Sin proveedor";
    const bucket = map.get(key) ?? [];
    bucket.push(line);
    map.set(key, bucket);
  }
  return map;
}

export function updateSuggestedDraftLineQuantity(
  draft: SuggestedPurchaseDraft,
  productId: string,
  editableQuantity: number,
  cost?: SuggestedPurchaseCostInput | null,
): SuggestedPurchaseDraft {
  const qty = roundInventoryQuantity(Math.max(0, editableQuantity));
  return {
    ...draft,
    lines: draft.lines.map((line) => {
      if (line.productId !== productId) return line;
      return {
        ...line,
        editableQuantity: qty,
        estimatedCost: estimatePurchaseLineCost({
          quantity: qty,
          productUnit: line.unit,
          cost,
        }),
      };
    }),
  };
}

export function computeSuggestedDraftTotalEstimatedCost(
  lines: SuggestedPurchaseDraftLine[],
): number | null {
  let total = 0;
  let hasAny = false;
  for (const line of lines) {
    if (line.estimatedCost == null || !Number.isFinite(line.estimatedCost)) continue;
    total += line.estimatedCost;
    hasAny = true;
  }
  return hasAny ? roundInventoryCost(total) : null;
}

export function formatSuggestedPurchaseDraftSummary(
  draft: SuggestedPurchaseDraft,
  locale = "es-ES",
): string {
  const fmtQty = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const fmtEur = (value: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const total = computeSuggestedDraftTotalEstimatedCost(draft.lines);
  const grouped = groupSuggestedDraftLinesBySupplier(draft.lines);

  const header = [
    "BORRADOR DE PEDIDO SUGERIDO",
    `Cobertura objetivo: ${draft.targetCoverageDays} días`,
    `Líneas: ${draft.lines.length}`,
    total != null ? `Total estimado: ${fmtEur(total)} €` : "Total estimado: —",
    "",
  ];

  const sections: string[] = [];
  for (const [supplier, lines] of grouped.entries()) {
    sections.push(`Proveedor: ${supplier}`);
    for (const line of lines) {
      const costLabel =
        line.estimatedCost != null ? `${fmtEur(line.estimatedCost)} €` : "—";
      sections.push(
        `- ${line.productName}: ${fmtQty(line.editableQuantity)} ${line.unit} · coste ${costLabel}`,
      );
    }
    sections.push("");
  }

  return [...header, ...sections].join("\n").trim();
}
