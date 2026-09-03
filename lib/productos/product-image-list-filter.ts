export type ProductImageListItem = {
  fotoUrl?: string | null;
};

export function productHasListImage(product: ProductImageListItem): boolean {
  return Boolean(product.fotoUrl?.trim());
}

export function countProductsMissingListImage<T extends ProductImageListItem>(
  products: readonly T[],
): number {
  let count = 0;
  for (const product of products) {
    if (!productHasListImage(product)) count += 1;
  }
  return count;
}

export function filterProductsMissingListImage<T extends ProductImageListItem>(
  products: readonly T[],
): T[] {
  return products.filter((product) => !productHasListImage(product));
}
