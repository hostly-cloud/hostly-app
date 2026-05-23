import {
  isProductFamilyType,
  type ProductFamilyType,
} from "@/lib/carta/product-family-types";

/** Primer nivel TPV: bebida vs comida (segundo nivel = categorías del catálogo). */
export type TpvMenuGroup = "bebida" | "comida";

export type TpvMenuGroupSource = {
  productFamilyType?: ProductFamilyType | string | null;
  /** Nombre de categoría en carta (denormalizado o legacy). */
  categoryName?: string | null;
  categoria?: string | null;
  tipoVenta?: string | null;
};

function normalizeCategoryLabelForGroup(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "");
}

function categoryLabelTokens(name: string): string[] {
  const n = normalizeCategoryLabelForGroup(name);
  if (!n) return [];
  return n.split(/[^a-z0-9]+/).filter(Boolean);
}

const DRINK_CATEGORY_WORDS = new Set([
  "agua",
  "aguas",
  "refresco",
  "refrescos",
  "soda",
  "sodas",
  "gaseosa",
  "gaseosas",
  "cerveza",
  "cervezas",
  "vino",
  "vinos",
  "cava",
  "cavas",
  "champagne",
  "champan",
  "copa",
  "copas",
  "coctel",
  "cocteles",
  "cocktail",
  "cocktails",
  "licor",
  "licores",
  "vermu",
  "vermouth",
  "ron",
  "vodka",
  "whisky",
  "whiskey",
  "brandy",
  "ginebra",
  "gin",
  "gintonics",
  "gintonic",
  "combinado",
  "combinados",
  "digestivo",
  "digestivos",
  "cafe",
  "cafes",
  "te",
  "tes",
  "infusion",
  "infusiones",
  "tisana",
  "tisanas",
  "zumo",
  "zumos",
  "jugo",
  "jugos",
  "batido",
  "batidos",
  "smoothie",
  "smoothies",
  "bebida",
  "bebidas",
  "sidra",
  "sangria",
  "mocktail",
  "mocktails",
  "tonica",
  "tonicas",
  "cola",
  "energetica",
  "energeticas",
  "isotonica",
  "isotonicas",
]);

function categoryWordLooksDrink(word: string): boolean {
  if (DRINK_CATEGORY_WORDS.has(word)) return true;
  if (word.startsWith("cervez")) return true;
  if (word.startsWith("coctel") || word.startsWith("cocktail")) return true;
  if (word.startsWith("refresc")) return true;
  if (word.startsWith("cafe")) return true;
  if (word.startsWith("champ")) return true;
  return false;
}

/**
 * Fallback por nombre de categoría (legacy sin `productFamilyType` denormalizado).
 * Si no encaja → comida (incl. "Sin categoría").
 */
export function resolveTpvMenuGroupFromCategoryName(
  categoryName: string,
): TpvMenuGroup {
  const raw = (categoryName || "").trim();
  if (!raw) return "comida";
  const flat = normalizeCategoryLabelForGroup(raw);
  if (flat === "sin categoria") return "comida";

  for (const w of categoryLabelTokens(raw)) {
    if (categoryWordLooksDrink(w)) return "bebida";
  }

  if (
    flat.includes("soft drink") ||
    flat.includes("softdrink") ||
    flat.includes("hot drink") ||
    flat.includes("long drink") ||
    flat.includes("sin alcohol")
  ) {
    return "bebida";
  }

  return "comida";
}

/**
 * Agrupa producto en pestaña Bebida o Comida del TPV.
 * Prioridad: `productFamilyType` denormalizado → `tipoVenta` → keywords en categoría.
 */
export function resolveTpvMenuGroup(source: TpvMenuGroupSource): TpvMenuGroup {
  const familyType = source.productFamilyType;
  if (isProductFamilyType(familyType)) {
    if (familyType === "drink") return "bebida";
    if (familyType === "food") return "comida";
  }

  const tipo = typeof source.tipoVenta === "string" ? source.tipoVenta.trim() : "";
  if (tipo === "bebida") return "bebida";
  if (tipo === "plato") return "comida";

  const cat = (source.categoryName ?? source.categoria ?? "").trim();
  return resolveTpvMenuGroupFromCategoryName(cat || "Sin categoría");
}

export function isTpvDrinkProduct(source: TpvMenuGroupSource): boolean {
  return resolveTpvMenuGroup(source) === "bebida";
}
