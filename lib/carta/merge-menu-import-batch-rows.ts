import type { ExtractedMenuRow } from "@/lib/carta/mock-menu-photo-import";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedPrice(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

function identityKey(row: ExtractedMenuRow): string {
  return `${normalize(row.nombre)}::${normalizedPrice(row.precio) ?? ""}`;
}

function nameKey(row: ExtractedMenuRow): string {
  return normalize(row.nombre);
}

function rowQuality(row: ExtractedMenuRow): number {
  let score = 0;
  if (normalizedPrice(row.precio) != null) score += 4;
  if ((row.categoria ?? "").trim()) score += 2;
  if ((row.descripcion ?? "").trim()) score += 1;
  if (row.needsReview !== true) score += 1;
  if (row.confianza != null && Number.isFinite(row.confianza)) score += row.confianza;
  return score;
}

/**
 * Une varias páginas de una misma carta sin crear duplicados obvios.
 * - misma identidad nombre+precio: conserva la fila de mayor calidad;
 * - mismo nombre con precios distintos: conserva ambas (pueden ser formatos/tamaños reales);
 * - el orden respeta el orden de páginas y de aparición dentro de cada página.
 */
export function mergeMenuImportBatchRows(pages: ExtractedMenuRow[][]): ExtractedMenuRow[] {
  const merged: ExtractedMenuRow[] = [];
  const indexByIdentity = new Map<string, number>();
  const pricesByName = new Map<string, Set<number | null>>();

  for (const rows of pages) {
    for (const row of rows) {
      const name = nameKey(row);
      if (!name) continue;
      const key = identityKey(row);
      const existingIndex = indexByIdentity.get(key);
      if (existingIndex != null) {
        if (rowQuality(row) > rowQuality(merged[existingIndex])) {
          merged[existingIndex] = row;
        }
        continue;
      }

      const price = normalizedPrice(row.precio);
      const seenPrices = pricesByName.get(name) ?? new Set<number | null>();
      seenPrices.add(price);
      pricesByName.set(name, seenPrices);

      indexByIdentity.set(key, merged.length);
      merged.push(row);
    }
  }

  return merged;
}
