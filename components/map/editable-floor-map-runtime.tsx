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

/**
 * El TPV operativo ya dispone de un viewport a pantalla completa. Su encuadre,
 * sin embargo, no debe depender del tamaño lógico completo del lienzo del Editor:
 * ese lienzo puede contener mucho espacio vacío alrededor de las mesas y hacer
 * que el restaurante aparezca pequeño aunque el mapa ocupe todo el dispositivo.
 *
 * Reconocemos únicamente la configuración de auto-fit específica del TPV
 * (readonly + superficie premium + padding mínimo + zoom operativo alto) y en
 * ese caso encajamos los elementos operativos recibidos en `viewportFitElements`.
 * El Editor y el resto de consumidores conservan literalmente su modo de fit.
 */
function isOperationalTpvFit(props: EditableFloorMapProps): boolean {
  const fitZoomMax = props.viewportFitZoomMax;
  const fitPadding = props.viewportFitPaddingPx;

  return (
    props.editable === false &&
    props.editorPlanSurface === true &&
    props.editorVisualPreset === "premium" &&
    Array.isArray(props.viewportFitElements) &&
    props.viewportFitElements.length > 0 &&
    Array.isArray(props.viewportFitZones) &&
    props.viewportFitZones.length === 0 &&
    typeof fitZoomMax === "number" &&
    Number.isFinite(fitZoomMax) &&
    fitZoomMax >= 3 &&
    typeof fitPadding === "number" &&
    Number.isFinite(fitPadding) &&
    fitPadding <= 4
  );
}

export function EditableFloorMap(props: EditableFloorMapProps) {
  if (!isOperationalTpvFit(props)) {
    return <BaseEditableFloorMap {...props} />;
  }

  return <BaseEditableFloorMap {...props} viewportFitMode="content" />;
}
