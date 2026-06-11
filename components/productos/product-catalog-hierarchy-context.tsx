"use client";

export type ProductCatalogHierarchyContextProps = {
  menuFamilyName: string | null | undefined;
  categoryName: string | null | undefined;
};

/**
 * Línea contextual solo lectura: Familia de menú → Categoría de carta.
 */
export function ProductCatalogHierarchyContext({
  menuFamilyName,
  categoryName,
}: ProductCatalogHierarchyContextProps) {
  const family = menuFamilyName?.trim();
  const category = categoryName?.trim();
  if (!family || !category) return null;

  return (
    <p className="hostly-product-form-catalog-hierarchy__context" aria-label={`${family}, ${category}`}>
      <span className="hostly-product-form-catalog-hierarchy__context-family">{family}</span>
      <span className="hostly-product-form-catalog-hierarchy__context-arrow" aria-hidden>
        →
      </span>
      <span className="hostly-product-form-catalog-hierarchy__context-category">{category}</span>
    </p>
  );
}
