"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type {
  SurfaceMaterialKind,
  SurfaceObject,
  SurfaceObjectDraft,
} from "@/lib/sala-editor/surface/surface-object";
import { getSurfaceMaterialCatalogItem } from "@/lib/sala-editor/surface/surface-material-catalog";
import {
  createSurfaceRectFromPoints,
  isSurfaceRectUsable,
  snapSurfacePointToGrid,
  translateSurfaceObject,
  type SurfaceCreationDraft,
  type SurfaceEditOutcome,
  type SurfaceMoveSession,
  type SurfaceRect,
} from "@/lib/sala-editor/surface/surface-interaction";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import {
  getBaseFloorCatalogEntry,
  type BaseFloorCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import { clientToStagePoint } from "@/lib/sala-editor/canvas/canvas-viewport";
import { unscaleEditorPoint } from "@/lib/sala-editor/canvas/editor-visual-scale";
import { useCanvasViewport } from "@/components/sala-editor/canvas/canvas-viewport-context";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";

export type SalaTerrenoWorkspaceProps = {
  espacio: SalaEspacio;
  restaurantId: string;
  activeSurfaceMaterial?: SurfaceMaterialKind | null;
  surfaceObjects?: SurfaceObject[];
  selectedSurfaceObjectId?: string | null;
  onSurfaceObjectCreate?: (draft: SurfaceObjectDraft) => void;
  onSurfaceObjectSelect?: (surfaceId: string | null) => void;
  onSurfaceObjectClearSelection?: () => void;
  onSurfaceObjectUpdate?: (
    surfaceId: string,
    patch: Partial<Omit<SurfaceObject, "id">>,
  ) => void;
  onSurfaceObjectDelete?: (surfaceId: string) => void;
  onSurfaceObjectMoveStart?: () => void;
  onSurfaceObjectMoveEnd?: (outcome: SurfaceEditOutcome) => void;
};

type SurfaceCanvasContentProps = {
  espacioId: string;
  gridSize: number;
  activeSurfaceMaterial: SurfaceMaterialKind | null;
  surfaceObjects: readonly SurfaceObject[];
  selectedSurfaceObjectId: string | null;
  onSurfaceObjectCreate?: (draft: SurfaceObjectDraft) => void;
  onSurfaceObjectSelect?: (surfaceId: string | null) => void;
  onSurfaceObjectClearSelection?: () => void;
  onSurfaceObjectUpdate?: (
    surfaceId: string,
    patch: Partial<Omit<SurfaceObject, "id">>,
  ) => void;
  onSurfaceObjectDelete?: (surfaceId: string) => void;
  onSurfaceObjectMoveStart?: () => void;
  onSurfaceObjectMoveEnd?: (outcome: SurfaceEditOutcome) => void;
};

function createSurfaceStyle(
  rect: SurfaceRect,
  material: SurfaceMaterialKind,
  coordinateScale: number,
): CSSProperties {
  const materialEntry = getSurfaceMaterialCatalogItem(material);
  const color = materialEntry?.swatch ?? "#94a3b8";
  return {
    left: rect.x * coordinateScale,
    top: rect.y * coordinateScale,
    width: rect.width * coordinateScale,
    height: rect.height * coordinateScale,
    "--surface-color": color,
  } as CSSProperties;
}

function SalaTerrenoCanvasContent({
  espacioId,
  gridSize,
  activeSurfaceMaterial,
  surfaceObjects,
  selectedSurfaceObjectId,
  onSurfaceObjectCreate,
  onSurfaceObjectSelect,
  onSurfaceObjectClearSelection,
  onSurfaceObjectUpdate,
  onSurfaceObjectDelete,
  onSurfaceObjectMoveStart,
  onSurfaceObjectMoveEnd,
}: SurfaceCanvasContentProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<SurfaceCreationDraft | null>(null);
  const [moveSession, setMoveSession] = useState<SurfaceMoveSession | null>(null);
  const activeMaterial = getSurfaceMaterialCatalogItem(activeSurfaceMaterial);

  const resolveLogicalPoint = useCallback(
    (clientX: number, clientY: number) => {
      const fromViewport = canvasViewport?.resolveStagePoint(clientX, clientY);
      const displayPoint =
        fromViewport ??
        (surfaceRef.current
          ? clientToStagePoint(surfaceRef.current, clientX, clientY)
          : null);
      if (!displayPoint) return null;
      return snapSurfacePointToGrid(
        unscaleEditorPoint(displayPoint, coordinateScale),
        gridSize,
      );
    },
    [canvasViewport, coordinateScale, gridSize],
  );

  const previewStyle = useMemo(() => {
    if (!draft) return null;
    return createSurfaceStyle(draft.rect, draft.material, coordinateScale);
  }, [coordinateScale, draft]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      onSurfaceObjectClearSelection?.();
      if (!activeSurfaceMaterial) return;
      const point = resolveLogicalPoint(event.clientX, event.clientY);
      if (!point) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      setDraft({
        material: activeSurfaceMaterial,
        origin: point,
        current: point,
        rect: createSurfaceRectFromPoints(point, point),
      });
    },
    [activeSurfaceMaterial, onSurfaceObjectClearSelection, resolveLogicalPoint],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const point = resolveLogicalPoint(event.clientX, event.clientY);
      if (!point) return;

      setDraft((current) =>
        current
          ? {
              ...current,
              current: point,
              rect: createSurfaceRectFromPoints(current.origin, point),
            }
          : null,
      );
    },
    [resolveLogicalPoint],
  );

  const cancelMoveSession = useCallback(() => {
    setMoveSession((session) => {
      if (!session) return null;
      if (session.active) {
        onSurfaceObjectUpdate?.(session.objectId, {
          x: session.originObject.x,
          y: session.originObject.y,
        });
        onSurfaceObjectMoveEnd?.("cancel");
      }
      return null;
    });
  }, [onSurfaceObjectMoveEnd, onSurfaceObjectUpdate]);

  const finishMoveSession = useCallback(() => {
    setMoveSession((session) => {
      if (!session) return null;
      if (session.active) {
        onSurfaceObjectMoveEnd?.("complete");
      }
      return null;
    });
  }, [onSurfaceObjectMoveEnd]);

  const createSurfacePointerHandlers = useCallback(
    (surface: SurfaceObject) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        onSurfaceObjectSelect?.(surface.id);
        setMoveSession({
          objectId: surface.id,
          mode: "move",
          originPointer: point,
          originObject: surface,
          active: false,
          pointerType: event.pointerType,
        });
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;

        setMoveSession((session) => {
          if (!session || session.objectId !== surface.id) return session;
          const delta = {
            x: point.x - session.originPointer.x,
            y: point.y - session.originPointer.y,
          };
          const shouldActivate =
            session.active || Math.abs(delta.x) >= 1 || Math.abs(delta.y) >= 1;
          if (!shouldActivate) return session;
          if (!session.active) onSurfaceObjectMoveStart?.();

          const moved = translateSurfaceObject(session.originObject, delta, gridSize);
          onSurfaceObjectUpdate?.(surface.id, { x: moved.x, y: moved.y });
          return { ...session, active: true };
        });
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finishMoveSession();
      },
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        cancelMoveSession();
      },
    }),
    [
      cancelMoveSession,
      finishMoveSession,
      gridSize,
      onSurfaceObjectMoveStart,
      onSurfaceObjectSelect,
      onSurfaceObjectUpdate,
      resolveLogicalPoint,
    ],
  );

  const finishDraft = useCallback(
    (event: PointerEvent<HTMLDivElement>, create: boolean) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setDraft((current) => {
        if (create && current && isSurfaceRectUsable(current.rect)) {
          onSurfaceObjectCreate?.({
            espacioId,
            material: current.material,
            x: current.rect.x,
            y: current.rect.y,
            width: current.rect.width,
            height: current.rect.height,
            visible: true,
            locked: false,
          });
        }
        return null;
      });
    },
    [espacioId, onSurfaceObjectCreate],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (draft) {
        event.preventDefault();
        setDraft(null);
        return;
      }
      if (moveSession) {
        event.preventDefault();
        cancelMoveSession();
        return;
      }
      if (selectedSurfaceObjectId) {
        event.preventDefault();
        onSurfaceObjectClearSelection?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cancelMoveSession,
    draft,
    moveSession,
    onSurfaceObjectClearSelection,
    selectedSurfaceObjectId,
  ]);

  return (
    <>
      <div className="hostly-sala-terreno-surfaces">
        {surfaceObjects
          .filter((surface) => surface.visible !== false)
          .map((surface) => {
            const selected = surface.id === selectedSurfaceObjectId;
            const dragging = moveSession?.objectId === surface.id && moveSession.active;
            return (
              <div
                key={surface.id}
                className="hostly-sala-surface-object-wrap"
                style={createSurfaceStyle(surface, surface.material, coordinateScale)}
              >
                <button
                  type="button"
                  className={[
                    "hostly-sala-surface-object",
                    selected ? "is-selected" : "",
                    dragging ? "is-dragging" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={`Superficie de ${getSurfaceMaterialCatalogItem(surface.material)?.label ?? "material"}`}
                  title="Superficie"
                  {...createSurfacePointerHandlers(surface)}
                />
                {selected ? (
                  <button
                    type="button"
                    className="hostly-sala-surface-object__delete-btn"
                    aria-label="Eliminar superficie"
                    title="Eliminar superficie"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSurfaceObjectDelete?.(surface.id);
                    }}
                  >
                    🗑
                  </button>
                ) : null}
              </div>
            );
          })}
        {draft && previewStyle ? (
          <div
            className="hostly-sala-surface-object hostly-sala-surface-object--preview"
            style={previewStyle}
          />
        ) : null}
      </div>

      <div
        ref={surfaceRef}
        className={[
          "hostly-sala-terreno-hit-area",
          activeSurfaceMaterial ? "is-creating" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="presentation"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishDraft(event, true)}
        onPointerCancel={(event) => finishDraft(event, false)}
      />

      {activeMaterial ? (
        <div className="hostly-sala-terreno-cursor-hint">
          <span
            className="hostly-sala-terreno-placeholder__swatch"
            style={{ background: activeMaterial.swatch }}
            aria-hidden
          />
          Arrastra para crear superficie de {activeMaterial.label.toLowerCase()}.
        </div>
      ) : null}
    </>
  );
}

export function SalaTerrenoWorkspace({
  espacio,
  restaurantId,
  activeSurfaceMaterial = null,
  surfaceObjects = [],
  selectedSurfaceObjectId = null,
  onSurfaceObjectCreate,
  onSurfaceObjectSelect,
  onSurfaceObjectClearSelection,
  onSurfaceObjectUpdate,
  onSurfaceObjectDelete,
  onSurfaceObjectMoveStart,
  onSurfaceObjectMoveEnd,
}: SalaTerrenoWorkspaceProps) {
  const base = normalizeSalaEspacioBase(espacio.base);
  const activeMaterial = getSurfaceMaterialCatalogItem(activeSurfaceMaterial);
  const floorEntry = getBaseFloorCatalogEntry(
    (base.floor.kind === "wood" ||
    base.floor.kind === "stone" ||
    base.floor.kind === "grass" ||
    base.floor.kind === "sand" ||
    base.floor.kind === "neutral"
      ? base.floor.kind
      : "neutral") as BaseFloorCatalogKind,
  );

  return (
    <SalaEspacioCanvasFrame
      espacio={espacio}
      restaurantId={restaurantId}
      basePreview={base}
      floorBackground={floorEntry.background}
    >
      <SalaTerrenoCanvasContent
        espacioId={espacio.id}
        gridSize={base.grid.size}
        activeSurfaceMaterial={activeSurfaceMaterial}
        surfaceObjects={surfaceObjects}
        selectedSurfaceObjectId={selectedSurfaceObjectId}
        onSurfaceObjectCreate={onSurfaceObjectCreate}
        onSurfaceObjectSelect={onSurfaceObjectSelect}
        onSurfaceObjectClearSelection={onSurfaceObjectClearSelection}
        onSurfaceObjectUpdate={onSurfaceObjectUpdate}
        onSurfaceObjectDelete={onSurfaceObjectDelete}
        onSurfaceObjectMoveStart={onSurfaceObjectMoveStart}
        onSurfaceObjectMoveEnd={onSurfaceObjectMoveEnd}
      />
      {!activeMaterial && surfaceObjects.length === 0 ? (
        <div className="hostly-sala-terreno-placeholder">
          <div className="hostly-sala-terreno-placeholder__card">
            <span className="hostly-sala-terreno-placeholder__eyebrow">
              Surface Objects
            </span>
            <h2 className="hostly-sala-terreno-placeholder__title">
              Selecciona un material para comenzar a construir el terreno.
            </h2>
            <p className="hostly-sala-terreno-placeholder__text">
              La biblioteca de Terreno ya separa materiales como madera, piedra,
              césped, arena, agua y tarima. En esta fase no se dibujan muros ni
              se colocan mesas.
            </p>
          </div>
        </div>
      ) : null}
    </SalaEspacioCanvasFrame>
  );
}
