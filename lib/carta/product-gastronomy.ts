import type {
  Product,
  ProductAllergen,
  ProductGastronomy,
  ProductWineBody,
  ProductWineProfile,
  ProductWineStyle,
  ProductWineSweetness,
} from "@/types/product";

export const PRODUCT_ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soybeans",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const satisfies readonly ProductAllergen[];

const ALLERGEN_SET = new Set<string>(PRODUCT_ALLERGENS);

const ALLERGEN_ALIASES: Record<string, ProductAllergen> = {
  gluten: "gluten",
  crustacean: "crustaceans",
  crustaceans: "crustaceans",
  crustaceos: "crustaceans",
  crustáceos: "crustaceans",
  egg: "eggs",
  eggs: "eggs",
  huevo: "eggs",
  huevos: "eggs",
  fish: "fish",
  pescado: "fish",
  peanut: "peanuts",
  peanuts: "peanuts",
  cacahuete: "peanuts",
  cacahuetes: "peanuts",
  soy: "soybeans",
  soybean: "soybeans",
  soybeans: "soybeans",
  soja: "soybeans",
  milk: "milk",
  leche: "milk",
  nut: "nuts",
  nuts: "nuts",
  frutos_secos: "nuts",
  "frutos secos": "nuts",
  celery: "celery",
  apio: "celery",
  mustard: "mustard",
  mostaza: "mustard",
  sesame: "sesame",
  sesamo: "sesame",
  sésamo: "sesame",
  sulphite: "sulphites",
  sulphites: "sulphites",
  sulfito: "sulphites",
  sulfitos: "sulphites",
  lupin: "lupin",
  altramuz: "lupin",
  altramuces: "lupin",
  mollusc: "molluscs",
  molluscs: "molluscs",
  molusco: "molluscs",
  moluscos: "molluscs",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanString(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

export function normalizeProductStringList(value: unknown, maxItems = 40): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\n]/)
      : [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const cleaned = cleanString(item, 120);
    if (!cleaned) continue;
    const key = cleaned.toLocaleLowerCase("es");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= maxItems) break;
  }
  return result;
}

export function normalizeProductAllergens(value: unknown): ProductAllergen[] {
  const result: ProductAllergen[] = [];
  const seen = new Set<ProductAllergen>();
  for (const raw of normalizeProductStringList(value, PRODUCT_ALLERGENS.length * 2)) {
    const key = raw.toLocaleLowerCase("es").replace(/-/g, "_");
    const mapped = ALLERGEN_ALIASES[key] ?? (ALLERGEN_SET.has(key) ? (key as ProductAllergen) : null);
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    result.push(mapped);
  }
  return result;
}

function finiteNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return undefined;
  return value;
}

function wineEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const cleaned = cleanString(value, 40)?.toLowerCase();
  return cleaned && allowed.includes(cleaned as T) ? (cleaned as T) : undefined;
}

export function normalizeProductWineProfile(value: unknown): ProductWineProfile | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const style = wineEnum<ProductWineStyle>(record.style ?? record.type, [
    "red", "white", "rose", "sparkling", "sweet", "fortified", "unknown",
  ]);
  const body = wineEnum<ProductWineBody>(record.body, ["light", "medium", "full", "unknown"]);
  const sweetness = wineEnum<ProductWineSweetness>(record.sweetness, ["dry", "off_dry", "sweet", "unknown"]);
  const grapes = normalizeProductStringList(record.grapes ?? record.grape, 12);
  const tastingNotes = normalizeProductStringList(record.tastingNotes ?? record.notes, 20);
  const region = cleanString(record.region, 120);
  const denomination = cleanString(record.denomination ?? record.appellation, 120);
  const country = cleanString(record.country, 80);
  const vintage = finiteNumber(record.vintage, 1800, 2200);
  const abv = finiteNumber(record.abv, 0, 100);
  const profile: ProductWineProfile = {};
  if (style) profile.style = style;
  if (body) profile.body = body;
  if (sweetness) profile.sweetness = sweetness;
  if (grapes.length) profile.grapes = grapes;
  if (region) profile.region = region;
  if (denomination) profile.denomination = denomination;
  if (country) profile.country = country;
  if (vintage !== undefined) profile.vintage = Math.round(vintage);
  if (abv !== undefined) profile.abv = abv;
  if (tastingNotes.length) profile.tastingNotes = tastingNotes;
  return Object.keys(profile).length ? profile : undefined;
}

export type ReadProductGastronomyResult = {
  gastronomy: ProductGastronomy;
  /** true solo cuando el documento contiene explícitamente un campo de alérgenos, aunque sea []. */
  hasAllergenInformation: boolean;
  source: "canonical" | "legacy" | "none";
};

/**
 * Lee el nuevo modelo canónico y mantiene compatibilidad de lectura con campos históricos.
 * Nunca interpreta la ausencia de alérgenos como "sin alérgenos".
 */
export function readProductGastronomy(product: Product | Record<string, unknown>): ReadProductGastronomyResult {
  const record = product as unknown as Record<string, unknown>;
  const canonical = asRecord(record.gastronomy);
  const source: ReadProductGastronomyResult["source"] = canonical
    ? "canonical"
    : record.ingredientes != null || record.ingredients != null || record.alergenos != null || record.allergens != null
      ? "legacy"
      : "none";

  const ingredientRaw = canonical?.ingredients ?? record.ingredientes ?? record.ingredients ?? record.ingredientList;
  const hasCanonicalAllergens = canonical ? Object.prototype.hasOwnProperty.call(canonical, "allergens") : false;
  const legacyAllergenKey = Object.prototype.hasOwnProperty.call(record, "alergenos")
    ? "alergenos"
    : Object.prototype.hasOwnProperty.call(record, "allergens")
      ? "allergens"
      : null;
  const allergenRaw = hasCanonicalAllergens
    ? canonical?.allergens
    : legacyAllergenKey
      ? record[legacyAllergenKey]
      : undefined;
  const calories = finiteNumber(
    canonical?.caloriesKcal ?? record.caloriesKcal ?? record.calorias ?? record.kcal,
    0,
    10000,
  );
  const wine = normalizeProductWineProfile(canonical?.wine ?? record.wineProfile ?? record.wine);
  const description = cleanString(canonical?.description ?? record.description ?? record.descripcion, 1000);

  const gastronomy: ProductGastronomy = {};
  const ingredients = normalizeProductStringList(ingredientRaw);
  if (description) gastronomy.description = description;
  if (ingredients.length) gastronomy.ingredients = ingredients;
  if (hasCanonicalAllergens || legacyAllergenKey) gastronomy.allergens = normalizeProductAllergens(allergenRaw);
  if (calories !== undefined) gastronomy.caloriesKcal = calories;
  if (wine) gastronomy.wine = wine;

  return {
    gastronomy,
    hasAllergenInformation: hasCanonicalAllergens || legacyAllergenKey !== null,
    source,
  };
}

export function productGastronomyToFirestore(value: ProductGastronomy): ProductGastronomy {
  const normalized = readProductGastronomy({ gastronomy: value }).gastronomy;
  return normalized;
}
