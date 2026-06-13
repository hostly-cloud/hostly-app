import type { CartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { normalizeModifierGroupIds } from "@/lib/modifiers/modifier-group-ids";

export type DrinkFormatMixerCategorySuggestInput = {
  name: string;
  type: CartaCategoriaTipo | string;
  modifierGroupIds?: readonly string[] | null;
};

const POSITIVE_CATEGORY_WORDS = new Set([
  "ginebra",
  "gin",
  "ron",
  "whisky",
  "whiskey",
  "vodka",
  "brandy",
  "licor",
  "vermut",
  "vermouth",
]);

const EXCLUDED_CATEGORY_WORDS = new Set([
  "refresco",
  "refrescos",
  "cerveza",
  "cervezas",
  "vino",
  "vinos",
  "cava",
  "cavas",
  "champagne",
  "champan",
  "cafe",
  "cafes",
  "zumo",
  "zumos",
  "agua",
  "aguas",
  "sangria",
  "mocktail",
  "mocktails",
]);

function normalizeCategoryLabel(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function categoryLabelTokens(name: string): string[] {
  const flat = normalizeCategoryLabel(name);
  if (!flat) return [];
  return flat.split(/[^a-z0-9]+/).filter(Boolean);
}

function categoryNameMatchesPositiveLexicon(name: string): boolean {
  for (const token of categoryLabelTokens(name)) {
    if (POSITIVE_CATEGORY_WORDS.has(token)) return true;
  }
  return false;
}

function categoryNameMatchesExclusionLexicon(name: string): boolean {
  const flat = normalizeCategoryLabel(name);
  if (!flat) return false;

  for (const token of categoryLabelTokens(name)) {
    if (EXCLUDED_CATEGORY_WORDS.has(token)) return true;
    if (token.startsWith("refresc")) return true;
    if (token.startsWith("champ")) return true;
    if (token.startsWith("cafe")) return true;
  }

  if (flat.includes("champagne") || flat.includes("champan")) return true;
  return false;
}

/**
 * Sugiere Formato bebida + Mixer en configuración de categoría.
 * Solo lectura heurística; no persiste ni modifica datos.
 */
export function shouldSuggestDrinkFormatMixerCategory(
  input: DrinkFormatMixerCategorySuggestInput,
): boolean {
  if (input.type !== "drink") return false;

  const modifierGroupIds = normalizeModifierGroupIds(input.modifierGroupIds);
  if (modifierGroupIds.length > 0) return false;

  const name = String(input.name ?? "").trim();
  if (!name) return false;
  if (categoryNameMatchesExclusionLexicon(name)) return false;
  if (!categoryNameMatchesPositiveLexicon(name)) return false;

  return true;
}
