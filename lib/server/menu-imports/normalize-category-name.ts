/**
 * Normalización robusta de nombres de categoría para matching y deduplicación.
 * Evita triplicar "Vino", "Vinos", "VINOS".
 */
export function normalizeCategoryName(name: string): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave de matching: normaliza y reduce plural simple en español. */
export function categoryMatchKey(name: string): string {
  let key = normalizeCategoryName(name);
  if (key.length > 3 && key.endsWith("s") && !key.endsWith("ss")) {
    key = key.slice(0, -1);
  }
  return key;
}

export function categoryNamesEquivalent(a: string, b: string): boolean {
  const ka = categoryMatchKey(a);
  const kb = categoryMatchKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length >= 4 && kb.length >= 4 && (ka.includes(kb) || kb.includes(ka))) {
    return true;
  }
  return false;
}

export function inferCategoryTypeFromName(name: string): "food" | "drink" | "general" {
  const n = normalizeCategoryName(name);
  if (
    n.includes("vino") ||
    n.includes("bebida") ||
    n.includes("coctel") ||
    n.includes("cocktail") ||
    n.includes("cerveza") ||
    n.includes("cafe") ||
    n.includes("refresco") ||
    n.includes("cava") ||
    n.includes("champagne")
  ) {
    return "drink";
  }
  if (
    n.includes("entrante") ||
    n.includes("principal") ||
    n.includes("postre") ||
    n.includes("tapa") ||
    n.includes("plato") ||
    n.includes("comida")
  ) {
    return "food";
  }
  return "general";
}
