/**
 * Escala visual del mapa — separada de la escala lógica del documento (base.scale).
 *
 * - Metros: dimensiones reales del restaurante (base.dimensions).
 * - Escala lógica: base.scale.pixelsPerUnit (referencia de datos, p. ej. 100 px/m).
 * - Escala de mapa: píxeles de stage por metro en pantalla.
 * - Objetos operativos: mantienen tamaño visual propio; no dependen de esta escala.
 */

import type { SalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import type { SalaPoint } from "@/lib/sala-editor/geometry/wall-geometry";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";

/** Referencia lógica canónica del documento (no obliga tamaño de render). */
export const EDITOR_LOGICAL_PIXELS_PER_UNIT = 100;

/** PPU visual del mapa por defecto cuando aún no hay medida de viewport. */
export const EDITOR_VISUAL_PIXELS_PER_UNIT_DEFAULT = 72;

/** Límites de superficie visual del mapa. No escalan mesas, iconos ni textos. */
export const EDITOR_VISUAL_PIXELS_PER_UNIT_MIN = 48;
export const EDITOR_VISUAL_PIXELS_PER_UNIT_MAX = 88;

/** El viewport ya no reserva chrome interno: el canvas es la superficie principal. */
export const EDITOR_FRAME_HEADER_HEIGHT_PX = 0;
export const EDITOR_VIEWPORT_MARGIN_PX = 4;

export type EditorViewportSize = {
  width: number;
  height: number;
};

export type EditorVisualLayout = {
  /** Píxeles de stage por metro en pantalla para la superficie del mapa. */
  displayPixelsPerUnit: number;
  /** Referencia lógica del documento (base.scale.pixelsPerUnit). */
  logicalPixelsPerUnit: number;
  stageWidth: number;
  stageHeight: number;
  frameWidth: number;
  frameHeight: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Calcula PPU visual del mapa para aprovechar el viewport sin definir el tamaño
 * de mesas, iconos, textos o grosor de muros.
 */
export function resolveEditorDisplayPixelsPerUnit(
  base: Pick<SalaEspacioBase, "dimensions" | "scale">,
  viewport: EditorViewportSize | null,
): number {
  const widthM = base.dimensions.width;
  const heightM = base.dimensions.height;
  if (widthM <= 0 || heightM <= 0) {
    return EDITOR_VISUAL_PIXELS_PER_UNIT_DEFAULT;
  }

  if (viewport && viewport.width > 0 && viewport.height > 0) {
    const availableWidth = viewport.width - EDITOR_VIEWPORT_MARGIN_PX * 2;
    const availableHeight =
      viewport.height -
      EDITOR_VIEWPORT_MARGIN_PX * 2 -
      EDITOR_FRAME_HEADER_HEIGHT_PX;

    if (availableWidth > 0 && availableHeight > 0) {
      const byWidth = availableWidth / widthM;
      const byHeight = availableHeight / heightM;
      const fitPpu = Math.min(byWidth, byHeight);
      return Number(
        clamp(
          fitPpu,
          EDITOR_VISUAL_PIXELS_PER_UNIT_MIN,
          EDITOR_VISUAL_PIXELS_PER_UNIT_MAX,
        ).toFixed(2),
      );
    }
  }

  return Math.min(
    base.scale.pixelsPerUnit,
    EDITOR_VISUAL_PIXELS_PER_UNIT_DEFAULT,
  );
}

export function computeEditorVisualLayout(
  base: Pick<SalaEspacioBase, "dimensions" | "scale">,
  viewport: EditorViewportSize | null,
): EditorVisualLayout {
  const displayPixelsPerUnit = resolveEditorDisplayPixelsPerUnit(base, viewport);
  const logicalPixelsPerUnit = base.scale.pixelsPerUnit;
  const stageWidth = Math.round(base.dimensions.width * displayPixelsPerUnit);
  const stageHeight = Math.round(base.dimensions.height * displayPixelsPerUnit);

  return {
    displayPixelsPerUnit,
    logicalPixelsPerUnit,
    stageWidth,
    stageHeight,
    frameWidth: stageWidth,
    frameHeight: stageHeight + EDITOR_FRAME_HEADER_HEIGHT_PX,
  };
}

/** Ratio display/logical para proyectar coordenadas de datos sobre el mapa visual. */
export function getEditorCoordinateScale(layout: EditorVisualLayout): number {
  if (layout.logicalPixelsPerUnit <= 0) return 1;
  return layout.displayPixelsPerUnit / layout.logicalPixelsPerUnit;
}

export function unscaleEditorPoint(
  point: SalaPoint,
  coordinateScale: number,
): SalaPoint {
  if (coordinateScale === 1) return point;
  return {
    x: point.x / coordinateScale,
    y: point.y / coordinateScale,
  };
}

export function scaleEditorWallSegment(
  wall: SalaWallSegment,
  coordinateScale: number,
): SalaWallSegment {
  if (coordinateScale === 1) return wall;
  return {
    ...wall,
    x1: wall.x1 * coordinateScale,
    y1: wall.y1 * coordinateScale,
    x2: wall.x2 * coordinateScale,
    y2: wall.y2 * coordinateScale,
  };
}

export function scaleEditorGridSize(
  gridSize: number,
  coordinateScale: number,
): number {
  if (coordinateScale === 1) return gridSize;
  return gridSize * coordinateScale;
}
