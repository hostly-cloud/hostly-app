import { CATEGORY_PRODUCT_FAMILY_NONE } from "@/lib/carta/category-product-family";
import { productCatalogCourseSelectValue } from "@/lib/carta/menu-course";
import type { BulkCatalogKdsDestination } from "@/lib/firestore/central-catalog-write";
import type { ProductDocument } from "@/lib/firestore/products";
import { resolveKdsDestination } from "@/lib/kds/kds-destination";
import type { PlatoCarta } from "@/lib/platos-local";

/** Valor sentinel del `<select>` cuando la selección tiene valores distintos. */
export const BULK_SELECT_MIXED_VALUE = "__mixed__";

export function isBulkSelectMixedValue(value: string): boolean {
  return value === BULK_SELECT_MIXED_VALUE;
}

function uniqueOrMixed(values: readonly string[]): string {
  if (values.length === 0) return "";
  const unique = new Set(values);
  if (unique.size === 1) return [...unique][0]!;
  return BULK_SELECT_MIXED_VALUE;
}

function readCourseSelectValue(doc: ProductDocument | undefined): string {
  return productCatalogCourseSelectValue(doc?.course);
}

function readBulkDestinationValue(
  doc: ProductDocument | undefined,
): BulkCatalogKdsDestination | "none" {
  const dest = resolveKdsDestination(doc ?? {});
  if (dest === "kitchen" || dest === "bar" || dest === "cocktail") return dest;
  return "none";
}

function readCategorySelectValue(
  plato: PlatoCarta,
  doc: ProductDocument | undefined,
): string {
  const id = doc?.categoryId?.trim() || plato.categoriaCartaId?.trim() || "";
  return id;
}

function readFamilySelectValue(
  plato: PlatoCarta,
  doc: ProductDocument | undefined,
): string {
  const id = doc?.productFamilyId?.trim() || plato.productFamilyId?.trim() || "";
  return id || CATEGORY_PRODUCT_FAMILY_NONE;
}

export function computeBulkCourseInitialSelectValue(
  selected: readonly PlatoCarta[],
  centralDocsById: ReadonlyMap<string, ProductDocument>,
): string {
  return uniqueOrMixed(
    selected.map((p) => readCourseSelectValue(centralDocsById.get(p.id))),
  );
}

export function computeBulkDestinationInitialSelectValue(
  selected: readonly PlatoCarta[],
  centralDocsById: ReadonlyMap<string, ProductDocument>,
): BulkCatalogKdsDestination | typeof BULK_SELECT_MIXED_VALUE {
  const normalized = selected.map((p) => readBulkDestinationValue(centralDocsById.get(p.id)));
  const unique = new Set(normalized);
  if (unique.size === 1) {
    const only = [...unique][0]!;
    if (only === "none") return BULK_SELECT_MIXED_VALUE;
    return only;
  }
  return BULK_SELECT_MIXED_VALUE;
}

export function computeBulkCategoryInitialSelectValue(
  selected: readonly PlatoCarta[],
  centralDocsById: ReadonlyMap<string, ProductDocument>,
): string {
  return uniqueOrMixed(
    selected.map((p) => readCategorySelectValue(p, centralDocsById.get(p.id))),
  );
}

export function computeBulkFamilyInitialSelectValue(
  selected: readonly PlatoCarta[],
  centralDocsById: ReadonlyMap<string, ProductDocument>,
): string {
  return uniqueOrMixed(
    selected.map((p) => readFamilySelectValue(p, centralDocsById.get(p.id))),
  );
}
