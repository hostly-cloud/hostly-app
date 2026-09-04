import {
  areInventoryUnitsCompatible,
  convertInventoryQuantity,
  normalizeInventoryUnitAlias,
} from "@/lib/inventory/unit-conversions";
import { roundInventoryCost } from "@/lib/inventory/inventory-cost";

export const INCOMPATIBLE_INVENTORY_UNIT_CHANGE =
  "No se puede cambiar entre unidades incompatibles con stock o mínimo distinto de cero. Pon ambos valores a 0 antes de cambiar la unidad.";

export type InventoryUnitChangePlan =
  | {
      ok: true;
      currentStock: number;
      minStock: number;
      costPerUnit: number;
    }
  | { ok: false; error: string };

/**
 * Conserva cantidades y valoración al cambiar la unidad visible del inventario.
 * Los cambios entre grupos (p. ej. litros → unidades) solo son seguros sin stock.
 */
export function planInventoryUnitChange(params: {
  fromUnit: unknown;
  toUnit: unknown;
  currentStock: number;
  minStock: number;
  costPerUnit: number;
}): InventoryUnitChangePlan {
  const from = normalizeInventoryUnitAlias(params.fromUnit);
  const to = normalizeInventoryUnitAlias(params.toUnit);
  if (from === to) {
    return {
      ok: true,
      currentStock: params.currentStock,
      minStock: params.minStock,
      costPerUnit: params.costPerUnit,
    };
  }

  if (!areInventoryUnitsCompatible(from, to)) {
    if (params.currentStock !== 0 || params.minStock !== 0) {
      return { ok: false, error: INCOMPATIBLE_INVENTORY_UNIT_CHANGE };
    }
    return { ok: true, currentStock: 0, minStock: 0, costPerUnit: 0 };
  }

  const currentStock = convertInventoryQuantity({
    quantity: params.currentStock,
    fromUnit: from,
    toUnit: to,
  });
  const minStock = convertInventoryQuantity({
    quantity: params.minStock,
    fromUnit: from,
    toUnit: to,
  });
  const unitsPerPreviousUnit = convertInventoryQuantity({
    quantity: 1,
    fromUnit: from,
    toUnit: to,
  });
  if (currentStock == null || minStock == null || !unitsPerPreviousUnit) {
    return { ok: false, error: INCOMPATIBLE_INVENTORY_UNIT_CHANGE };
  }

  return {
    ok: true,
    currentStock,
    minStock,
    costPerUnit: roundInventoryCost(
      params.costPerUnit / unitsPerPreviousUnit,
    ),
  };
}

/** Convierte el stock anterior a la unidad nueva para un movimiento coherente. */
export function normalizePreviousStockForUnitChange(params: {
  previousStock: number;
  previousUnit: unknown;
  nextStock: number;
  nextUnit: unknown;
}): number {
  const previousUnit = normalizeInventoryUnitAlias(params.previousUnit);
  const nextUnit = normalizeInventoryUnitAlias(params.nextUnit);
  if (previousUnit === nextUnit) return params.previousStock;

  const converted = convertInventoryQuantity({
    quantity: params.previousStock,
    fromUnit: previousUnit,
    toUnit: nextUnit,
  });
  if (converted != null) return converted;
  if (params.previousStock === 0 && params.nextStock === 0) return 0;
  throw new Error(INCOMPATIBLE_INVENTORY_UNIT_CHANGE);
}
