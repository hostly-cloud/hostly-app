import type { ProductRecipeDocument } from "@/lib/firestore/products";
import { inventoryStockUnitToModifierUnit } from "@/lib/modifiers/modifier-inventory-consumption";
import type {
  InventoryProductLookup,
  NormalizedProductRecipe,
  NormalizedRecipeIngredient,
  ProductRecipeDraftSource,
  ProductRecipeSource,
  ProductRecipeValidationResult,
  RecipeIngredientFieldSource,
  RecipeInventoryConsumptionLine,
  RecipeInventoryUnit,
} from "@/lib/recipes/product-recipe-types";
import { RECIPE_INVENTORY_UNITS } from "@/lib/recipes/product-recipe-types";

export { RECIPE_INVENTORY_UNITS };
export type { RecipeInventoryUnit } from "@/lib/recipes/product-recipe-types";

export function isRecipeInventoryUnit(value: unknown): value is RecipeInventoryUnit {
  return (
    typeof value === "string" &&
    (RECIPE_INVENTORY_UNITS as readonly string[]).includes(value)
  );
}

function readPositiveQuantity(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().replace(",", ".");
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function readOptionalCost(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

export function isRecipeEnabled(
  recipe: ProductRecipeSource | ProductRecipeDraftSource,
): boolean {
  if (!recipe || typeof recipe !== "object") return false;
  return recipe.enabled === true;
}

/** Comprueba compatibilidad receta ↔ unidad del producto de inventario (aviso, no bloqueo). */
export function isRecipeUnitCompatibleWithInventoryProduct(
  recipeUnit: RecipeInventoryUnit,
  inventoryProductUnit: string | null | undefined,
): boolean {
  const productNorm = inventoryStockUnitToModifierUnit(inventoryProductUnit);
  if (!productNorm) return false;
  return recipeUnit === productNorm;
}

export function normalizeRecipeIngredientFields(
  source: RecipeIngredientFieldSource | null | undefined,
  inventoryProductsById?: ReadonlyMap<string, InventoryProductLookup>,
): Partial<NormalizedRecipeIngredient> {
  if (!source || typeof source !== "object") return {};

  const productId =
    typeof source.productId === "string" ? source.productId.trim() : "";
  if (!productId) return {};

  const lookup = inventoryProductsById?.get(productId);
  const nameFromSource =
    typeof source.name === "string" && source.name.trim()
      ? source.name.trim()
      : undefined;
  const name = nameFromSource || lookup?.name?.trim() || productId;

  const quantity = readPositiveQuantity(source.quantity);
  const unit = isRecipeInventoryUnit(source.unit) ? source.unit : undefined;
  const cost = readOptionalCost(source.cost);

  if (quantity == null || !unit) {
    return {
      productId,
      name,
      ...(cost != null ? { cost } : {}),
    };
  }

  return {
    productId,
    name,
    quantity,
    unit,
    ...(cost != null ? { cost } : {}),
  };
}

export function normalizeProductRecipe(
  recipe: ProductRecipeSource | ProductRecipeDraftSource,
  options: {
    saleProductId: string;
    inventoryProductsById?: ReadonlyMap<string, InventoryProductLookup>;
  },
): ProductRecipeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const saleProductId = options.saleProductId.trim();
  const enabled = isRecipeEnabled(recipe);
  const rawIngredients = Array.isArray(recipe?.ingredients) ? recipe!.ingredients : [];

  const ingredients: NormalizedRecipeIngredient[] = [];

  for (let i = 0; i < rawIngredients.length; i += 1) {
    const raw = rawIngredients[i] as RecipeIngredientFieldSource;
    const normalized = normalizeRecipeIngredientFields(
      raw,
      options.inventoryProductsById,
    );
    const row = i + 1;

    if (!normalized.productId) {
      if (enabled) errors.push(`Ingrediente ${row}: selecciona un producto de inventario.`);
      continue;
    }

    if (saleProductId && normalized.productId === saleProductId) {
      errors.push(`Ingrediente ${row}: no puede ser el mismo producto vendido.`);
      continue;
    }

    if (normalized.quantity == null || !normalized.unit) {
      if (enabled) {
        errors.push(`Ingrediente ${row}: indica cantidad y unidad válidas.`);
      }
      continue;
    }

    const lookup = options.inventoryProductsById?.get(normalized.productId);
    if (lookup && !isRecipeUnitCompatibleWithInventoryProduct(normalized.unit, lookup.unit)) {
      warnings.push(
        `Ingrediente "${normalized.name}": unidad receta (${normalized.unit}) distinta del inventario (${lookup.unit ?? "—"}). El consumo automático fallará hasta alinearlas.`,
      );
    }

    ingredients.push({
      productId: normalized.productId,
      name: normalized.name ?? normalized.productId,
      quantity: normalized.quantity,
      unit: normalized.unit,
      ...(normalized.cost != null ? { cost: normalized.cost } : {}),
    });
  }

  if (enabled && ingredients.length === 0) {
    errors.push("Activa el escandallo solo con al menos un ingrediente válido.");
  }

  return {
    recipe: { enabled, ingredients },
    errors,
    warnings,
  };
}

/** Payload Firestore embebido en `products/{id}.recipe`. */
export function normalizedProductRecipeToFirestore(
  recipe: NormalizedProductRecipe,
): ProductRecipeDocument {
  return {
    enabled: recipe.enabled,
    ingredients: recipe.ingredients.map((ing) => ({
      productId: ing.productId,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      ...(ing.cost != null ? { cost: ing.cost } : {}),
    })),
  };
}

export function normalizedProductRecipeToWriteInput(
  recipe: NormalizedProductRecipe,
): {
  enabled: boolean;
  ingredients: Array<{
    productId: string;
    name: string;
    quantity: number;
    unit: string;
    cost?: number;
  }>;
} {
  return {
    enabled: recipe.enabled,
    ingredients: recipe.ingredients.map((ing) => ({
      productId: ing.productId,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      ...(ing.cost != null ? { cost: ing.cost } : {}),
    })),
  };
}

export type RecipeIngredientDraftInput = {
  productId: string;
  quantity: string;
  unit: string;
};

export function buildRecipeSourceFromDraftRows(
  enabled: boolean,
  rows: readonly RecipeIngredientDraftInput[],
): ProductRecipeDraftSource {
  return {
    enabled,
    ingredients: rows
      .filter((row) => row.productId.trim() || row.quantity.trim())
      .map((row) => ({
        productId: row.productId.trim(),
        quantity: row.quantity.trim(),
        unit: row.unit,
      })),
  };
}

/**
 * Líneas de consumo futuro al enviar comanda (fase posterior).
 * Solo incluye recetas activas con ingredientes completos.
 */
export function buildRecipeInventoryConsumption(
  recipe: ProductRecipeSource,
  lineQuantity = 1,
  options?: {
    inventoryProductsById?: ReadonlyMap<string, InventoryProductLookup>;
    saleProductId?: string;
  },
): RecipeInventoryConsumptionLine[] {
  if (!isRecipeEnabled(recipe)) return [];

  const lineQty = Math.max(1, Math.floor(Number(lineQuantity) || 1));
  const rawIngredients = Array.isArray(recipe?.ingredients) ? recipe!.ingredients : [];
  const saleProductId = options?.saleProductId?.trim() ?? "";
  const out: RecipeInventoryConsumptionLine[] = [];

  for (const raw of rawIngredients) {
    const normalized = normalizeRecipeIngredientFields(
      raw as RecipeIngredientFieldSource,
      options?.inventoryProductsById,
    );
    if (
      !normalized.productId ||
      normalized.quantity == null ||
      !normalized.unit
    ) {
      continue;
    }
    if (saleProductId && normalized.productId === saleProductId) {
      continue;
    }
    out.push({
      productId: normalized.productId,
      productName: normalized.name ?? normalized.productId,
      quantity: normalized.quantity * lineQty,
      unit: normalized.unit,
    });
  }

  return out;
}

export function buildInventoryProductLookupMap(
  products: readonly InventoryProductLookup[],
): Map<string, InventoryProductLookup> {
  return new Map(products.map((p) => [p.id, p]));
}

export function productDocumentsToInventoryLookup(
  docs: readonly { id: string; name: string; inventory?: { unit?: string } }[],
): InventoryProductLookup[] {
  return docs.map((doc) => ({
    id: doc.id,
    name: doc.name,
    unit: doc.inventory?.unit,
  }));
}

/** Coste total estimado desde ingredientes de receta (€); null si no hay datos. */
export function estimateRecipeCostTotal(
  recipe: ProductRecipeDocument | null | undefined,
): number | null {
  if (!recipe?.enabled) return null;
  let sum = 0;
  let hasLine = false;
  for (const raw of recipe.ingredients ?? []) {
    const cost =
      typeof raw.cost === "number" && Number.isFinite(raw.cost) && raw.cost >= 0
        ? raw.cost
        : null;
    const qty =
      typeof raw.quantity === "number" && Number.isFinite(raw.quantity) && raw.quantity > 0
        ? raw.quantity
        : null;
    if (cost == null || qty == null) continue;
    sum += cost * qty;
    hasLine = true;
  }
  if (!hasLine) return null;
  return Math.round((sum + Number.EPSILON) * 100) / 100;
}
