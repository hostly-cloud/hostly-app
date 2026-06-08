import type { ImportedMenuSuggestedStation } from "@/lib/carta/imported-menu-types";
import { inferMenuImportSectionFromHeader } from "@/lib/server/menu-imports/normalize-menu-import-section";

const COCKTAIL_SECTION_RE = /\b(c[oó]cteles?|cocktail|cocteler[ií]a)\b/i;

const DRINK_SECTION_RE =
  /\b(vinos?|cervezas?|refrescos?|bebidas?|caf[eé]s?|champagne|cavas?|destilados?|licores?|combinados?)\b/i;

const FOOD_SECTION_RE =
  /\b(entrantes?|tapas?|principales?|segundos?|platos?|pastas?|pasta|risott[oi]|pizz[ae]|postres?|carnes?|pescados?|ensaladas?|guisos?|sopas?|arroces?|cocina)\b/i;

const FOOD_DISH_RE =
  /\b(escalopines?|estofado|solomillo|filete|muslo|chuletas?|langostinos?|dorada|lubina|ternera|cordero|pollo|cerdo|entrecot|lomo|paella|croquetas?|ensalada|ravioli|tagliatelle|gratinados?|carpaccio|tartar|salmon|atun|merluza|bacalao|orecchiette|risotto|pizza)\b/i;

const COOKING_CONTEXT_RE =
  /\b(al horno|a la plancha|a la parrilla|al grill|gratinad|servido[s]? con|con patatas|con verduras|al vino|en salsa|al crujiente|a la brasa)\b/i;

const RECIPE_DRINK_INGREDIENT_RE = /\b(al vino (blanco|tinto|rosado)|con vino|en salsa de|marinad[oa] en)\b/i;

const COCKTAIL_PRODUCT_RE =
  /\b(gin tonic|mojito|negroni|margarita|spritz|vermut|cocktail|c[oó]ctel)\b/i;

const DRINK_PRODUCT_LEADER_RE =
  /^(vino\b|copa de|cerveza|refresco|agua mineral|agua\b|zumo|caf[eé]|t[eé]|whisky|ron\b|ginebra|champagne|cava\b|combinado)/i;

export type ResolveImportedItemDestinationInput = {
  name: string;
  sectionName?: string;
  suggestedCategory?: string;
  productFamilyType?: string | null;
  resolvedCategoryStation?: ImportedMenuSuggestedStation | null;
  fallbackStation?: ImportedMenuSuggestedStation;
};

function stationFromSectionOrCategory(text: string): ImportedMenuSuggestedStation | null {
  const normalized = text.trim();
  if (!normalized) return null;

  if (COCKTAIL_SECTION_RE.test(normalized)) return "cocktail";
  if (DRINK_SECTION_RE.test(normalized)) return "bar";
  if (FOOD_SECTION_RE.test(normalized)) return "kitchen";

  const inferred = inferMenuImportSectionFromHeader(normalized);
  if (inferred) return inferred.station;

  return null;
}

function isClearlyFoodDish(name: string): boolean {
  const n = name.toLowerCase();
  if (FOOD_DISH_RE.test(n)) return true;
  if (COOKING_CONTEXT_RE.test(n)) return true;
  if (RECIPE_DRINK_INGREDIENT_RE.test(n)) return true;
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length >= 5 && /\b(con|servido|al|de)\b/.test(n)) return true;
  return false;
}

function isClearlyDrinkProduct(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (isClearlyFoodDish(n)) return false;
  if (COCKTAIL_PRODUCT_RE.test(n)) return true;
  if (DRINK_PRODUCT_LEADER_RE.test(n)) return true;
  if (
    /\b(vino tinto|vino blanco|rioja|ribera|albari[nñ]o|verdejo|tempranillo|garnacha)\b/.test(n) &&
    !FOOD_DISH_RE.test(n) &&
    !COOKING_CONTEXT_RE.test(n)
  ) {
    return true;
  }
  if (/\b(cerveza|refresco|agua|zumo|whisky|ron|ginebra)\b/.test(n)) return true;
  return false;
}

/**
 * Resuelve estación/destino KDS sugerido para un ítem importado.
 * Prioridad: categoría Hostly → sectionName → productFamilyType → nombre → fallback.
 * La comida clara gana sobre palabras de bebida dentro de recetas (p. ej. "al vino blanco").
 */
export function resolveImportedItemDestination(
  input: ResolveImportedItemDestinationInput,
): ImportedMenuSuggestedStation {
  const resolved = input.resolvedCategoryStation;
  if (resolved && resolved !== "none") return resolved;

  const family = input.productFamilyType?.trim().toLowerCase();
  if (family === "food") return "kitchen";
  if (family === "drink") return "bar";

  const fromSection = stationFromSectionOrCategory(input.sectionName ?? "");
  if (fromSection) return fromSection;

  const fromCategory = stationFromSectionOrCategory(input.suggestedCategory ?? "");
  if (fromCategory) return fromCategory;

  const name = input.name.trim();
  if (name) {
    if (isClearlyFoodDish(name)) return "kitchen";
    if (COCKTAIL_PRODUCT_RE.test(name.toLowerCase())) return "cocktail";
    if (isClearlyDrinkProduct(name)) return "bar";
  }

  return input.fallbackStation ?? "kitchen";
}
