"use client";

import {
  EditableFloorMap as BaseEditableFloorMap,
  type EditableFloorMapProps,
} from "./EditableFloorMap";

export {
  DEFAULT_MAP_TILE_HEIGHT,
  DEFAULT_MAP_TILE_WIDTH,
  fitBoundsToViewport,
  getPlanContentBounds,
  getPlanElementBaseVisualStyle,
} from "./EditableFloorMap";

export type {
  EditableFloorMapProps,
  EditableFloorMapViewportControls,
  EditableFloorMapZone,
  EditableFloorMapZoneHighlight,
  FitBoundsToViewportOptions,
  FloorMapRenderContext,
  FloorPlanCanvasSize,
  FloorSurfacePresetId,
  PlanContentBounds,
} from "./EditableFloorMap";

const TPV_OPERATIONAL_ZOOM_MAX = new Set([3.4, 3.8]);

/**
 * El TPV operativo ya dispone de un viewport a pantalla completa. Su encuadre,
 * sin embargo, no debe depender del tamaño lógico completo del lienzo del Editor:
 * ese lienzo puede contener mucho espacio vacío alrededor de las mesas y hacer
 * que el restaurante aparezca pequeño aunque el mapa ocupe todo el dispositivo.
 *
 * La firma se mantiene deliberadamente estricta para no alterar el Editor ni
 * otros mapas readonly: premium, elementos operativos, sin zonas en el fit,
 * padding 2px, zoom máximo TPV y offsets/multiplicador neutros.
 */
function isOperationalTpvFit(props: EditableFloorMapProps): boolean {
  const fitZoomMax = props.viewportFitZoomMax;

  return (
    props.editable === false &&
    props.editorPlanSurface === true &&
    props.editorVisualPreset === "premium" &&
    Array.isArray(props.viewportFitElements) &&
    props.viewportFitElements.length > 0 &&
    Array.isArray(props.viewportFitZones) &&
    props.viewportFitZones.length === 0 &&
    typeof fitZoomMax === "number" &&
    TPV_OPERATIONAL_ZOOM_MAX.has(fitZoomMax) &&
    props.viewportFitPaddingPx === 2 &&
    (props.viewportFitOffsetX ?? 0) === 0 &&
    (props.viewportFitOffsetY ?? 0) === 0 &&
    (props.viewportFitZoomMultiplier ?? 1) === 1
  );
}

/**
 * Compatibilidad transparente con el mapa base.
 * Solo el TPV operativo fuerza `content`; cualquier otro consumidor conserva sus props.
 */
export function EditableFloorMap(props: EditableFloorMapProps) {
  if (!isOperationalTpvFit(props)) {
    return <BaseEditableFloorMap {...props} />;
  }

  return <BaseEditableFloorMap {...props} viewportFitMode="content" />;
}
