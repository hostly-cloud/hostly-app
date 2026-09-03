export type ProductImageUrlResolver<T> = (product: T) => string | null | undefined;

export function productHasResolvedImage<T>(
  product: T,
  resolveImageUrl: ProductImageUrlResolver<T>,
): boolean {
  return Boolean(resolveImageUrl(product)?.trim());
}

export function countProductsMissingResolvedImage<T>(
  products: readonly T[],
  resolveImageUrl: ProductImageUrlResolver<T>,
): number {
  let count = 0;
  for (const product of products) {
    if (!productHasResolvedImage(product, resolveImageUrl)) count += 1;
  }
  return count;
}

export function filterProductsMissingResolvedImage<T>(
  products: readonly T[],
  resolveImageUrl: ProductImageUrlResolver<T>,
): T[] {
  return products.filter(
    (product) => !productHasResolvedImage(product, resolveImageUrl),
  );
}
