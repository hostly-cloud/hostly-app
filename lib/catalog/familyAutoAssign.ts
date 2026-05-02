/**
 * Infiere la familia de modificadores deseada ("Bebidas" / "Platos") desde el texto de categoría de carta.
 * Solo heurística por palabras clave; no resuelve ids (eso hace `findModifierFamilyIdForBlock` en modificadores).
 */

function normCategory(category: string | undefined | null): string {
  return (category ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @returns Etiqueta humana alineada con nombres típicos de familia en BD, o null si no aplica.
 */
export function inferFamilyFromCategory(category: string): "Bebidas" | "Platos" | null {
  const c = normCategory(category);
  if (!c) return null;

  const bebidas = ["vino", "sangria", "cava", "champagne", "champan", "cerveza", "refresco", "coctel", "agua", "zumo", "cafe"];
  const platos = ["entrante", "primero", "segundo", "pasta", "arroz", "carne", "pescado", "postre"];

  if (bebidas.some((k) => c.includes(k))) return "Bebidas";
  if (platos.some((k) => c.includes(k))) return "Platos";
  return null;
}
