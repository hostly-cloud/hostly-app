export const PRODUCT_CATEGORY_ALL_ID = "__all__";
export const PRODUCT_CATEGORY_UNCATEGORIZED_ID = "__uncat__";

const DETECTED_CATEGORY_ID_PREFIX = "__detected_category__:";
const DETECTED_CATEGORY_NAME_PREFIX = "__detected_category_name__:";

export type ProductCategoryNavigationCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export type ProductCategoryNavigationProduct = {
  categoriaCartaId?: string | null;
  categoria?: string | null;
};

export type ProductCategoryNavigationOption = {
  id: string;
  label: string;
  count: number;
  kind: "all" | "category" | "uncategorized";
  categoryId: string | null;
  normalizedName: string | null;
  isConfigured: boolean;
};

export function normalizeProductCategoryName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function readProductCategory(
  product: ProductCategoryNavigationProduct,
): { categoryId: string; name: string; normalizedName: string } {
  const categoryId = product.categoriaCartaId?.trim() ?? "";
  const name = product.categoria?.trim() ?? "";
  return {
    categoryId,
    name,
    normalizedName: normalizeProductCategoryName(name),
  };
}

export function matchesProductCategoryNavigationOption(
  product: ProductCategoryNavigationProduct,
  option: ProductCategoryNavigationOption,
): boolean {
  if (option.kind === "all") return true;

  const productCategory = readProductCategory(product);
  if (option.kind === "uncategorized") {
    return !productCategory.categoryId && !productCategory.normalizedName;
  }

  if (option.categoryId && productCategory.categoryId === option.categoryId) {
    return true;
  }

  return (
    !productCategory.categoryId &&
    Boolean(option.normalizedName) &&
    productCategory.normalizedName === option.normalizedName
  );
}

export function buildProductCategoryNavigationOptions(
  configuredCategories: readonly ProductCategoryNavigationCategory[],
  products: readonly ProductCategoryNavigationProduct[],
  labels: { all: string; uncategorized: string },
): ProductCategoryNavigationOption[] {
  const configured = [...configuredCategories].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
  );
  const categoryOptions: ProductCategoryNavigationOption[] = [];
  const optionByCategoryId = new Map<string, ProductCategoryNavigationOption>();
  const optionByName = new Map<string, ProductCategoryNavigationOption>();

  for (const category of configured) {
    const categoryId = category.id.trim();
    const label = category.name.trim();
    if (!categoryId || !label) continue;
    const normalizedName = normalizeProductCategoryName(label);
    const option: ProductCategoryNavigationOption = {
      id: categoryId,
      label,
      count: 0,
      kind: "category",
      categoryId,
      normalizedName: normalizedName || null,
      isConfigured: true,
    };
    categoryOptions.push(option);
    optionByCategoryId.set(categoryId, option);
    if (normalizedName && !optionByName.has(normalizedName)) {
      optionByName.set(normalizedName, option);
    }
  }

  const detectedOptions: ProductCategoryNavigationOption[] = [];
  for (const product of products) {
    const productCategory = readProductCategory(product);
    if (!productCategory.categoryId && !productCategory.normalizedName) continue;
    if (productCategory.categoryId && optionByCategoryId.has(productCategory.categoryId)) {
      continue;
    }
    if (productCategory.normalizedName && optionByName.has(productCategory.normalizedName)) {
      continue;
    }

    const label = productCategory.name || "Categoría sin nombre";
    const id = productCategory.categoryId
      ? `${DETECTED_CATEGORY_ID_PREFIX}${productCategory.categoryId}`
      : `${DETECTED_CATEGORY_NAME_PREFIX}${encodeURIComponent(productCategory.normalizedName)}`;
    const option: ProductCategoryNavigationOption = {
      id,
      label,
      count: 0,
      kind: "category",
      categoryId: productCategory.categoryId || null,
      normalizedName: productCategory.normalizedName || null,
      isConfigured: false,
    };
    detectedOptions.push(option);
    if (productCategory.categoryId) optionByCategoryId.set(productCategory.categoryId, option);
    if (productCategory.normalizedName) optionByName.set(productCategory.normalizedName, option);
  }

  detectedOptions.sort((a, b) =>
    a.label.localeCompare(b.label, "es", { sensitivity: "base" }),
  );
  categoryOptions.push(...detectedOptions);

  const allOption: ProductCategoryNavigationOption = {
    id: PRODUCT_CATEGORY_ALL_ID,
    label: labels.all,
    count: products.length,
    kind: "all",
    categoryId: null,
    normalizedName: null,
    isConfigured: false,
  };
  const uncategorizedOption: ProductCategoryNavigationOption = {
    id: PRODUCT_CATEGORY_UNCATEGORIZED_ID,
    label: labels.uncategorized,
    count: 0,
    kind: "uncategorized",
    categoryId: null,
    normalizedName: null,
    isConfigured: false,
  };

  for (const product of products) {
    let matched = false;
    for (const option of categoryOptions) {
      if (!matchesProductCategoryNavigationOption(product, option)) continue;
      option.count += 1;
      matched = true;
      break;
    }
    if (!matched && matchesProductCategoryNavigationOption(product, uncategorizedOption)) {
      uncategorizedOption.count += 1;
    }
  }

  return uncategorizedOption.count > 0
    ? [allOption, ...categoryOptions, uncategorizedOption]
    : [allOption, ...categoryOptions];
}
