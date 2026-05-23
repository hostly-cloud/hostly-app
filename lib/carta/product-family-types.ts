/** Tipo canónico de familia de producto (agrupación carta / inventario / análisis). */
export type ProductFamilyType = "food" | "drink" | "other";

export const PRODUCT_FAMILY_TYPES: readonly ProductFamilyType[] = [
  "drink",
  "food",
  "other",
] as const;

export const PRODUCT_FAMILY_TYPE_LABELS: Record<ProductFamilyType, string> = {
  drink: "Bebidas",
  food: "Comida",
  other: "Otros",
};

/** `restaurants/{restaurantId}/productFamilies/{familyId}` */
export type ProductFamilyDocument = {
  id: string;
  restaurantId: string;
  name: string;
  normalizedName: string;
  type: ProductFamilyType;
  active: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
};

export type ProductFamilyInput = {
  name: string;
  type: ProductFamilyType;
  active?: boolean;
  sortOrder?: number;
};

export const DEFAULT_PRODUCT_FAMILY_SPECS: readonly {
  id: string;
  name: string;
  type: ProductFamilyType;
  sortOrder: number;
}[] = [
  { id: "default-drink", name: "Bebidas", type: "drink", sortOrder: 0 },
  { id: "default-food", name: "Comida", type: "food", sortOrder: 10 },
  { id: "default-other", name: "Otros", type: "other", sortOrder: 20 },
] as const;

export function isProductFamilyType(value: unknown): value is ProductFamilyType {
  return value === "food" || value === "drink" || value === "other";
}

export function normalizeProductFamilyName(name: string): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sortProductFamilies(
  families: ProductFamilyDocument[],
): ProductFamilyDocument[] {
  return families.slice().sort((a, b) => {
    const d = a.sortOrder - b.sortOrder;
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, "es");
  });
}
