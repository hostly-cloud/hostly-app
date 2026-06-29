import type { FloorPlanCanvasSize } from "@/lib/firestore/floorPlans";
import {
  getDefaultSizeForPlanElementType,
  type PlanElementType,
  type Table,
} from "@/lib/firestore/tables";

/** Factor de escala del layout TPV operativo (solo render; no muta Firestore). */
export const TPV_OPERATIONAL_MAP_VISUAL_SCALE = 1.4;

/** Margen del auto-fit TPV (px totales restados del viewport). */
export const TPV_OPERATIONAL_FIT_PADDING_PX = 4;

/** Tope de zoom del auto-fit TPV (evita techo artificial bajo). */
export const TPV_OPERATIONAL_FIT_ZOOM_MAX_DESKTOP = 3.4;
export const TPV_OPERATIONAL_FIT_ZOOM_MAX_MOBILE = 3.8;

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

function finiteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function finitePositive(n: unknown): n is number {
  return finiteNumber(n) && n > 0;
}

/**
 * Escala posición y tamaño de un elemento del plano de forma proporcional.
 * Preserva la distribución relativa del restaurante (sin “engordar” mesas aisladas).
 */
export function scaleTpvOperationalMapElement(
  element: Table,
  scale: number = TPV_OPERATIONAL_MAP_VISUAL_SCALE,
): Table {
  if (scale === 1) return element;

  const defaults = getDefaultSizeForPlanElementType(element.type);
  const baseW = finitePositive(element.width) ? element.width : defaults.width;
  const baseH = finitePositive(element.height) ? element.height : defaults.height;
  const baseX = finiteNumber(element.x) ? element.x : 0;
  const baseY = finiteNumber(element.y) ? element.y : 0;

  return {
    ...element,
    x: baseX * scale,
    y: baseY * scale,
    width: baseW * scale,
    height: baseH * scale,
  };
}

export function scaleTpvOperationalMapElements(
  elements: Table[],
  scale: number = TPV_OPERATIONAL_MAP_VISUAL_SCALE,
): Table[] {
  if (scale === 1) return elements;
  return elements.map((element) => scaleTpvOperationalMapElement(element, scale));
}

export function scaleTpvOperationalPlanSize(
  planSize: FloorPlanCanvasSize,
  scale: number = TPV_OPERATIONAL_MAP_VISUAL_SCALE,
): FloorPlanCanvasSize {
  if (scale === 1) return planSize;
  return {
    width: planSize.width * scale,
    height: planSize.height * scale,
  };
}
