import type { ProductDocument } from "@/lib/firestore/products";
import type { PlatoCarta } from "@/lib/platos-local";
import type { Product } from "@/types/product";

/** Productos sin `sortOrder` explícito van después de los que sí lo tienen. */
export const PRODUCT_SORT_ORDER_MISSING = Number.MAX_SAFE_INTEGER;

export function readProductSortOrder(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  return undefined;
}

export function productSortOrderKey(
  sortOrder: number | undefined | null,
): number {
  const n = readProductSortOrder(sortOrder);
  return n == null ? PRODUCT_SORT_ORDER_MISSING : n;
}

export function compareBySortOrderAndName(
  sortOrderA: number | undefined | null,
  nameA: string,
  sortOrderB: number | undefined | null,
  nameB: string,
  locale: string | string[] = "es",
): number {
  const oa = productSortOrderKey(sortOrderA);
  const ob = productSortOrderKey(sortOrderB);
  if (oa !== ob) return oa - ob;
  return nameA.localeCompare(nameB, locale, { sensitivity: "base" });
}

export function compareProductDocuments(
  a: ProductDocument,
  b: ProductDocument,
): number {
  return compareBySortOrderAndName(a.sortOrder, a.name, b.sortOrder, b.name);
}

export function readPlatoCartaSortOrder(p: PlatoCarta): number | undefined {
  return readProductSortOrder(p.sortOrder) ?? readProductSortOrder(p.ordenEnCategoria);
}

export function comparePlatoCarta(a: PlatoCarta, b: PlatoCarta): number {
  return compareBySortOrderAndName(
    readPlatoCartaSortOrder(a),
    a.nombre,
    readPlatoCartaSortOrder(b),
    b.nombre,
  );
}

export function compareOperationalProducts(a: Product, b: Product): number {
  return compareBySortOrderAndName(a.sortOrder, a.nombre, b.sortOrder, b.nombre);
}

export function maxSortOrderInCategory(
  products: Iterable<Pick<ProductDocument, "categoryId" | "sortOrder">>,
  categoryId: string | null | undefined,
): number {
  const cid = categoryId?.trim() || null;
  let max = -1;
  for (const p of products) {
    const pcid = p.categoryId?.trim() || null;
    if (pcid !== cid) continue;
    const so = readProductSortOrder(p.sortOrder);
    if (so != null) max = Math.max(max, so);
  }
  return max;
}
