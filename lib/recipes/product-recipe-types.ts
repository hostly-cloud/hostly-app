import type { ProductRecipeDocument } from "@/lib/firestore/products";

/** Unidades soportadas en receta (alineadas con consumo futuro y modifiers). */
export const RECIPE_INVENTORY_UNITS = [
  "unit",
  "ml",
  "cl",
  "l",
  "g",
  "kg",
] as const;

export type RecipeInventoryUnit = (typeof RECIPE_INVENTORY_UNITS)[number];

export type RecipeIngredientFieldSource = {
  productId?: string | null;
  name?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  cost?: number | null;
};

export type NormalizedRecipeIngredient = {
  productId: string;
  name: string;
  quantity: number;
  unit: RecipeInventoryUnit;
  cost?: number;
};

export type NormalizedProductRecipe = {
  enabled: boolean;
  ingredients: NormalizedRecipeIngredient[];
};

export type RecipeInventoryConsumptionLine = {
  productId: string;
  productName: string;
  quantity: number;
  unit: RecipeInventoryUnit;
};

export type ProductRecipeValidationResult = {
  recipe: NormalizedProductRecipe;
  errors: string[];
  warnings: string[];
};

export type InventoryProductLookup = {
  id: string;
  name: string;
  unit?: string;
};

export type ProductRecipeSource = ProductRecipeDocument | null | undefined;

/** Entrada flexible para normalizar borradores UI (quantity string/number). */
export type ProductRecipeDraftSource = {
  enabled?: boolean;
  ingredients?: readonly RecipeIngredientFieldSource[];
};
