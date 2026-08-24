"use client";

import { useEffect, useState } from "react";
import {
  EditableFloorMap as BaseEditableFloorMap,
  type EditableFloorMapProps,
} from "./EditableFloorMap";
import { loadSalaEditorDraft } from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import { buildEditorTpvReadonlyVisualContract } from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";

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

type TpvMapResolutionStatus = "pending" | "legacy" | "v2-expected";

type TpvMapResolution = {
  key: string;
  status: TpvMapResolutionStatus;
};

/**
 * Firma estable del lienzo TPV. Se separa del requisito de tener elementos para
 * poder reconocer también el primer frame, cuando las mesas aún están cargando.
 */
function isOperationalTpvSurface(props: EditableFloorMapProps): boolean {
  const fitZoomMax = props.viewportFitZoomMax;

  return (
    props.editable === false &&
    props.editorPlanSurface === true &&
    props.editorVisualPreset === "premium" &&
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
 * El TPV operativo ya dispone de un viewport a pantalla completa. Su encuadre,
 * sin embargo, no debe depender del tamaño lógico completo del lienzo del Editor:
 * ese lienzo puede contener mucho espacio vacío alrededor de las mesas y hacer
 * que el restaurante aparezca pequeño aunque el mapa ocupe todo el dispositivo.
 */
function isOperationalTpvFit(props: EditableFloorMapProps): boolean {
  return (
    isOperationalTpvSurface(props) &&
    Array.isArray(props.viewportFitElements) &&
    props.viewportFitElements.length > 0
  );
}

function resolveTpvRestaurantId(props: EditableFloorMapProps): string {
  const sources = [props.viewportFitElements ?? [], props.elements ?? []];
  for (const list of sources) {
    for (const element of list) {
      const restaurantId = String(element.restaurantId ?? "").trim();
      if (restaurantId) return restaurantId;
    }
  }
  return "";
}

/**
 * `carta-page-content` construye `mapAutoFitKey` empezando por el id del plano.
 * Si todavía aparece `legacy`, el selector de plano aún no está resuelto.
 */
function resolveTpvFloorPlanId(props: EditableFloorMapProps): string {
  const raw = String(props.mapAutoFitKey ?? "").trim();
  if (!raw) return "";
  const first = raw.split("::", 1)[0]?.trim() ?? "";
  return first && first !== "legacy" ? first : "";
}

function TpvMapResolvingPlaceholder(props: EditableFloorMapProps) {
  return (
    <div
      ref={props.mapRef}
      className={props.className}
      data-hostly-tpv-map-resolution="pending"
      aria-busy="true"
      aria-label="Cargando mapa"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        flex: "1 1 auto",
        boxSizing: "border-box",
        overflow: "hidden",
        borderRadius: 14,
        border: "1px solid rgba(148, 163, 184, 0.18)",
        background:
          "linear-gradient(180deg, rgba(248, 251, 254, 0.98) 0%, rgba(241, 246, 250, 0.98) 100%)",
      }}
    />
  );
}

/**
 * Compatibilidad transparente con el mapa base.
 *
 * - Solo el TPV operativo fuerza `content` para aprovechar el viewport real.
 * - Mientras el TPV decide si existe un plano Editor V2 compatible, no se pinta
 *   el renderer legacy. Esto evita el flash de mapa antiguo en móvil/PDA.
 * - Legacy solo reaparece cuando la lectura confirma que no hay V2 compatible
 *   (o la lectura falla), manteniendo compatibilidad con restaurantes antiguos.
 */
export function EditableFloorMap(props: EditableFloorMapProps) {
  const operationalTpvSurface = isOperationalTpvSurface(props);
  const restaurantId = operationalTpvSurface
    ? resolveTpvRestaurantId(props)
    : "";
  const floorPlanId = operationalTpvSurface ? resolveTpvFloorPlanId(props) : "";
  const resolutionKey = `${restaurantId || "unresolved"}::${floorPlanId || "unresolved"}`;
  const hasReadonlyUnderlay = props.readonlyUnderlay != null;
  const [resolution, setResolution] = useState<TpvMapResolution>({
    key: "",
    status: "pending",
  });

  useEffect(() => {
    if (!operationalTpvSurface || hasReadonlyUnderlay) return;

    let cancelled = false;
    let unresolvedPlanFallbackTimer: number | null = null;
    const key = resolutionKey;

    setResolution({ key, status: "pending" });

    if (!restaurantId) {
      return () => {
        cancelled = true;
      };
    }

    void loadSalaEditorDraft(restaurantId)
      .then((draft) => {
        if (cancelled) return;

        if (!draft) {
          setResolution({ key, status: "legacy" });
          return;
        }

        if (!floorPlanId) {
          // El draft V2 ya existe, pero el selector de plano aún no ha terminado
          // de hidratarse. No mostrar legacy durante esa ventana transitoria.
          setResolution({ key, status: "v2-expected" });
          unresolvedPlanFallbackTimer = window.setTimeout(() => {
            if (!cancelled) setResolution({ key, status: "legacy" });
          }, 2000);
          return;
        }

        const matchedSpace =
          draft.document.espacios.find(
            (space) =>
              String(space.legacyFloorPlanId ?? "").trim() === floorPlanId,
          ) ?? null;

        if (!matchedSpace) {
          setResolution({ key, status: "legacy" });
          return;
        }

        try {
          const contract = buildEditorTpvReadonlyVisualContract(
            draft.document,
            matchedSpace.id,
          );
          setResolution({
            key,
            status: contract ? "v2-expected" : "legacy",
          });
        } catch {
          setResolution({ key, status: "legacy" });
        }
      })
      .catch(() => {
        if (!cancelled) setResolution({ key, status: "legacy" });
      });

    return () => {
      cancelled = true;
      if (unresolvedPlanFallbackTimer != null) {
        window.clearTimeout(unresolvedPlanFallbackTimer);
      }
    };
  }, [
    floorPlanId,
    hasReadonlyUnderlay,
    operationalTpvSurface,
    resolutionKey,
    restaurantId,
  ]);

  const effectiveResolutionStatus =
    resolution.key === resolutionKey ? resolution.status : "pending";

  if (
    operationalTpvSurface &&
    !hasReadonlyUnderlay &&
    effectiveResolutionStatus !== "legacy"
  ) {
    return <TpvMapResolvingPlaceholder {...props} />;
  }

  if (!isOperationalTpvFit(props)) {
    return <BaseEditableFloorMap {...props} />;
  }

  return <BaseEditableFloorMap {...props} viewportFitMode="content" />;
}
