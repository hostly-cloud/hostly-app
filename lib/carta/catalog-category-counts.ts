import type { PlatoCarta } from "@/lib/carta/product-sale-contract";
import type { ProductDocument } from "@/lib/firestore/products";

/** Conteo de productos por `categoriaCartaId` en una proyección de catálogo. */
export function countProductsByCategoryIdFromPlatos(
  platos: readonly PlatoCarta[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of platos) {
    const id = p.categoriaCartaId?.trim();
    if (!id) continue;
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

/** Conteo de productos por `categoryId` (catálogo central Firestore). */
export function countProductsByCategoryIdFromCentral(
  docs: readonly ProductDocument[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const doc of docs) {
    const id = doc.categoryId?.trim();
    if (!id) continue;
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

export function countOrganizedProductsFromPlatos(platos: readonly PlatoCarta[]): number {
  return platos.filter((p) => Boolean(p.categoriaCartaId?.trim())).length;
}

export function countOrganizedProductsFromCentral(docs: readonly ProductDocument[]): number {
  return docs.filter((d) => Boolean(d.categoryId?.trim())).length;
}
