/** Catálogo: producto vendible individual vs. compuesto (sin mixers ni receta obligatoria). */
export const PRODUCT_COMPOSITION_TYPE_VALUES = ["simple", "composed"] as const;

export type ProductCompositionType = (typeof PRODUCT_COMPOSITION_TYPE_VALUES)[number];

export const DEFAULT_PRODUCT_COMPOSITION_TYPE: ProductCompositionType = "simple";

export function isProductCompositionType(
  value: unknown,
): value is ProductCompositionType {
  return value === "simple" || value === "composed";
}

/** Lectura Firestore / UI: ausente o desconocido → `simple`. */
export function normalizeProductCompositionType(
  raw: unknown,
): ProductCompositionType {
  if (isProductCompositionType(raw)) return raw;
  return DEFAULT_PRODUCT_COMPOSITION_TYPE;
}
