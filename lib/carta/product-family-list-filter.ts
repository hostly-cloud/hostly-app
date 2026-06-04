import type { ProductFamilyDenormSource } from "@/lib/carta/product-category-family-resolver";
import {
  PRODUCT_FAMILY_TYPE_LABELS,
  isProductFamilyType,
  type ProductFamilyType,
} from "@/lib/carta/product-family-types";

/** Segmento principal Productos: comida / bebida por `productFamilyType` denormalizado. */
export type CatalogFoodDrinkSegment = "all" | "food" | "drink";

/** Filtro de listado por familia de producto (agrupación desde categoría). Distinto de `ProductKindListFilter`. */
export type ProductFamilyListFilter = "all" | ProductFamilyType | "none";

export const PRODUCT_FAMILY_LIST_FILTER_OPTIONS: readonly {
  id: ProductFamilyListFilter;
  label: string;
}[] = [
  { id: "all", label: "Todas" },
  { id: "drink", label: PRODUCT_FAMILY_TYPE_LABELS.drink },
  { id: "food", label: PRODUCT_FAMILY_TYPE_LABELS.food },
  { id: "other", label: PRODUCT_FAMILY_TYPE_LABELS.other },
  { id: "none", label: "Sin familia" },
] as const;

/** Tipo efectivo para filtrar; prioriza `productFamilyType` denormalizado en el producto. */
export function readProductFamilyTypeForFilter(
  source: ProductFamilyDenormSource,
): ProductFamilyType | null {
  if (isProductFamilyType(source.productFamilyType)) {
    return source.productFamilyType;
  }
  return null;
}

export function productHasFamilyForFilter(source: ProductFamilyDenormSource): boolean {
  const type = readProductFamilyTypeForFilter(source);
  const id = source.productFamilyId?.trim();
  return Boolean(type || id);
}

export function matchesProductFamilyListFilter(
  source: ProductFamilyDenormSource,
  filter: ProductFamilyListFilter,
): boolean {
  if (filter === "all") return true;
  const type = readProductFamilyTypeForFilter(source);
  if (filter === "none") {
    return !source.productFamilyId?.trim() && type == null;
  }
  return type === filter;
}

/** Filtro principal Todos / Comida / Bebida; `other` y sin tipo solo en Todos. */
export function matchesCatalogFoodDrinkSegment(
  source: ProductFamilyDenormSource,
  segment: CatalogFoodDrinkSegment,
): boolean {
  if (segment === "all") return true;
  return readProductFamilyTypeForFilter(source) === segment;
}

export function productFamilyDenormFromPlato(
  p: Pick<
    ProductFamilyDenormSource,
    "productFamilyId" | "productFamilyName" | "productFamilyType"
  >,
): ProductFamilyDenormSource {
  return {
    productFamilyId: p.productFamilyId ?? null,
    productFamilyName: p.productFamilyName ?? null,
    productFamilyType: p.productFamilyType ?? null,
  };
}
