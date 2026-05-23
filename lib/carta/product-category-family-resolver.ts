import type { CategoryProductFamilyFields } from "@/lib/carta/category-product-family";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import {
  PRODUCT_FAMILY_TYPE_LABELS,
  type ProductFamilyType,
} from "@/lib/carta/product-family-types";

export type ProductFamilyDenormFields = {
  productFamilyId?: string;
  productFamilyName?: string;
  productFamilyType?: ProductFamilyType;
  /** Al guardar en Firestore: limpiar campos denormalizados. */
  clearProductFamily?: boolean;
};

export type ProductFamilyDenormSource = {
  productFamilyId?: string | null;
  productFamilyName?: string | null;
  productFamilyType?: ProductFamilyType | null;
};

export function resolveProductFamilyFromCategory(
  categoryId: string | null | undefined,
  categories: readonly CartaCategoria[],
): CartaCategoria | undefined {
  const cid = typeof categoryId === "string" ? categoryId.trim() : "";
  if (!cid) return undefined;
  return categories.find((c) => c.id === cid);
}

export function buildProductFamilyPatchFromCategory(
  category: Pick<CartaCategoria, keyof CategoryProductFamilyFields> | null | undefined,
): ProductFamilyDenormFields {
  if (!category) {
    return { clearProductFamily: true };
  }
  const productFamilyId = category.productFamilyId?.trim();
  const productFamilyName = category.productFamilyName?.trim();
  const productFamilyType = category.productFamilyType;
  if (!productFamilyId || !productFamilyType) {
    return { clearProductFamily: true };
  }
  return {
    productFamilyId,
    ...(productFamilyName ? { productFamilyName } : {}),
    productFamilyType,
  };
}

export function buildProductFamilyPatchFromCategoryId(
  categoryId: string | null | undefined,
  categories: readonly CartaCategoria[],
): ProductFamilyDenormFields {
  return buildProductFamilyPatchFromCategory(
    resolveProductFamilyFromCategory(categoryId, categories),
  );
}

export function productFamilyFieldsToFirestorePatch(
  fields: ProductFamilyDenormFields,
): Record<string, unknown> {
  if (fields.clearProductFamily) {
    return {
      productFamilyId: null,
      productFamilyName: null,
      productFamilyType: null,
    };
  }
  if (
    fields.productFamilyId &&
    fields.productFamilyName &&
    fields.productFamilyType
  ) {
    return {
      productFamilyId: fields.productFamilyId,
      productFamilyName: fields.productFamilyName,
      productFamilyType: fields.productFamilyType,
    };
  }
  return {};
}

export function getProductFamilyLabel(product: ProductFamilyDenormSource): string {
  const denorm = product.productFamilyName?.trim();
  if (denorm) return denorm;
  const type = product.productFamilyType;
  if (type && PRODUCT_FAMILY_TYPE_LABELS[type]) {
    return PRODUCT_FAMILY_TYPE_LABELS[type];
  }
  return "Sin familia";
}

export function hasProductFamily(product: ProductFamilyDenormSource): boolean {
  return Boolean(
    product.productFamilyId?.trim() ||
      product.productFamilyName?.trim() ||
      product.productFamilyType,
  );
}
