"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
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
  resizeSurfaceObject,
  snapSurfacePointToGrid,
  translateSurfaceObject,
  type SurfaceCreationDraft,
  type SurfaceEditOutcome,
  type SurfaceMoveSession,
  type SurfaceRect,
  type SurfaceResizeHandle,
  type SurfaceResizeSession,
} from "@/lib/sala-editor/surface/surface-interaction";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import {
  getBaseFloorCatalogEntry,
  type BaseFloorCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import { clientToStagePoint } from "@/lib/sala-editor/canvas/canvas-viewport";
import { unscaleEditorPoint } from "@/lib/sala-editor/canvas/editor-visual-scale";
import {
  SNAP_DISTANCE_PX,
  snapRectToPeers,
  type SnapGuide,
  type SnapResizableEdges,
  type SnapRect,
} from "@/lib/sala-editor/snap";
import { useCanvasViewport } from "@/components/sala-editor/canvas/canvas-viewport-context";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";
import { SalaSmartSnapGuidesLayer } from "@/components/sala-editor/panels/sala-smart-snap-guides-layer";
import { SalaEditorCanvasToolHint } from "@/components/sala-editor/sala-editor-canvas-tool-hint";
import {
  getSurfaceMaterialToolHint,
  resolveEditorToolHint,
  resolveSurfaceInteractionState,
} from "@/lib/sala-editor/ux/editor-tool-hints";
import {
  getVisualMaterial,
  type VisualMaterial,
  type VisualMaterialId,
} from "@/lib/sala-editor/visual-assets";

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
  onSurfaceObjectMoveStart?: () => void;
  onSurfaceObjectMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onSurfaceObjectResizeStart?: () => void;
  onSurfaceObjectResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  canvasLayers?: ReactNode;
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
  onSurfaceObjectMoveStart?: () => void;
  onSurfaceObjectMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onSurfaceObjectResizeStart?: () => void;
  onSurfaceObjectResizeEnd?: (outcome: SurfaceEditOutcome) => void;
};

export type SalaSurfaceObjectsLayerProps = {
  surfaceObjects: readonly SurfaceObject[];
  selectedSurfaceObjectId?: string | null;
  moveSession?: SurfaceMoveSession | null;
  resizeSession?: SurfaceResizeSession | null;
  createSurfacePointerHandlers?: (
    surface: SurfaceObject,
  ) => {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  };
  createSurfaceResizeHandlers?: (
    surface: SurfaceObject,
    handle: SurfaceResizeHandle,
  ) => {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  };
  readOnly?: boolean;
};

const SURFACE_RESIZE_HANDLES: readonly SurfaceResizeHandle[] = [
  "nw",
  "ne",
  "sw",
  "se",
] as const;

function createSurfaceSnapRect(id: string, rect: SurfaceRect): SnapRect {
  return {
    id,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function surfaceToSnapRect(surface: SurfaceObject): SnapRect {
  return createSurfaceSnapRect(surface.id, surface);
}

function getSurfaceResizeActiveEdges(
  handle: SurfaceResizeHandle,
): SnapResizableEdges {
  return {
    left: handle === "nw" || handle === "sw",
    right: handle === "ne" || handle === "se",
    top: handle === "nw" || handle === "ne",
    bottom: handle === "sw" || handle === "se",
  };
}

function snapSurfaceDisplayLength(value: number): number {
  return Math.round(value);
}

const SURFACE_VISUAL_MATERIAL_BY_KIND: Record<SurfaceMaterialKind, VisualMaterialId> = {
  wood: "wood.oak",
  stone: "stone.natural",
  grass: "vegetation.grass-soft",
  sand: "sand.default",
  water: "water.pool",
  deck: "deck.default",
  carpet: "textile.rug-neutral",
  tile: "tile.default",
  custom: "neutral.warm",
};

function resolveSurfaceVisualMaterial(material: SurfaceMaterialKind): VisualMaterial {
  const materialId = SURFACE_VISUAL_MATERIAL_BY_KIND[material];
  return getVisualMaterial(materialId) ?? getVisualMaterial("neutral.warm")!;
}

function toPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function getSurfaceTextureAlpha(material: VisualMaterial): string {
  const baseAlpha = material.supportsTables || material.discreet ? 0.08 : 0.16;
  const priorityBoost = material.visualPriority / 1000;
  return String(Math.min(0.22, baseAlpha + priorityBoost).toFixed(3));
}

function createSurfaceStyle(
  rect: SurfaceRect,
  material: SurfaceMaterialKind,
  coordinateScale: number,
): CSSProperties {
  const materialEntry = getSurfaceMaterialCatalogItem(material);
  const visualMaterial = resolveSurfaceVisualMaterial(material);
  const fallbackColor = materialEntry?.swatch ?? visualMaterial.baseColor;
  const toneMix = Math.max(18, Math.min(44, visualMaterial.visualPriority));
  const textureAlpha = Number(getSurfaceTextureAlpha(visualMaterial));
  return {
    left: snapSurfaceDisplayLength(rect.x * coordinateScale),
    top: snapSurfaceDisplayLength(rect.y * coordinateScale),
    width: snapSurfaceDisplayLength(rect.width * coordinateScale),
    height: snapSurfaceDisplayLength(rect.height * coordinateScale),
    "--surface-color": fallbackColor,
    "--surface-base-color": visualMaterial.baseColor,
    "--surface-secondary-color": visualMaterial.secondaryColor,
    "--surface-opacity": String(visualMaterial.recommendedOpacity),
    "--surface-saturation": toPercent(visualMaterial.saturation),
    "--surface-contrast": toPercent(0.86 + visualMaterial.contrast * 0.28),
    "--surface-texture-alpha": String(textureAlpha),
    "--surface-texture-alpha-soft": String((textureAlpha * 0.55).toFixed(3)),
    "--surface-texture-alpha-muted": String((textureAlpha * 0.72).toFixed(3)),
    "--surface-tone-mix": `${toneMix}%`,
    "--surface-secondary-mix": `${Math.round(toneMix * 0.72)}%`,
  } as CSSProperties;
}

export function SalaSurfaceObjectsLayer({
  surfaceObjects,
  selectedSurfaceObjectId = null,
  moveSession = null,
  resizeSession = null,
  createSurfacePointerHandlers,
  createSurfaceResizeHandlers,
  readOnly = false,
}: SalaSurfaceObjectsLayerProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;

  return (
    <div className="hostly-sala-terreno-surfaces">
      {surfaceObjects
        .filter((surface) => surface.visible !== false)
        .map((surface) => {
          const selected = !readOnly && surface.id === selectedSurfaceObjectId;
          const dragging =
            !readOnly && moveSession?.objectId === surface.id && moveSession.active;
          const resizing =
            !readOnly && resizeSession?.objectId === surface.id && resizeSession.active;
          const handlers =
            !readOnly && createSurfacePointerHandlers
              ? createSurfacePointerHandlers(surface)
              : undefined;

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
                  resizing ? "is-resizing" : "",
                  readOnly ? "is-readonly" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-surface-material={surface.material}
                aria-label={`Superficie de ${getSurfaceMaterialCatalogItem(surface.material)?.label ?? "material"}`}
                title="Superficie"
                tabIndex={readOnly ? -1 : 0}
                {...handlers}
              />
              {selected
                ? SURFACE_RESIZE_HANDLES.map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      className={[
                        "hostly-sala-surface-object__resize-handle",
                        `hostly-sala-surface-object__resize-handle--${handle}`,
                      ].join(" ")}
                      aria-label={`Redimensionar superficie ${handle}`}
                      title="Redimensionar"
                      {...createSurfaceResizeHandlers?.(surface, handle)}
                    />
                  ))
                : null}
            </div>
          );
        })}
    </div>
  );
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
  onSurfaceObjectMoveStart,
  onSurfaceObjectMoveEnd,
  onSurfaceObjectResizeStart,
  onSurfaceObjectResizeEnd,
}: SurfaceCanvasContentProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const creationPointerIdRef = useRef<number | null>(null);
  const draftRef = useRef<SurfaceCreationDraft | null>(null);
  const [draft, setDraft] = useState<SurfaceCreationDraft | null>(null);
  const [moveSession, setMoveSession] = useState<SurfaceMoveSession | null>(null);
  const [resizeSession, setResizeSession] =
    useState<SurfaceResizeSession | null>(null);
  const [smartSnapGuides, setSmartSnapGuides] = useState<SnapGuide[]>([]);
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

  const resolveSmartSnap = useCallback(
    (
      surfaceId: string,
      rect: SurfaceRect,
      activeEdges?: SnapResizableEdges,
    ) => {
      const peers = surfaceObjects
        .filter(
          (candidate) =>
            candidate.id !== surfaceId && candidate.visible !== false,
        )
        .map(surfaceToSnapRect);
      const snapResult = snapRectToPeers(
        createSurfaceSnapRect(surfaceId, rect),
        peers,
        {
          activeEdges,
          threshold: SNAP_DISTANCE_PX / Math.max(coordinateScale, 0.001),
        },
      );

      if (!isSurfaceRectUsable(snapResult.rect)) {
        return {
          rect,
          guides: [],
          snapped: false,
        };
      }

      return snapResult;
    },
    [coordinateScale, surfaceObjects],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (event.target !== event.currentTarget) return;
      if (draftRef.current || draft || moveSession || resizeSession) return;
      onSurfaceObjectClearSelection?.();
      if (!activeSurfaceMaterial) return;
      const point = resolveLogicalPoint(event.clientX, event.clientY);
      if (!point) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      creationPointerIdRef.current = event.pointerId;
      const nextDraft = {
        material: activeSurfaceMaterial,
        origin: point,
        current: point,
        rect: createSurfaceRectFromPoints(point, point),
      };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
    },
    [
      activeSurfaceMaterial,
      draft,
      moveSession,
      onSurfaceObjectClearSelection,
      resizeSession,
      resolveLogicalPoint,
    ],
  );

  useEffect(() => {
    const current = draftRef.current;
    if (!current || current.material === activeSurfaceMaterial) return;
    creationPointerIdRef.current = null;
    draftRef.current = null;
    setDraft(null);
  }, [activeSurfaceMaterial]);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (creationPointerIdRef.current !== event.pointerId) return;
      const point = resolveLogicalPoint(event.clientX, event.clientY);
      if (!point) return;

      const current = draftRef.current;
      if (!current) return;
      const nextDraft = {
        ...current,
        current: point,
        rect: createSurfaceRectFromPoints(current.origin, point),
      };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
    },
    [resolveLogicalPoint],
  );

  const cancelMoveSession = useCallback(() => {
    setMoveSession((session) => {
      setSmartSnapGuides([]);
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

  const cancelResizeSession = useCallback(() => {
    setResizeSession((session) => {
      setSmartSnapGuides([]);
      if (!session) return null;
      if (session.active) {
        onSurfaceObjectUpdate?.(session.objectId, {
          x: session.originObject.x,
          y: session.originObject.y,
          width: session.originObject.width,
          height: session.originObject.height,
        });
        onSurfaceObjectResizeEnd?.("cancel");
      }
      return null;
    });
  }, [onSurfaceObjectResizeEnd, onSurfaceObjectUpdate]);

  const finishMoveSession = useCallback(() => {
    setMoveSession((session) => {
      setSmartSnapGuides([]);
      if (!session) return null;
      if (session.active) {
        onSurfaceObjectMoveEnd?.("complete");
      }
      return null;
    });
  }, [onSurfaceObjectMoveEnd]);

  const finishResizeSession = useCallback(() => {
    setResizeSession((session) => {
      setSmartSnapGuides([]);
      if (!session) return null;
      if (session.active) {
        onSurfaceObjectResizeEnd?.("complete");
      }
      return null;
    });
  }, [onSurfaceObjectResizeEnd]);

  const createSurfacePointerHandlers = useCallback(
    (surface: SurfaceObject) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        creationPointerIdRef.current = null;
        draftRef.current = null;
        setDraft(null);
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
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
          const snapResult = resolveSmartSnap(surface.id, moved);
          onSurfaceObjectUpdate?.(surface.id, {
            x: snapResult.rect.x,
            y: snapResult.rect.y,
          });
          setSmartSnapGuides(snapResult.guides);
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
      resolveSmartSnap,
    ],
  );

  const createSurfaceResizeHandlers = useCallback(
    (surface: SurfaceObject, handle: SurfaceResizeHandle) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        creationPointerIdRef.current = null;
        draftRef.current = null;
        setDraft(null);
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSurfaceObjectSelect?.(surface.id);
        setResizeSession({
          objectId: surface.id,
          mode: "resize",
          resizeHandle: handle,
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

        setResizeSession((session) => {
          if (!session || session.objectId !== surface.id) return session;
          const delta = {
            x: point.x - session.originPointer.x,
            y: point.y - session.originPointer.y,
          };
          const shouldActivate =
            session.active || Math.abs(delta.x) >= 1 || Math.abs(delta.y) >= 1;
          if (!shouldActivate) return session;
          if (!session.active) onSurfaceObjectResizeStart?.();

          const resized = resizeSurfaceObject(
            session.originObject,
            session.resizeHandle,
            delta,
            gridSize,
          );
          const snapResult = resolveSmartSnap(
            surface.id,
            resized,
            getSurfaceResizeActiveEdges(session.resizeHandle),
          );
          onSurfaceObjectUpdate?.(surface.id, {
            x: snapResult.rect.x,
            y: snapResult.rect.y,
            width: snapResult.rect.width,
            height: snapResult.rect.height,
          });
          setSmartSnapGuides(snapResult.guides);
          return { ...session, active: true };
        });
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finishResizeSession();
      },
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        cancelResizeSession();
      },
    }),
    [
      cancelResizeSession,
      finishResizeSession,
      gridSize,
      onSurfaceObjectResizeStart,
      onSurfaceObjectSelect,
      onSurfaceObjectUpdate,
      resolveLogicalPoint,
      resolveSmartSnap,
    ],
  );

  const finishDraft = useCallback(
    (event: PointerEvent<HTMLDivElement>, create: boolean) => {
      if (creationPointerIdRef.current !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      creationPointerIdRef.current = null;
      const currentDraft = draftRef.current;
      draftRef.current = null;
      setDraft(null);

      if (create && currentDraft && isSurfaceRectUsable(currentDraft.rect)) {
        onSurfaceObjectCreate?.({
          espacioId,
          material: currentDraft.material,
          x: currentDraft.rect.x,
          y: currentDraft.rect.y,
          width: currentDraft.rect.width,
          height: currentDraft.rect.height,
          visible: true,
          locked: false,
        });
      }
    },
    [espacioId, onSurfaceObjectCreate],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (draft) {
        event.preventDefault();
        creationPointerIdRef.current = null;
        draftRef.current = null;
        setDraft(null);
        return;
      }
      if (moveSession) {
        event.preventDefault();
        cancelMoveSession();
        return;
      }
      if (resizeSession) {
        event.preventDefault();
        cancelResizeSession();
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
    cancelResizeSession,
    draft,
    moveSession,
    onSurfaceObjectClearSelection,
    selectedSurfaceObjectId,
    resizeSession,
  ]);

  const toolHintProfile = activeSurfaceMaterial
    ? getSurfaceMaterialToolHint(activeSurfaceMaterial)
    : null;
  const toolHintState = resolveSurfaceInteractionState({
    draftActive: Boolean(draft),
    moveActive: Boolean(moveSession?.active),
    resizeActive: Boolean(resizeSession?.active),
  });
  const toolHint =
    toolHintProfile != null
      ? resolveEditorToolHint(toolHintProfile, toolHintState)
      : null;

  return (
    <>
      <SalaSurfaceObjectsLayer
        surfaceObjects={surfaceObjects}
        selectedSurfaceObjectId={selectedSurfaceObjectId}
        moveSession={moveSession}
        resizeSession={resizeSession}
        createSurfacePointerHandlers={createSurfacePointerHandlers}
        createSurfaceResizeHandlers={createSurfaceResizeHandlers}
      />
      <div className="hostly-sala-terreno-preview-layer" aria-hidden>
        {draft && previewStyle ? (
          <div
            className="hostly-sala-surface-object hostly-sala-surface-object--preview"
            style={previewStyle}
          />
        ) : null}
      </div>
      <SalaSmartSnapGuidesLayer
        guides={smartSnapGuides}
        coordinateScale={coordinateScale}
      />

      <div
        ref={surfaceRef}
        className={[
          "hostly-sala-terreno-hit-area",
          activeSurfaceMaterial ? "is-creating" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={toolHint ? { cursor: toolHint.cursor } : undefined}
        role="presentation"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishDraft(event, true)}
        onPointerCancel={(event) => finishDraft(event, false)}
      />

      {toolHint ? (
        <SalaEditorCanvasToolHint
          icon={toolHint.icon}
          swatch={activeMaterial?.swatch}
          text={toolHint.text}
        />
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
  onSurfaceObjectMoveStart,
  onSurfaceObjectMoveEnd,
  onSurfaceObjectResizeStart,
  onSurfaceObjectResizeEnd,
  canvasLayers = null,
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
        onSurfaceObjectMoveStart={onSurfaceObjectMoveStart}
        onSurfaceObjectMoveEnd={onSurfaceObjectMoveEnd}
        onSurfaceObjectResizeStart={onSurfaceObjectResizeStart}
        onSurfaceObjectResizeEnd={onSurfaceObjectResizeEnd}
      />
      {canvasLayers}
      {!activeMaterial && surfaceObjects.length === 0 ? (
        <div className="hostly-sala-terreno-placeholder">
          <div className="hostly-sala-terreno-placeholder__card">
            <span className="hostly-sala-terreno-placeholder__eyebrow">
              Surface Objects
            </span>
            <h2 className="hostly-sala-terreno-placeholder__title">
              Elige el suelo que necesita este espacio.
            </h2>
            <p className="hostly-sala-terreno-placeholder__text">
              Madera, piedra, césped, arena, agua o tarima ayudan a reconocer
              sala, terraza o exterior sin cambiar el servicio.
            </p>
          </div>
        </div>
      ) : null}
    </SalaEspacioCanvasFrame>
  );
}
