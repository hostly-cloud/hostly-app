import {
  convertCostToConsumptionUnit,
  readStoredUnitCostUnit,
  roundInventoryCost,
} from "@/lib/inventory/inventory-cost";
import type { CartOrderLineSelectedModifier } from "@/lib/modifiers/cart-order-modifiers";
import type { ProductRecipeDocument } from "@/lib/firestore/products";
import { isRecipeEnabled } from "@/lib/recipes/product-recipe-helpers";
import type { TpvInventoryProductsById } from "@/lib/inventory/tpv-stock-warnings";

export type TpvLineInventoryCostLineInput = {
  quantity: number;
  product: { id: string; nombre?: string };
  selectedModifiers?: readonly CartOrderLineSelectedModifier[];
};

export type CalculateTpvLineInventoryCostParams = {
  line: TpvLineInventoryCostLineInput;
  inventoryProductsById: TpvInventoryProductsById;
  recipe?: ProductRecipeDocument | null;
  saleProductId?: string;
};

export type TpvLineInventoryCostResult = {
  totalCost: number | null;
  recipeCost: number;
  modifierCost: number;
  missingCostItems: string[];
  warnings: string[];
  /** Hay recipe/modifier con consumo de inventario evaluable. */
  hasConsumption: boolean;
};

/** Snapshot persistido en `orders.items[]` / `orderItems` al enviar comanda. */
export type CartOrderLineInventoryCost = {
  totalCost: number | null;
  recipeCost: number;
  modifierCost: number;
  missingCostItems: string[];
  warnings: string[];
  calculatedAt: number;
};

const EMPTY_RESULT: TpvLineInventoryCostResult = {
  totalCost: null,
  recipeCost: 0,
  modifierCost: 0,
  missingCostItems: [],
  warnings: [],
  hasConsumption: false,
};

function readLineQuantity(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.floor(n));
}

function readPositiveQuantity(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function resolveInventoryProductLabel(
  productId: string,
  inventoryProductsById: TpvInventoryProductsById,
  fallback?: string,
): string {
  const lookup = inventoryProductsById.get(productId);
  return (
    lookup?.name?.trim() ||
    fallback?.trim() ||
    productId
  );
}

function resolveCostPerConsumptionUnit(params: {
  productId: string;
  consumptionUnit: unknown;
  inventoryProductsById: TpvInventoryProductsById;
  fallbackName?: string;
  warnings: string[];
  missingCostItems: string[];
}): number | null {
  const lookup = params.inventoryProductsById.get(params.productId);
  const unitCost = lookup?.unitCost;
  const unitCostUnit = readStoredUnitCostUnit(lookup?.unitCostUnit);

  if (unitCost == null || !Number.isFinite(unitCost) || unitCost <= 0 || !unitCostUnit) {
    params.missingCostItems.push(
      resolveInventoryProductLabel(
        params.productId,
        params.inventoryProductsById,
        params.fallbackName,
      ),
    );
    return null;
  }

  const costPerUnit = convertCostToConsumptionUnit({
    unitCost,
    unitCostUnit,
    toUnit: params.consumptionUnit,
  });

  if (costPerUnit == null) {
    params.warnings.push(
      `Unidad incompatible: ${resolveInventoryProductLabel(
        params.productId,
        params.inventoryProductsById,
        params.fallbackName,
      )}`,
    );
    params.missingCostItems.push(
      resolveInventoryProductLabel(
        params.productId,
        params.inventoryProductsById,
        params.fallbackName,
      ),
    );
    return null;
  }

  return costPerUnit;
}

export function calculateRecipeInventoryCost(
  recipe: ProductRecipeDocument | null | undefined,
  inventoryProductsById: TpvInventoryProductsById,
  quantity: number,
  options?: { saleProductId?: string },
): Pick<TpvLineInventoryCostResult, "recipeCost" | "missingCostItems" | "warnings" | "hasConsumption"> {
  const missingCostItems: string[] = [];
  const warnings: string[] = [];
  let recipeCost = 0;
  let hasConsumption = false;

  if (!isRecipeEnabled(recipe)) {
    return { recipeCost: 0, missingCostItems, warnings, hasConsumption };
  }

  const lineQty = readLineQuantity(quantity);
  const saleProductId = options?.saleProductId?.trim() ?? "";
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe!.ingredients : [];

  for (const raw of ingredients) {
    const productId =
      typeof raw.productId === "string" ? raw.productId.trim() : "";
    const ingredientQty = readPositiveQuantity(raw.quantity);
    const unit = typeof raw.unit === "string" ? raw.unit.trim() : "";
    if (!productId || ingredientQty == null || !unit) continue;
    if (saleProductId && productId === saleProductId) continue;

    hasConsumption = true;
    const costPerUnit = resolveCostPerConsumptionUnit({
      productId,
      consumptionUnit: unit,
      inventoryProductsById,
      fallbackName:
        typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : undefined,
      warnings,
      missingCostItems,
    });
    if (costPerUnit == null) continue;

    recipeCost += costPerUnit * ingredientQty * lineQty;
  }

  return {
    recipeCost: roundInventoryCost(recipeCost),
    missingCostItems,
    warnings,
    hasConsumption,
  };
}

export function calculateModifierInventoryCost(
  selectedModifiers: readonly CartOrderLineSelectedModifier[] | undefined,
  inventoryProductsById: TpvInventoryProductsById,
  quantity: number,
): Pick<TpvLineInventoryCostResult, "modifierCost" | "missingCostItems" | "warnings" | "hasConsumption"> {
  const missingCostItems: string[] = [];
  const warnings: string[] = [];
  let modifierCost = 0;
  let hasConsumption = false;

  if (!Array.isArray(selectedModifiers) || selectedModifiers.length === 0) {
    return { modifierCost: 0, missingCostItems, warnings, hasConsumption };
  }

  const lineQty = readLineQuantity(quantity);

  for (const mod of selectedModifiers) {
    const productId = mod.inventoryProductId?.trim();
    if (!productId) continue;

    const consumptionQty = readPositiveQuantity(mod.inventoryQuantity) ?? 1;
    const consumptionUnit = mod.inventoryUnit ?? "unit";
    hasConsumption = true;

    const costPerUnit = resolveCostPerConsumptionUnit({
      productId,
      consumptionUnit,
      inventoryProductsById,
      fallbackName: mod.inventoryProductName ?? mod.optionName,
      warnings,
      missingCostItems,
    });
    if (costPerUnit == null) continue;

    modifierCost += costPerUnit * consumptionQty * lineQty;
  }

  return {
    modifierCost: roundInventoryCost(modifierCost),
    missingCostItems,
    warnings,
    hasConsumption,
  };
}

export function calculateTpvLineInventoryCost(
  params: CalculateTpvLineInventoryCostParams,
): TpvLineInventoryCostResult {
  const saleProductId = params.saleProductId?.trim() || params.line.product.id;
  const recipePart = calculateRecipeInventoryCost(
    params.recipe,
    params.inventoryProductsById,
    params.line.quantity,
    { saleProductId },
  );
  const modifierPart = calculateModifierInventoryCost(
    params.line.selectedModifiers,
    params.inventoryProductsById,
    params.line.quantity,
  );

  const hasConsumption = recipePart.hasConsumption || modifierPart.hasConsumption;
  if (!hasConsumption) return EMPTY_RESULT;

  const missingCostItems = [
    ...new Set([...recipePart.missingCostItems, ...modifierPart.missingCostItems]),
  ];
  const warnings = [...new Set([...recipePart.warnings, ...modifierPart.warnings])];
  const recipeCost = recipePart.recipeCost;
  const modifierCost = modifierPart.modifierCost;

  if (missingCostItems.length > 0) {
    return {
      totalCost: null,
      recipeCost,
      modifierCost,
      missingCostItems,
      warnings,
      hasConsumption: true,
    };
  }

  const totalCost = roundInventoryCost(recipeCost + modifierCost);
  return {
    totalCost: totalCost > 0 ? totalCost : null,
    recipeCost,
    modifierCost,
    missingCostItems,
    warnings,
    hasConsumption: true,
  };
}

export function formatInventoryCost(
  result: TpvLineInventoryCostResult,
  locale = "es-ES",
): string | null {
  if (!result.hasConsumption) return null;
  if (result.missingCostItems.length > 0) return "Coste incompleto";
  if (result.totalCost == null || result.totalCost <= 0) return null;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(result.totalCost);
  return `Coste estimado: ${formatted} €`;
}

function readStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim());
}

function readFiniteNumber(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function buildTpvLineInventoryCostSnapshot(
  params: CalculateTpvLineInventoryCostParams & { calculatedAt?: number },
): CartOrderLineInventoryCost | undefined {
  const result = calculateTpvLineInventoryCost(params);
  if (!result.hasConsumption) return undefined;
  return {
    totalCost: result.totalCost,
    recipeCost: result.recipeCost,
    modifierCost: result.modifierCost,
    missingCostItems: result.missingCostItems,
    warnings: result.warnings,
    calculatedAt: params.calculatedAt ?? Date.now(),
  };
}

export function inventoryCostSnapshotToFirestore(
  snapshot: CartOrderLineInventoryCost,
): Record<string, unknown> {
  return {
    totalCost: snapshot.totalCost,
    recipeCost: snapshot.recipeCost,
    modifierCost: snapshot.modifierCost,
    missingCostItems: snapshot.missingCostItems,
    warnings: snapshot.warnings,
    calculatedAt: snapshot.calculatedAt,
  };
}

export function parseFirestoreLineInventoryCost(
  raw: unknown,
): CartOrderLineInventoryCost | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const calculatedAt = readFiniteNumber(rec.calculatedAt);
  if (calculatedAt == null || calculatedAt <= 0) return undefined;

  const recipeCost = readFiniteNumber(rec.recipeCost);
  const modifierCost = readFiniteNumber(rec.modifierCost);
  if (recipeCost == null || modifierCost == null) return undefined;

  const totalCostRaw = rec.totalCost;
  const totalCost =
    totalCostRaw == null
      ? null
      : readFiniteNumber(totalCostRaw);

  return {
    totalCost,
    recipeCost,
    modifierCost,
    missingCostItems: readStringArray(rec.missingCostItems),
    warnings: readStringArray(rec.warnings),
    calculatedAt,
  };
}

export function formatInventoryCostSnapshot(
  snapshot: CartOrderLineInventoryCost,
  locale = "es-ES",
): string | null {
  return formatInventoryCost({
    totalCost: snapshot.totalCost,
    recipeCost: snapshot.recipeCost,
    modifierCost: snapshot.modifierCost,
    missingCostItems: snapshot.missingCostItems,
    warnings: snapshot.warnings,
    hasConsumption: true,
  }, locale);
}
