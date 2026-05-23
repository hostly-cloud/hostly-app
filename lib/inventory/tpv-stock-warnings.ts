import { resolveStockStatus } from "@/lib/inventory/stock-status";
import type { UnitCostBaseUnit } from "@/lib/inventory/inventory-cost";
import { readStoredUnitCostUnit } from "@/lib/inventory/inventory-cost";
import type { ProductDocument, ProductRecipeDocument } from "@/lib/firestore/products";
import type { ModifierOptionDocument } from "@/lib/modifiers/modifier-types";
import { isRecipeEnabled } from "@/lib/recipes/product-recipe-helpers";

/** Aviso operativo TPV (no bloquea venta). Prioridad: out > low > none. */
export type StockWarningLevel = "none" | "low" | "out";

export type TpvInventoryProductStockLookup = {
  currentStock?: number | null;
  minStock?: number | null;
  unitCost?: number | null;
  unitCostUnit?: UnitCostBaseUnit | null;
  name?: string;
};

export type TpvInventoryProductsById = ReadonlyMap<
  string,
  TpvInventoryProductStockLookup
>;

export function buildTpvInventoryProductsById(
  productDocumentsById: ReadonlyMap<string, ProductDocument>,
): TpvInventoryProductsById {
  const map = new Map<string, TpvInventoryProductStockLookup>();
  for (const [id, doc] of productDocumentsById) {
    map.set(id, {
      currentStock: doc.inventory?.currentStock,
      minStock: doc.inventory?.minStock,
      unitCost: doc.inventory?.unitCost,
      unitCostUnit: readStoredUnitCostUnit(doc.inventory?.unitCostUnit),
      name: doc.name,
    });
  }
  return map;
}

function stockStatusToWarning(
  status: ReturnType<typeof resolveStockStatus>,
): StockWarningLevel {
  if (status === "out") return "out";
  if (status === "low") return "low";
  return "none";
}

export function mergeStockWarningLevel(
  a: StockWarningLevel,
  b: StockWarningLevel,
): StockWarningLevel {
  if (a === "out" || b === "out") return "out";
  if (a === "low" || b === "low") return "low";
  return "none";
}

function lookupIngredientWarning(
  productId: string | undefined | null,
  inventoryProducts: TpvInventoryProductsById,
): StockWarningLevel {
  const pid = productId?.trim();
  if (!pid) return "none";
  const inv = inventoryProducts.get(pid);
  if (!inv) return "none";
  return stockStatusToWarning(resolveStockStatus(inv));
}

export function resolveRecipeStockWarning(
  recipe: ProductRecipeDocument | null | undefined,
  inventoryProducts: TpvInventoryProductsById,
  options?: { saleProductId?: string },
): StockWarningLevel {
  if (!isRecipeEnabled(recipe)) return "none";

  const ingredients = Array.isArray(recipe?.ingredients) ? recipe!.ingredients : [];
  const saleProductId = options?.saleProductId?.trim() ?? "";
  let worst: StockWarningLevel = "none";

  for (const ing of ingredients) {
    const productId =
      typeof ing.productId === "string" ? ing.productId.trim() : "";
    if (!productId) continue;
    if (saleProductId && productId === saleProductId) continue;
    worst = mergeStockWarningLevel(
      worst,
      lookupIngredientWarning(productId, inventoryProducts),
    );
    if (worst === "out") return "out";
  }

  return worst;
}

export function resolveProductStockWarning(
  product: Pick<ProductDocument, "id" | "recipe"> | null | undefined,
  inventoryProducts: TpvInventoryProductsById,
): StockWarningLevel {
  if (!product) return "none";
  return resolveRecipeStockWarning(product.recipe, inventoryProducts, {
    saleProductId: product.id,
  });
}

export function resolveModifierOptionStockWarning(
  option:
    | Pick<ModifierOptionDocument, "inventoryProductId">
    | null
    | undefined,
  inventoryProducts: TpvInventoryProductsById,
): StockWarningLevel {
  if (!option?.inventoryProductId?.trim()) return "none";
  return lookupIngredientWarning(option.inventoryProductId, inventoryProducts);
}

/** Etiqueta para grid TPV y avisos principales. */
export function getStockWarningLabel(level: StockWarningLevel): string | null {
  switch (level) {
    case "low":
      return "Stock bajo";
    case "out":
      return "Sin stock";
    default:
      return null;
  }
}

/** Etiqueta compacta para opciones de modificador. */
export function getStockWarningShortLabel(level: StockWarningLevel): string | null {
  switch (level) {
    case "low":
      return "Bajo";
    case "out":
      return "Sin stock";
    default:
      return null;
  }
}

export function stockWarningBadgeClassName(level: StockWarningLevel): string {
  switch (level) {
    case "low":
      return "is-low";
    case "out":
      return "is-out";
    default:
      return "";
  }
}
