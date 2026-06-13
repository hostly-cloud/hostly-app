import type { ProductDocument, ProductRecipeDocument } from "@/lib/firestore/products";
import {
  computeProductProfitability,
  type ProductProfitabilityDraftRow,
} from "@/components/carta/escandallos/product-profitability-utils";

/** Estado visual UX del listado Escandallos (no altera motor de coste). */
export type EscandalloVisualState = "sin_escandallo" | "incompleto" | "operativo";

export type EscandalloVisualStateCounts = {
  activos: number;
  operativos: number;
  incompletos: number;
  sinEscandallo: number;
};

function recipeIngredientCount(recipe?: ProductRecipeDocument | null): number {
  return Array.isArray(recipe?.ingredients) ? recipe!.ingredients.length : 0;
}

function recipeIngredientsToDraftRows(
  recipe?: ProductRecipeDocument | null,
): ProductProfitabilityDraftRow[] {
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe!.ingredients : [];
  return ingredients.map((ing) => ({
    productId: typeof ing.productId === "string" ? ing.productId.trim() : "",
    quantity:
      typeof ing.quantity === "number" && Number.isFinite(ing.quantity)
        ? String(ing.quantity)
        : "",
    unit: typeof ing.unit === "string" ? ing.unit : "unit",
  }));
}

function legacyVisualStateFromRowCoste(rowCoste: number | null | undefined): EscandalloVisualState {
  if (rowCoste != null && Number.isFinite(rowCoste) && rowCoste > 0) {
    return "operativo";
  }
  return "incompleto";
}

export function computeEscandalloVisualState(input: {
  recipe?: ProductRecipeDocument | null;
  saleProductId: string;
  salePrice: number | null;
  productDocumentsById: ReadonlyMap<string, ProductDocument>;
  /** Solo catálogo legacy sin `products.recipe` en central. */
  legacyFallback?: boolean;
  rowCoste?: number | null;
}): EscandalloVisualState {
  if (input.legacyFallback) {
    return legacyVisualStateFromRowCoste(input.rowCoste);
  }

  const recipe = input.recipe;
  const enabled = recipe?.enabled === true;
  const ingredientCount = recipeIngredientCount(recipe);

  if (!enabled || ingredientCount === 0) {
    return "sin_escandallo";
  }

  const profitability = computeProductProfitability({
    recipeEnabled: true,
    recipeRows: recipeIngredientsToDraftRows(recipe),
    saleProductId: input.saleProductId,
    salePrice: input.salePrice,
    productDocumentsById: input.productDocumentsById,
  });

  if (
    profitability.hasServiceCost &&
    profitability.serviceCost != null &&
    profitability.serviceCost > 0
  ) {
    return "operativo";
  }

  return "incompleto";
}

export function computeEscandalloVisualStateCounts(
  states: readonly EscandalloVisualState[],
): EscandalloVisualStateCounts {
  let operativos = 0;
  let incompletos = 0;
  let sinEscandallo = 0;
  for (const state of states) {
    if (state === "operativo") operativos += 1;
    else if (state === "incompleto") incompletos += 1;
    else sinEscandallo += 1;
  }
  return {
    activos: states.length,
    operativos,
    incompletos,
    sinEscandallo,
  };
}

export function escandalloVisualStateLabel(state: EscandalloVisualState): string {
  switch (state) {
    case "operativo":
      return "Operativo";
    case "incompleto":
      return "Incompleto";
    default:
      return "Sin escandallo";
  }
}

export function escandalloVisualStateTone(
  state: EscandalloVisualState,
): "success" | "warning" | "muted" {
  switch (state) {
    case "operativo":
      return "success";
    case "incompleto":
      return "warning";
    default:
      return "muted";
  }
}

/** Etiqueta del acceso rápido a receta desde el listado Escandallos. */
export function escandalloRecipeQuickActionLabel(state: EscandalloVisualState): string {
  switch (state) {
    case "operativo":
      return "Editar receta";
    case "incompleto":
      return "Completar receta";
    default:
      return "Crear receta";
  }
}
