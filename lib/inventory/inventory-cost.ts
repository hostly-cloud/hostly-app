import {
  convertInventoryQuantity,
  normalizeInventoryUnitAlias,
  resolveInventoryUnitGroup,
} from "@/lib/inventory/unit-conversions";

export type PurchaseUnit = "unit" | "ml" | "cl" | "l" | "g" | "kg";

export type UnitCostBaseUnit = "unit" | "ml" | "g";

export type NormalizedPurchaseCostInput = {
  purchaseCost: number;
  purchaseQuantity: number;
  purchaseUnit: PurchaseUnit;
};

export type CalculatedInventoryUnitCost = {
  unitCost: number;
  unitCostUnit: UnitCostBaseUnit;
};

export const PURCHASE_UNIT_OPTIONS: ReadonlyArray<{
  value: PurchaseUnit;
  label: string;
}> = [
  { value: "unit", label: "ud" },
  { value: "ml", label: "ml" },
  { value: "cl", label: "cl" },
  { value: "l", label: "l" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
];

function readPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().replace(",", ".");
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** Redondeo estable para costes (4 decimales). */
export function roundInventoryCost(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 10000) / 10000;
}

export function normalizePurchaseUnit(unit: unknown): PurchaseUnit | null {
  const norm = normalizeInventoryUnitAlias(unit);
  if (norm === "unit") return "unit";
  if (norm === "ml" || norm === "cl" || norm === "l") return norm;
  if (norm === "g" || norm === "kg") return norm;
  return null;
}

export function normalizePurchaseCostInput(input: {
  purchaseCost?: unknown;
  purchaseQuantity?: unknown;
  purchaseUnit?: unknown;
}): NormalizedPurchaseCostInput | null {
  const purchaseCost = readPositiveNumber(input.purchaseCost);
  const purchaseQuantity = readPositiveNumber(input.purchaseQuantity);
  const purchaseUnit = normalizePurchaseUnit(input.purchaseUnit);
  if (purchaseCost == null || purchaseQuantity == null || !purchaseUnit) {
    return null;
  }
  return { purchaseCost, purchaseQuantity, purchaseUnit };
}

function resolveUnitCostBaseUnit(purchaseUnit: PurchaseUnit): UnitCostBaseUnit | null {
  const group = resolveInventoryUnitGroup(purchaseUnit);
  if (group === "volume") return "ml";
  if (group === "weight") return "g";
  if (group === "unit") return "unit";
  return null;
}

/**
 * Coste por unidad base: volumen → €/ml, peso → €/g, conteo → €/ud.
 * Devuelve null si faltan datos o la conversión no es válida.
 */
export function calculateInventoryUnitCost(input: {
  purchaseCost?: unknown;
  purchaseQuantity?: unknown;
  purchaseUnit?: unknown;
}): CalculatedInventoryUnitCost | null {
  const normalized = normalizePurchaseCostInput(input);
  if (!normalized) return null;

  const unitCostUnit = resolveUnitCostBaseUnit(normalized.purchaseUnit);
  if (!unitCostUnit) return null;

  const baseQuantity = convertInventoryQuantity({
    quantity: normalized.purchaseQuantity,
    fromUnit: normalized.purchaseUnit,
    toUnit: unitCostUnit,
  });
  if (baseQuantity == null || baseQuantity <= 0) return null;

  const unitCost = roundInventoryCost(normalized.purchaseCost / baseQuantity);
  if (!Number.isFinite(unitCost) || unitCost <= 0) return null;

  return { unitCost, unitCostUnit };
}

export function purchaseUnitDisplayLabel(unit: PurchaseUnit | string | null | undefined): string {
  if (!unit) return "—";
  return unit === "unit" ? "ud" : unit;
}

export function getInventoryUnitCostLabel(
  unitCost: number | null | undefined,
  unitCostUnit: UnitCostBaseUnit | null | undefined,
  locale = "es-ES",
): string | null {
  if (unitCost == null || !Number.isFinite(unitCost) || !unitCostUnit) return null;
  const unitLabel = purchaseUnitDisplayLabel(unitCostUnit);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(unitCost);
  return `${formatted} €/${unitLabel}`;
}

export function formatPurchaseCostEquation(
  input: NormalizedPurchaseCostInput | null,
  calculated: CalculatedInventoryUnitCost | null,
  locale = "es-ES",
): string | null {
  if (!input || !calculated) return null;
  const costFormatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(input.purchaseCost);
  const qtyFormatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 3,
  }).format(input.purchaseQuantity);
  const unitLabel = purchaseUnitDisplayLabel(input.purchaseUnit);
  const unitCostLabel = getInventoryUnitCostLabel(
    calculated.unitCost,
    calculated.unitCostUnit,
    locale,
  );
  if (!unitCostLabel) return null;
  return `${costFormatted} € / ${qtyFormatted} ${unitLabel} = ${unitCostLabel}`;
}

/**
 * Convierte un coste almacenado (€/ml, €/g o €/ud) al coste por otra unidad compatible.
 * Ej.: €/ml → €/cl multiplica por 10 ml en 1 cl.
 */
export function convertCostToConsumptionUnit(params: {
  unitCost: number;
  unitCostUnit: UnitCostBaseUnit;
  toUnit: unknown;
}): number | null {
  const { unitCost, unitCostUnit } = params;
  if (!Number.isFinite(unitCost) || unitCost <= 0) return null;

  const targetUnit = normalizePurchaseUnit(params.toUnit);
  if (!targetUnit) return null;

  const targetBase = resolveUnitCostBaseUnit(targetUnit);
  if (!targetBase || targetBase !== unitCostUnit) return null;

  if (targetUnit === unitCostUnit) return roundInventoryCost(unitCost);

  const baseAmountInTarget = convertInventoryQuantity({
    quantity: 1,
    fromUnit: targetUnit,
    toUnit: unitCostUnit,
  });
  if (baseAmountInTarget == null || baseAmountInTarget <= 0) return null;

  return roundInventoryCost(unitCost * baseAmountInTarget);
}

export function readStoredUnitCostUnit(value: unknown): UnitCostBaseUnit | null {
  const norm = normalizeInventoryUnitAlias(value);
  if (norm === "unit") return "unit";
  if (norm === "ml") return "ml";
  if (norm === "g") return "g";
  return null;
}
