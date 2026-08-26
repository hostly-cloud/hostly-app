import type { InventoryUnit } from "@/lib/inventory/inventory-units";

export type MenuInventorySourceItem = {
  name: string;
  categoryName?: string;
  type?: string;
};

export type InventoryMenuSuggestion = {
  id: string;
  nombre: string;
  unidad: InventoryUnit;
  stock_actual: number;
  stock_minimo: number;
  categoria?: string;
  source: "menu" | "base";
  confidence?: number;
  matchedFrom: string[];
};

type IngredientDef = {
  aliases: string[];
  nombre: string;
  unidad: InventoryUnit;
  categoria?: string;
};

const INGREDIENTS: IngredientDef[] = [
  { aliases: ["tomate", "tomates"], nombre: "Tomate", unidad: "kg", categoria: "verdura" },
  { aliases: ["albahaca"], nombre: "Albahaca", unidad: "g", categoria: "verdura" },
  { aliases: ["ajo"], nombre: "Ajo", unidad: "kg", categoria: "verdura" },
  { aliases: ["rucula", "rúcula"], nombre: "Rúcula", unidad: "kg", categoria: "verdura" },
  { aliases: ["pan", "baguette", "chapata", "tostada", "tostado"], nombre: "Pan", unidad: "uds", categoria: "panadería" },
  { aliases: ["salmon", "salmón"], nombre: "Salmón", unidad: "kg", categoria: "pescado" },
  { aliases: ["espinaca", "espinacas"], nombre: "Espinacas", unidad: "kg", categoria: "verdura" },
  { aliases: ["mantequilla"], nombre: "Mantequilla", unidad: "kg", categoria: "lácteos" },
  { aliases: ["ternera", "vitello", "vacuno", "buey"], nombre: "Ternera", unidad: "kg", categoria: "carne" },
  { aliases: ["atun", "atún", "tonnato"], nombre: "Atún", unidad: "kg", categoria: "pescado" },
  { aliases: ["alcaparra", "alcaparras"], nombre: "Alcaparras", unidad: "g", categoria: "conservas" },
  { aliases: ["queso", "parmesano", "mozzarella", "burrata", "pecorino"], nombre: "Queso", unidad: "kg", categoria: "lácteos" },
  { aliases: ["pasta", "espagueti", "spaghetti", "tagliatelle", "rigatoni", "penne"], nombre: "Pasta", unidad: "kg", categoria: "dry" },
  { aliases: ["arroz"], nombre: "Arroz", unidad: "kg", categoria: "dry" },
  { aliases: ["pollo"], nombre: "Pollo", unidad: "kg", categoria: "carne" },
  { aliases: ["cerdo", "lomo", "secreto"], nombre: "Cerdo", unidad: "kg", categoria: "carne" },
  { aliases: ["patata", "patatas"], nombre: "Patata", unidad: "kg", categoria: "verdura" },
  { aliases: ["huevo", "huevos"], nombre: "Huevo", unidad: "uds", categoria: "huevos" },
  { aliases: ["leche"], nombre: "Leche", unidad: "l", categoria: "lácteos" },
  { aliases: ["nata"], nombre: "Nata", unidad: "l", categoria: "lácteos" },
  { aliases: ["cebolla", "cebollas"], nombre: "Cebolla", unidad: "kg", categoria: "verdura" },
  { aliases: ["zanahoria", "zanahorias"], nombre: "Zanahoria", unidad: "kg", categoria: "verdura" },
  { aliases: ["lechuga"], nombre: "Lechuga", unidad: "uds", categoria: "verdura" },
  { aliases: ["limon", "limón"], nombre: "Limón", unidad: "kg", categoria: "fruta" },
  { aliases: ["aceite", "aove"], nombre: "Aceite de oliva", unidad: "l", categoria: "aceites" },
  { aliases: ["sal"], nombre: "Sal", unidad: "kg", categoria: "condimentos" },
  { aliases: ["pimiento", "pimientos"], nombre: "Pimiento", unidad: "kg", categoria: "verdura" },
  { aliases: ["champinon", "champiñon", "champiñones", "setas"], nombre: "Champiñones", unidad: "kg", categoria: "verdura" },
  { aliases: ["gamba", "gambas", "langostino", "langostinos"], nombre: "Gambas", unidad: "kg", categoria: "marisco" },
  { aliases: ["bacalao"], nombre: "Bacalao", unidad: "kg", categoria: "pescado" },
  { aliases: ["merluza"], nombre: "Merluza", unidad: "kg", categoria: "pescado" },
  { aliases: ["calamar", "calamares", "pulpo"], nombre: "Calamar", unidad: "kg", categoria: "marisco" },
  { aliases: ["jamon", "jamón", "serrano", "ibérico", "iberico"], nombre: "Jamón", unidad: "kg", categoria: "embutidos" },
  { aliases: ["perejil"], nombre: "Perejil", unidad: "g", categoria: "verdura" },
  { aliases: ["aguacate"], nombre: "Aguacate", unidad: "kg", categoria: "fruta" },
  { aliases: ["anchoa", "anchoas"], nombre: "Anchoas", unidad: "g", categoria: "conservas" },
  { aliases: ["oliva", "olivas", "aceituna", "aceitunas"], nombre: "Aceitunas", unidad: "kg", categoria: "conservas" },
];

const ONBOARDING_BASE_STOCK: Array<{
  nombre: string;
  unidad: InventoryUnit;
  stock_actual: number;
  stock_minimo: number;
  categoria?: string;
}> = [
  { nombre: "Arroz", unidad: "kg", stock_actual: 8, stock_minimo: 3, categoria: "dry" },
  { nombre: "Aceite de oliva", unidad: "l", stock_actual: 5, stock_minimo: 2, categoria: "aceites" },
  { nombre: "Sal", unidad: "kg", stock_actual: 2, stock_minimo: 0.5, categoria: "condimentos" },
  { nombre: "Tomate", unidad: "kg", stock_actual: 6, stock_minimo: 4, categoria: "verdura" },
  { nombre: "Cerveza", unidad: "uds", stock_actual: 120, stock_minimo: 48, categoria: "bebidas" },
  { nombre: "Vino", unidad: "l", stock_actual: 12, stock_minimo: 6, categoria: "bebidas" },
  { nombre: "Leche", unidad: "l", stock_actual: 10, stock_minimo: 4, categoria: "lácteos" },
  { nombre: "Pasta", unidad: "kg", stock_actual: 5, stock_minimo: 2, categoria: "dry" },
];

export const MENU_INVENTORY_STOP_WORDS = new Set([
  "marinado", "marinada", "ensalada", "plato", "racion", "ración", "casero", "casera", "especial",
  "salsa", "fresco", "fresca", "baby", "gratinado", "gratinada", "carpaccio", "tartar", "variacion",
  "variación", "bruschetta", "crostini", "tartare", "tataki", "ceviche", "tempura", "rebozado", "rebozada",
  "crujiente", "tradicional", "casolana", "chef", "del", "dia", "día", "casa", "mini", "medio", "media",
  "doble", "porcion", "porción", "entrante", "principal", "postre", "menu", "menú", "mix", "combo", "sugerencia",
  "recomendacion", "recomendación", "artesano", "artesana", "suprema", "supremo", "clasico", "clásico", "clasica",
  "clásica", "light", "vegano", "vegana", "vegetariano", "vegetariana", "sin", "gluten", "lactosa", "opcion",
  "opción", "nuestra", "nuestro", "nuestras", "nuestros", "con", "de", "la", "el", "los", "las", "y", "e",
  "a", "en", "al", "un", "una", "unos", "unas", "para", "sobre", "base", "estilo", "tipo", "version",
  "versión", "producto", "crema",
]);

const CONTEXTUAL_DISH_RULES: Array<{ pattern: RegExp; def: IngredientDef; confidence: number }> = [
  { pattern: /\bbruschetta\b|\bcrostini\b/i, def: INGREDIENTS.find((x) => x.nombre === "Pan")!, confidence: 0.72 },
  { pattern: /\btostad[oa]s?\b/i, def: INGREDIENTS.find((x) => x.nombre === "Pan")!, confidence: 0.78 },
  { pattern: /\bvitello\s+tonnato\b|\btonnato\b/i, def: INGREDIENTS.find((x) => x.nombre === "Alcaparras")!, confidence: 0.7 },
];

const ALIAS_TO_DEF = new Map<string, IngredientDef>();
for (const def of INGREDIENTS) {
  for (const alias of def.aliases) ALIAS_TO_DEF.set(normalizeInventoryToken(alias), def);
}
const SORTED_ALIASES = [...ALIAS_TO_DEF.entries()].sort((a, b) => b[0].length - a[0].length);

export function normalizeInventoryToken(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function dishSearchText(item: MenuInventorySourceItem): string {
  return [item.name, item.categoryName].filter(Boolean).join(" ").trim();
}

function extractCandidateTokens(dishName: string): string[] {
  const cleaned = dishName.replace(/\([^)]*\)/g, " ").replace(/\s+[–—-]\s+.*/g, " ").trim();
  const tokens = new Set<string>();
  for (const segment of cleaned.split(/[,;/|]+/)) {
    const normalizedSegment = segment.replace(/\s+(?:con|de|del|la|el|los|las|y|e|&|\+|a|en|al)\s+/gi, ",").replace(/\s+/g, " ").trim();
    for (const part of normalizedSegment.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      tokens.add(trimmed);
      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length >= 2) tokens.add(words.slice(-2).join(" "));
      for (const word of words) if (word.length >= 3) tokens.add(word);
    }
  }
  return [...tokens];
}

function isStopWord(token: string): boolean {
  const n = normalizeInventoryToken(token);
  return !n || MENU_INVENTORY_STOP_WORDS.has(n) || /^\d+$/.test(n) || n.length < 3;
}

function matchIngredientFromToken(token: string): IngredientDef | null {
  const n = normalizeInventoryToken(token);
  return !n || isStopWord(n) ? null : ALIAS_TO_DEF.get(n) ?? null;
}

function matchIngredientsInDishName(dishName: string): Array<{ def: IngredientDef; confidence: number }> {
  const normalizedDish = normalizeInventoryToken(dishName);
  if (!normalizedDish) return [];
  const found = new Map<string, { def: IngredientDef; confidence: number }>();
  for (const [alias, def] of SORTED_ALIASES) {
    if (alias.length < 4 || !normalizedDish.includes(alias)) continue;
    const key = normalizeInventoryToken(def.nombre);
    if (!found.has(key)) found.set(key, { def, confidence: alias.length >= 6 ? 0.88 : 0.8 });
  }
  for (const rule of CONTEXTUAL_DISH_RULES) {
    if (!rule.pattern.test(dishName)) continue;
    const key = normalizeInventoryToken(rule.def.nombre);
    if (!found.has(key)) found.set(key, { def: rule.def, confidence: rule.confidence });
  }
  return [...found.values()];
}

function suggestionKey(def: IngredientDef): string {
  return normalizeInventoryToken(def.nombre);
}

export type SuggestInventoryFromMenuOptions = { existingProductNames?: string[] };

export function hasMenuInventorySources(items: MenuInventorySourceItem[]): boolean {
  return items.some((item) => dishSearchText(item).length > 0);
}

export function suggestInventoryFromMenu(menuItems: MenuInventorySourceItem[], options: SuggestInventoryFromMenuOptions = {}): InventoryMenuSuggestion[] {
  const existing = new Set((options.existingProductNames ?? []).map(normalizeInventoryToken).filter(Boolean));
  const merged = new Map<string, InventoryMenuSuggestion>();
  for (const item of menuItems) {
    const dish = dishSearchText(item);
    if (!dish) continue;
    const defs = new Map<string, { def: IngredientDef; confidence: number }>();
    for (const token of extractCandidateTokens(dish)) {
      const def = matchIngredientFromToken(token);
      if (def) defs.set(suggestionKey(def), { def, confidence: 0.74 });
    }
    for (const hit of matchIngredientsInDishName(dish)) {
      const key = suggestionKey(hit.def);
      const previous = defs.get(key);
      if (!previous || hit.confidence > previous.confidence) defs.set(key, hit);
    }
    for (const { def, confidence } of defs.values()) {
      const key = suggestionKey(def);
      if (existing.has(key)) continue;
      const previous = merged.get(key);
      const matchedFrom = previous ? [...new Set([...previous.matchedFrom, item.name])].slice(0, 4) : [item.name];
      merged.set(key, {
        id: `menu-${key.replace(/\s+/g, "-")}`,
        nombre: def.nombre,
        unidad: def.unidad,
        stock_actual: 0,
        stock_minimo: def.unidad === "uds" ? 10 : def.unidad === "g" || def.unidad === "ml" ? 500 : 2,
        categoria: def.categoria,
        source: "menu",
        confidence: Math.max(previous?.confidence ?? 0, confidence),
        matchedFrom,
      });
    }
  }
  return [...merged.values()].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || a.nombre.localeCompare(b.nombre, "es"));
}

export function getOnboardingBaseInventory(existingProductNames: string[] = []): InventoryMenuSuggestion[] {
  const existing = new Set(existingProductNames.map(normalizeInventoryToken).filter(Boolean));
  return ONBOARDING_BASE_STOCK.filter((row) => !existing.has(normalizeInventoryToken(row.nombre))).map((row) => ({
    id: `base-${normalizeInventoryToken(row.nombre).replace(/\s+/g, "-")}`,
    ...row,
    source: "base" as const,
    matchedFrom: [],
  }));
}
