/**
 * Viewport del lienzo — escala de ajuste y coordenadas screen → canvas.
 * Render e interacción comparten el mismo espacio lógico del stage.
 */

import type { SalaPoint } from "@/lib/sala-editor/geometry/wall-geometry";

export const CANVAS_VIEWPORT_FIT_MARGIN_PX = 12;
export const CANVAS_VIEWPORT_SCALE_EPSILON = 0.992;

export type CanvasViewportTransform = {
  scale: number;
};

/**
 * Escala de ajuste: 1 por defecto; solo reduce si el plano no cabe en el viewport.
 */
export function computeCanvasFitScale(
  viewportWidth: number,
  viewportHeight: number,
  contentWidth: number,
  contentHeight: number,
  margin = CANVAS_VIEWPORT_FIT_MARGIN_PX,
): number {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    contentWidth <= 0 ||
    contentHeight <= 0
  ) {
    return 1;
  }

  const availableWidth = viewportWidth - margin * 2;
  const availableHeight = viewportHeight - margin * 2;
  if (availableWidth <= 0 || availableHeight <= 0) {
    return 1;
  }

  const fitScale = Math.min(
    1,
    availableWidth / contentWidth,
    availableHeight / contentHeight,
  );

  if (fitScale >= CANVAS_VIEWPORT_SCALE_EPSILON) {
    return 1;
  }

  return Number(fitScale.toFixed(4));
}

/**
 * Convierte coordenadas de pantalla a coordenadas lógicas del stage.
 * Compensa transform: scale() u otras — usa ratio visual vs layout local.
 */
export function clientToStagePoint(
  stageElement: HTMLElement,
  clientX: number,
  clientY: number,
): SalaPoint {
  const rect = stageElement.getBoundingClientRect();
  const localWidth = stageElement.offsetWidth;
  const localHeight = stageElement.offsetHeight;

  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    localWidth <= 0 ||
    localHeight <= 0
  ) {
    return { x: 0, y: 0 };
  }

  return {
    x: ((clientX - rect.left) / rect.width) * localWidth,
    y: ((clientY - rect.top) / rect.height) * localHeight,
  };
}

/** Alias para hit-tests del editor (paredes, mesas, snap). */
export function screenToCanvasPoint(
  stageElement: HTMLElement,
  clientX: number,
  clientY: number,
): SalaPoint {
  return clientToStagePoint(stageElement, clientX, clientY);
}
