import { type PlanElementType, type Table } from "@/lib/firestore/tables";

/** Margen del auto-fit TPV (px totales restados del viewport). */
export const TPV_OPERATIONAL_FIT_PADDING_PX = 24;

/** Tope de zoom del auto-fit TPV (evita techo artificial bajo). */
export const TPV_OPERATIONAL_FIT_ZOOM_MAX_DESKTOP = 3.4;
export const TPV_OPERATIONAL_FIT_ZOOM_MAX_MOBILE = 3.8;

/**
 * Offset de pan TPV-only aplicado tras el encuadre centrado.
 * Solo afecta al viewport; no proyecta geometría V2 ni muta datos.
 */
export const TPV_OPERATIONAL_FIT_OFFSET_X = 0;
export const TPV_OPERATIONAL_FIT_OFFSET_Y = 0;

/**
 * Multiplicador del zoom final SOLO en TPV operativo.
 * Solo afecta al viewport; no proyecta geometría V2 ni muta datos.
 */
export const TPV_OPERATIONAL_FINAL_ZOOM_MULTIPLIER = 1.0;

const TPV_VIEWPORT_FIT_ELEMENT_TYPES: PlanElementType[] = [
  "table",
  "sunbed",
  "bed",
  "custom",
];

/**
 * Elementos que definen el encuadre TPV: mesas operativas, sin decoración estructural.
 * Si no hay ninguno, conserva la lista original como fallback.
 */
export function filterTpvOperationalViewportFitElements(elements: Table[]): Table[] {
  const operational = elements.filter(
    (element) =>
      element.isActive !== false &&
      TPV_VIEWPORT_FIT_ELEMENT_TYPES.includes(element.type),
  );
  return operational.length > 0 ? operational : elements;
}
