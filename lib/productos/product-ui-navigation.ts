import type { ProductCategoryNavigationOption } from "@/lib/productos/product-category-navigation";

export function normalizeProductUiSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-ES");
}

export function filterProductCategoryNavigationOptions(
  options: readonly ProductCategoryNavigationOption[],
  query: string,
): ProductCategoryNavigationOption[] {
  const normalizedQuery = normalizeProductUiSearch(query);
  if (!normalizedQuery) return [...options];

  return options.filter((option) =>
    normalizeProductUiSearch(option.label).includes(normalizedQuery),
  );
}
