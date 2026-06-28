import type { FloorPlanCanvasSize } from "@/lib/firestore/floorPlans";
import {
  getDefaultSizeForPlanElementType,
  type PlanElementType,
  type Table,
} from "@/lib/firestore/tables";

/** Rectángulo operativo en coordenadas lógicas del plano (px). */
export type OperationalViewport = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

/** Margen alrededor del cluster operativo (sillas, etiquetas, dedo táctil). */
export const OPERATIONAL_VIEWPORT_PADDING_PX = 96;

const EMPTY_CANVAS_FALLBACK: OperationalViewport = {
  minX: 0,
  minY: 0,
  maxX: 800,
  maxY: 560,
  width: 800,
  height: 560,
  centerX: 400,
  centerY: 280,
};

export type GetOperationalViewportOptions = {
  paddingPx?: number;
};

function finalizeBounds(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): OperationalViewport {
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function elementLogicalSize(el: Table): { w: number; h: number } {
  const def = getDefaultSizeForPlanElementType(el.type);
  const w =
    typeof el.width === "number" && Number.isFinite(el.width) ? el.width : def.width;
  const h =
    typeof el.height === "number" && Number.isFinite(el.height)
      ? el.height
      : def.height;
  return { w, h };
}

function boundsFromPlanSize(
  planSize: FloorPlanCanvasSize | null | undefined,
): OperationalViewport {
  if (
    planSize &&
    typeof planSize.width === "number" &&
    typeof planSize.height === "number" &&
    Number.isFinite(planSize.width) &&
    Number.isFinite(planSize.height) &&
    planSize.width > 0 &&
    planSize.height > 0
  ) {
    return finalizeBounds(0, 0, planSize.width, planSize.height);
  }
  return { ...EMPTY_CANVAS_FALLBACK };
}

/**
 * Elementos que definen el área operativa real del restaurante (tocables / servicio).
 * Excluye paredes, puertas, columnas, piscinas, jardineras y decoración estructural.
 */
export function isOperationalViewportElement(type: PlanElementType): boolean {
  return (
    type === "table" ||
    type === "sunbed" ||
    type === "bed" ||
    type === "custom" ||
    type === "bar"
  );
}

/**
 * Calcula el viewport operativo del plano: bounds del restaurante real, no del lienzo técnico.
 * Solo lectura; no persiste ni muta datos.
 */
export function getOperationalViewport(
  elements: Table[],
  planSize: FloorPlanCanvasSize | null | undefined,
  options: GetOperationalViewportOptions = {},
): OperationalViewport {
  const paddingPx = options.paddingPx ?? OPERATIONAL_VIEWPORT_PADDING_PX;

  const operational = elements.filter(
    (el) =>
      el.isActive !== false && isOperationalViewportElement(el.type),
  );

  if (operational.length === 0) {
    return boundsFromPlanSize(planSize);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of operational) {
    const { w, h } = elementLogicalSize(el);
    if (w <= 0 || h <= 0) continue;
    const x = typeof el.x === "number" && Number.isFinite(el.x) ? el.x : 0;
    const y = typeof el.y === "number" && Number.isFinite(el.y) ? el.y : 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) {
    return boundsFromPlanSize(planSize);
  }

  minX -= paddingPx;
  minY -= paddingPx;
  maxX += paddingPx;
  maxY += paddingPx;

  return finalizeBounds(minX, minY, maxX, maxY);
}
