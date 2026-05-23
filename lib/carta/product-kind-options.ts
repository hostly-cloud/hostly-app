/** Clasificación de inventario (qué es el artículo). Distinto de `tipoVenta` (venta) y de estación (KDS). */
export const PRODUCT_KIND_VALUES = ["drink", "food", "other"] as const;

export type ProductKind = (typeof PRODUCT_KIND_VALUES)[number];

export type ProductKindOption = {
  value: ProductKind;
  label: string;
};

export const PRODUCT_KIND_OPTIONS: readonly ProductKindOption[] = [
  { value: "drink", label: "Bebida" },
  { value: "food", label: "Comida" },
  { value: "other", label: "Otro / General" },
] as const;

export const DEFAULT_PRODUCT_KIND: ProductKind = "other";

/** Filtro de listado inventario (UI). */
export type ProductKindListFilter = "all" | ProductKind | "unclassified";

export const PRODUCT_KIND_LIST_FILTER_OPTIONS: readonly {
  id: ProductKindListFilter;
  label: string;
}[] = [
  { id: "all", label: "Todos" },
  { id: "drink", label: "Bebidas" },
  { id: "food", label: "Comida" },
  { id: "other", label: "Otro / General" },
  { id: "unclassified", label: "Sin clasificar" },
] as const;

export function matchesProductKindListFilter(
  stored: ProductKind | null | undefined,
  filter: ProductKindListFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "unclassified") return stored == null;
  return stored === filter;
}

export function isProductKind(value: unknown): value is ProductKind {
  return value === "drink" || value === "food" || value === "other";
}

/** Normaliza lectura Firestore; valores desconocidos → `other` (sin inferir desde tipoVenta). */
export function normalizeProductKind(raw: unknown): ProductKind {
  if (isProductKind(raw)) return raw;
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "drink" || s === "bebida" || s === "beverage") return "drink";
  if (s === "food" || s === "comida" || s === "plato") return "food";
  if (s === "other" || s === "otro" || s === "general") return "other";
  return DEFAULT_PRODUCT_KIND;
}

export function getProductKindLabel(kind: ProductKind | null | undefined): string {
  const k = kind ? normalizeProductKind(kind) : DEFAULT_PRODUCT_KIND;
  const opt = PRODUCT_KIND_OPTIONS.find((o) => o.value === k);
  return opt?.label ?? "Otro / General";
}

/** Etiqueta en ficha: sin valor persistido → “Sin clasificar” (no reescribe Firestore). */
export function getProductKindDisplayLabel(
  stored: ProductKind | null | undefined,
): string {
  if (stored == null) return "Sin clasificar";
  return getProductKindLabel(stored);
}

/** Valor para `<select>`; sin productKind guardado → `other`. */
export function productKindToSelectValue(raw: unknown): ProductKind {
  if (raw == null || (typeof raw === "string" && !raw.trim())) {
    return DEFAULT_PRODUCT_KIND;
  }
  return normalizeProductKind(raw);
}
