import {
  calculateInventoryUnitCost,
  normalizePurchaseCostInput,
  readStoredUnitCostUnit,
  type UnitCostBaseUnit,
} from "@/lib/inventory/inventory-cost";
import { calculateRecipeInventoryCost } from "@/lib/inventory/tpv-line-cost";
import type { TpvInventoryProductStockLookup } from "@/lib/inventory/tpv-stock-warnings";
import type { ProductDocument, ProductRecipeDocument } from "@/lib/firestore/products";
import { estimateRecipeCostTotal, isRecipeInventoryUnit } from "@/lib/recipes/product-recipe-helpers";
import {
  computeMarginPercent,
  marginHealthCategory,
  parseNullableNumber,
  type MarginHealth,
} from "@/components/carta/escandallos/escandallo-display-utils";
import {
  convertInventoryQuantity,
  resolveInventoryUnitGroup,
} from "@/lib/inventory/unit-conversions";

export type ProductProfitabilityDraftRow = {
  productId: string;
  quantity: string;
  unit: string;
};

export type ProductProfitabilityInput = {
  recipeEnabled: boolean;
  recipeRows: readonly ProductProfitabilityDraftRow[];
  saleProductId: string | null;
  salePrice: number | null;
  productDocumentsById: ReadonlyMap<string, ProductDocument>;
};

export type ProductProfitabilityResult = {
  /** Coste + PVP: bloque completo con margen y estado. */
  sufficient: boolean;
  /** Al menos un coste por servicio calculable desde receta + inventario. */
  hasServiceCost: boolean;
  serviceCost: number | null;
  salePrice: number | null;
  marginPct: number | null;
  marginTier: MarginHealth;
  estimatedServings: number | null;
};

function draftRowsToRecipeDocument(
  enabled: boolean,
  rows: readonly ProductProfitabilityDraftRow[],
): ProductRecipeDocument {
  if (!enabled) {
    return { enabled: false, ingredients: [] };
  }

  const ingredients: ProductRecipeDocument["ingredients"] = [];
  for (const row of rows) {
    const productId = row.productId.trim();
    if (!productId) continue;
    const quantity = parseNullableNumber(row.quantity);
    if (quantity == null || quantity <= 0) continue;
    if (!isRecipeInventoryUnit(row.unit)) continue;
    ingredients.push({
      productId,
      quantity,
      unit: row.unit,
    });
  }

  return {
    enabled: true,
    ingredients,
  };
}

/** Mapa de inventario con unitCost resuelto en runtime (sin escribir en Firestore). */
function buildInventoryCostLookup(
  productDocumentsById: ReadonlyMap<string, ProductDocument>,
): Map<string, TpvInventoryProductStockLookup> {
  const map = new Map<string, TpvInventoryProductStockLookup>();

  for (const [id, doc] of productDocumentsById) {
    let unitCost = doc.inventory?.unitCost;
    let unitCostUnit: UnitCostBaseUnit | null = readStoredUnitCostUnit(
      doc.inventory?.unitCostUnit,
    );

    if (
      (unitCost == null || !Number.isFinite(unitCost) || unitCost <= 0 || !unitCostUnit) &&
      doc.inventory
    ) {
      const calculated = calculateInventoryUnitCost({
        purchaseCost: doc.inventory.purchaseCost,
        purchaseQuantity: doc.inventory.purchaseQuantity,
        purchaseUnit: doc.inventory.purchaseUnit,
      });
      if (calculated) {
        unitCost = calculated.unitCost;
        unitCostUnit = calculated.unitCostUnit;
      }
    }

    map.set(id, {
      name: doc.name,
      currentStock: doc.inventory?.currentStock,
      minStock: doc.inventory?.minStock,
      unitCost: unitCost ?? null,
      unitCostUnit,
    });
  }

  return map;
}

function resolveServiceCostFromRecipe(
  recipe: ProductRecipeDocument,
  inventoryLookup: Map<string, TpvInventoryProductStockLookup>,
  saleProductId: string,
): number | null {
  const inventoryPart = calculateRecipeInventoryCost(
    recipe,
    inventoryLookup,
    1,
    { saleProductId },
  );

  if (
    inventoryPart.hasConsumption &&
    inventoryPart.missingCostItems.length === 0 &&
    inventoryPart.recipeCost > 0
  ) {
    return inventoryPart.recipeCost;
  }

  const embedded = estimateRecipeCostTotal(recipe);
  if (embedded != null && embedded > 0) return embedded;

  return null;
}

/**
 * Copas / raciones estimadas por envase de compra (solo volumen, datos ya guardados).
 */
export function estimateServingsFromPurchaseAndRecipe(
  recipe: ProductRecipeDocument,
  productDocumentsById: ReadonlyMap<string, ProductDocument>,
): number | null {
  if (!recipe.enabled) return null;

  for (const raw of recipe.ingredients ?? []) {
    const productId =
      typeof raw.productId === "string" ? raw.productId.trim() : "";
    const serviceQty =
      typeof raw.quantity === "number" && Number.isFinite(raw.quantity) && raw.quantity > 0
        ? raw.quantity
        : null;
    const serviceUnit = typeof raw.unit === "string" ? raw.unit.trim() : "";
    if (!productId || serviceQty == null || !serviceUnit) continue;

    const doc = productDocumentsById.get(productId);
    const inv = doc?.inventory;
    const purchase = normalizePurchaseCostInput({
      purchaseCost: inv?.purchaseCost,
      purchaseQuantity: inv?.purchaseQuantity,
      purchaseUnit: inv?.purchaseUnit,
    });
    if (!purchase) continue;
    if (resolveInventoryUnitGroup(purchase.purchaseUnit) !== "volume") continue;
    if (resolveInventoryUnitGroup(serviceUnit) !== "volume") continue;

    const purchaseBaseMl = convertInventoryQuantity({
      quantity: purchase.purchaseQuantity,
      fromUnit: purchase.purchaseUnit,
      toUnit: "ml",
    });
    const serviceBaseMl = convertInventoryQuantity({
      quantity: serviceQty,
      fromUnit: serviceUnit,
      toUnit: "ml",
    });
    if (
      purchaseBaseMl == null ||
      serviceBaseMl == null ||
      purchaseBaseMl <= 0 ||
      serviceBaseMl <= 0
    ) {
      continue;
    }

    const servings = Math.floor(purchaseBaseMl / serviceBaseMl);
    if (servings >= 1) return servings;
  }

  return null;
}

export function computeProductProfitability(
  input: ProductProfitabilityInput,
): ProductProfitabilityResult {
  const empty: ProductProfitabilityResult = {
    sufficient: false,
    hasServiceCost: false,
    serviceCost: null,
    salePrice: input.salePrice,
    marginPct: null,
    marginTier: "none",
    estimatedServings: null,
  };

  const recipe = draftRowsToRecipeDocument(input.recipeEnabled, input.recipeRows);
  if (!recipe.enabled || (recipe.ingredients?.length ?? 0) === 0) {
    return empty;
  }

  const saleProductId = input.saleProductId?.trim() ?? "";
  const inventoryLookup = buildInventoryCostLookup(input.productDocumentsById);
  const serviceCost = resolveServiceCostFromRecipe(
    recipe,
    inventoryLookup,
    saleProductId,
  );

  const estimatedServings = estimateServingsFromPurchaseAndRecipe(
    recipe,
    input.productDocumentsById,
  );

  if (serviceCost == null) {
    return { ...empty, estimatedServings };
  }

  const salePrice =
    input.salePrice != null && Number.isFinite(input.salePrice) && input.salePrice > 0
      ? input.salePrice
      : null;
  const marginPct = computeMarginPercent(serviceCost, salePrice);
  const marginTier = marginHealthCategory(marginPct);
  const hasServiceCost = true;
  const sufficient = salePrice != null && marginPct != null;

  return {
    sufficient,
    hasServiceCost,
    serviceCost,
    salePrice,
    marginPct,
    marginTier,
    estimatedServings,
  };
}
