import type { CatalogProductImageCandidate } from "@/lib/productos/catalog-product-image-contract";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function selectExactCatalogProductImageCandidate(
  candidates: CatalogProductImageCandidate[],
  persistedBarcode: string,
): CatalogProductImageCandidate | null {
  const expected = digitsOnly(persistedBarcode);
  if (!expected) return null;
  return (
    candidates.find(
      (candidate) => digitsOnly(candidate.externalReference) === expected,
    ) ?? null
  );
}
