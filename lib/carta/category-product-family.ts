import type { CartaCategoriaTipo } from "@/lib/carta-categorias/types";
import type {
  ProductFamilyDocument,
  ProductFamilyType,
} from "@/lib/carta/product-family-types";
import { isProductFamilyType } from "@/lib/carta/product-family-types";

export const CATEGORY_PRODUCT_FAMILY_NONE = "";

export type CategoryProductFamilyFields = {
  productFamilyId?: string;
  productFamilyName?: string;
  productFamilyType?: ProductFamilyType;
};

export function mapCategoryTypeToProductFamilyType(
  categoryType: CartaCategoriaTipo,
): ProductFamilyType {
  if (categoryType === "drink") return "drink";
  if (categoryType === "food") return "food";
  return "other";
}

export function defaultProductFamilyIdForType(
  type: ProductFamilyType,
): string {
  if (type === "drink") return "default-drink";
  if (type === "food") return "default-food";
  return "default-other";
}

export function resolveProductFamilyForCategoryType(
  families: readonly ProductFamilyDocument[],
  categoryType: CartaCategoriaTipo,
): ProductFamilyDocument | undefined {
  const targetType = mapCategoryTypeToProductFamilyType(categoryType);
  const preferredId = defaultProductFamilyIdForType(targetType);
  const byId = families.find((f) => f.id === preferredId && f.active);
  if (byId) return byId;
  return families.find((f) => f.active && f.type === targetType);
}

export function buildCategoryProductFamilyFields(
  family: ProductFamilyDocument | null | undefined,
): CategoryProductFamilyFields {
  if (!family || !family.active) return {};
  return {
    productFamilyId: family.id,
    productFamilyName: family.name.trim(),
    productFamilyType: family.type,
  };
}

export function resolveProductFamilyFromSelectValue(
  selectValue: string,
  families: readonly ProductFamilyDocument[],
): ProductFamilyDocument | null {
  const id = selectValue.trim();
  if (!id) return null;
  const found = families.find((f) => f.id === id);
  return found && found.active ? found : null;
}

export function productFamilySelectValueFromCategory(
  category: Pick<CategoryProductFamilyFields, "productFamilyId">,
): string {
  return category.productFamilyId?.trim() ?? CATEGORY_PRODUCT_FAMILY_NONE;
}

export function resolveCategoryProductFamilyLabel(
  category: CategoryProductFamilyFields,
  families: readonly ProductFamilyDocument[],
): string {
  const fid = category.productFamilyId?.trim();
  if (fid) {
    const match = families.find((f) => f.id === fid);
    if (match) return match.name;
    const denorm = category.productFamilyName?.trim();
    if (denorm) return denorm;
  }
  return "Sin familia";
}

export function readCategoryProductFamilyType(
  raw: unknown,
): ProductFamilyType | undefined {
  return isProductFamilyType(raw) ? raw : undefined;
}
