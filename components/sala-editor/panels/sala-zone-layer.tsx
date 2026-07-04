"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type { SurfaceEditOutcome, SurfaceResizeHandle } from "@/lib/sala-editor/surface/surface-interaction";
import type { Zone, ZoneDraft, ZoneType } from "@/lib/sala-editor/zones/zone";
import { DEFAULT_ZONE_SIZE } from "@/lib/sala-editor/zones/zone";
import { getZoneCatalogItem } from "@/lib/sala-editor/zones/zone-catalog";
import { clientToStagePoint } from "@/lib/sala-editor/canvas/canvas-viewport";
import { unscaleEditorPoint } from "@/lib/sala-editor/canvas/editor-visual-scale";
import { useCanvasViewport } from "@/components/sala-editor/canvas/canvas-viewport-context";
import { SalaSmartSnapGuidesLayer } from "@/components/sala-editor/panels/sala-smart-snap-guides-layer";
import { SalaEditorCanvasToolHint } from "@/components/sala-editor/sala-editor-canvas-tool-hint";
import {
  SNAP_DISTANCE_PX,
  snapRectToPeers,
  type SnapGuide,
  type SnapRect,
  type SnapResizableEdges,
} from "@/lib/sala-editor/snap";

export type SalaZoneLayerProps = {
  espacioId: string;
  gridSize: number;
  activeZoneType?: ZoneType | null;
  zones: readonly Zone[];
  selectedZoneId?: string | null;
  onCreateZone?: (draft: ZoneDraft) => void;
  onSelectZone?: (zoneId: string | null) => void;
  onClearZoneSelection?: () => void;
  onUpdateZone?: (zoneId: string, patch: Partial<Omit<Zone, "id">>) => void;
  onMoveStart?: () => void;
  onMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onResizeStart?: () => void;
  onResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  readOnly?: boolean;
};

type ZoneRect = Pick<Zone, "x" | "y" | "width" | "height">;
type ZoneMoveSession = {
  objectId: string;
  originPointer: { x: number; y: number };
  originObject: Zone;
  active: boolean;
};
type ZoneResizeSession = ZoneMoveSession & { resizeHandle: SurfaceResizeHandle };

const ZONE_RESIZE_HANDLES: readonly SurfaceResizeHandle[] = ["nw", "ne", "sw", "se"];
const ZONE_MIN_SIZE = 56;

function snapPoint(point: { x: number; y: number }, gridSize: number) {
  if (gridSize <= 0) return point;
  const offset = gridSize / 2;
  return {
    x: Math.round((point.x - offset) / gridSize) * gridSize + offset,
    y: Math.round((point.y - offset) / gridSize) * gridSize + offset,
  };
}

function zoneToSnapRect(zone: Zone): SnapRect {
  return {
    id: zone.id,
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
  };
}

function createSnapRect(id: string, rect: ZoneRect): SnapRect {
  return {
    id,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function getResizeActiveEdges(handle: SurfaceResizeHandle): SnapResizableEdges {
  return {
    left: handle === "nw" || handle === "sw",
    right: handle === "ne" || handle === "se",
    top: handle === "nw" || handle === "ne",
    bottom: handle === "sw" || handle === "se",
  };
}

function createZoneStyle(zone: Zone, coordinateScale: number): CSSProperties {
  return {
    left: Math.round(zone.x * coordinateScale),
    top: Math.round(zone.y * coordinateScale),
    width: Math.round(zone.width * coordinateScale),
    height: Math.round(zone.height * coordinateScale),
    "--zone-color": zone.color,
  } as CSSProperties;
}

function translateZone(zone: Zone, delta: { x: number; y: number }, gridSize: number): Zone {
  const snapped = snapPoint({ x: zone.x + delta.x, y: zone.y + delta.y }, gridSize);
  return { ...zone, x: snapped.x, y: snapped.y };
}

function createRectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): ZoneRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

function resizeZone(
  zone: Zone,
  handle: SurfaceResizeHandle,
  delta: { x: number; y: number },
  gridSize: number,
): ZoneRect {
  const left = zone.x;
  const top = zone.y;
  const right = zone.x + zone.width;
  const bottom = zone.y + zone.height;
  const anchor =
    handle === "nw"
      ? { x: right, y: bottom }
      : handle === "ne"
        ? { x: left, y: bottom }
        : handle === "sw"
          ? { x: right, y: top }
          : { x: left, y: top };
  const dragged =
    handle === "nw"
      ? { x: left + delta.x, y: top + delta.y }
      : handle === "ne"
        ? { x: right + delta.x, y: top + delta.y }
        : handle === "sw"
          ? { x: left + delta.x, y: bottom + delta.y }
          : { x: right + delta.x, y: bottom + delta.y };
  const rect = createRectFromPoints(anchor, snapPoint(dragged, gridSize));
  rect.width = Math.max(ZONE_MIN_SIZE, rect.width);
  rect.height = Math.max(ZONE_MIN_SIZE, rect.height);
  return rect;
}

export function SalaZoneLayer({
  espacioId,
  gridSize,
  activeZoneType = null,
  zones,
  selectedZoneId = null,
  onCreateZone,
  onSelectZone,
  onClearZoneSelection,
  onUpdateZone,
  onMoveStart,
  onMoveEnd,
  onResizeStart,
  onResizeEnd,
  readOnly = false,
}: SalaZoneLayerProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const hitAreaRef = useRef<HTMLDivElement>(null);
  const [moveSession, setMoveSession] = useState<ZoneMoveSession | null>(null);
  const [resizeSession, setResizeSession] = useState<ZoneResizeSession | null>(null);
  const [smartSnapGuides, setSmartSnapGuides] = useState<SnapGuide[]>([]);
  const activeZone = !readOnly && activeZoneType ? getZoneCatalogItem(activeZoneType) : null;

  const resolveLogicalPoint = useCallback(
    (clientX: number, clientY: number) => {
      const fromViewport = canvasViewport?.resolveStagePoint(clientX, clientY);
      const displayPoint =
        fromViewport ??
        (hitAreaRef.current
          ? clientToStagePoint(hitAreaRef.current, clientX, clientY)
          : null);
      if (!displayPoint) return null;
      return snapPoint(unscaleEditorPoint(displayPoint, coordinateScale), gridSize);
    },
    [canvasViewport, coordinateScale, gridSize],
  );

  const resolveSmartSnap = useCallback(
    (zoneId: string, rect: ZoneRect, activeEdges?: SnapResizableEdges) => {
      const peers = zones
        .filter((zone) => zone.id !== zoneId)
        .map(zoneToSnapRect);
      const result = snapRectToPeers(createSnapRect(zoneId, rect), peers, {
        activeEdges,
        threshold: SNAP_DISTANCE_PX / Math.max(coordinateScale, 0.001),
      });
      if (result.rect.width < ZONE_MIN_SIZE || result.rect.height < ZONE_MIN_SIZE) {
        return { rect, guides: [] };
      }
      return result;
    },
    [coordinateScale, zones],
  );

  const finishMoveSession = useCallback(() => {
    setMoveSession((session) => {
      setSmartSnapGuides([]);
      if (session?.active) onMoveEnd?.("complete");
      return null;
    });
  }, [onMoveEnd]);

  const cancelMoveSession = useCallback(() => {
    setMoveSession((session) => {
      setSmartSnapGuides([]);
      if (session?.active) {
        onUpdateZone?.(session.objectId, {
          x: session.originObject.x,
          y: session.originObject.y,
        });
        onMoveEnd?.("cancel");
      }
      return null;
    });
  }, [onMoveEnd, onUpdateZone]);

  const finishResizeSession = useCallback(() => {
    setResizeSession((session) => {
      setSmartSnapGuides([]);
      if (session?.active) onResizeEnd?.("complete");
      return null;
    });
  }, [onResizeEnd]);

  const cancelResizeSession = useCallback(() => {
    setResizeSession((session) => {
      setSmartSnapGuides([]);
      if (session?.active) {
        onUpdateZone?.(session.objectId, {
          x: session.originObject.x,
          y: session.originObject.y,
          width: session.originObject.width,
          height: session.originObject.height,
        });
        onResizeEnd?.("cancel");
      }
      return null;
    });
  }, [onResizeEnd, onUpdateZone]);

  const handlePlacementPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (readOnly || event.button !== 0 || event.target !== event.currentTarget) return;
      if (!activeZone || moveSession || resizeSession) return;
      const point = resolveLogicalPoint(event.clientX, event.clientY);
      if (!point) return;
      onClearZoneSelection?.();
      onCreateZone?.({
        espacioId,
        type: activeZone.type,
        name: activeZone.label,
        x: point.x - DEFAULT_ZONE_SIZE.width / 2,
        y: point.y - DEFAULT_ZONE_SIZE.height / 2,
        width: DEFAULT_ZONE_SIZE.width,
        height: DEFAULT_ZONE_SIZE.height,
        color: activeZone.color,
        locked: false,
        visible: true,
        metadata: {},
      });
    },
    [
      activeZone,
      espacioId,
      moveSession,
      onClearZoneSelection,
      onCreateZone,
      readOnly,
      resizeSession,
      resolveLogicalPoint,
    ],
  );

  const createMoveHandlers = useCallback(
    (zone: Zone) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (readOnly || event.button !== 0) return;
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelectZone?.(zone.id);
        setMoveSession({
          objectId: zone.id,
          originPointer: point,
          originObject: zone,
          active: false,
        });
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        setMoveSession((session) => {
          if (!session || session.objectId !== zone.id) return session;
          const delta = {
            x: point.x - session.originPointer.x,
            y: point.y - session.originPointer.y,
          };
          const shouldActivate =
            session.active || Math.abs(delta.x) >= 1 || Math.abs(delta.y) >= 1;
          if (!shouldActivate) return session;
          if (!session.active) onMoveStart?.();
          const moved = translateZone(session.originObject, delta, gridSize);
          const snapResult = resolveSmartSnap(zone.id, moved);
          onUpdateZone?.(zone.id, { x: snapResult.rect.x, y: snapResult.rect.y });
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
      onMoveStart,
      onSelectZone,
      onUpdateZone,
      readOnly,
      resolveLogicalPoint,
      resolveSmartSnap,
    ],
  );

  const createResizeHandlers = useCallback(
    (zone: Zone, handle: SurfaceResizeHandle) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (readOnly || event.button !== 0) return;
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelectZone?.(zone.id);
        setResizeSession({
          objectId: zone.id,
          resizeHandle: handle,
          originPointer: point,
          originObject: zone,
          active: false,
        });
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        setResizeSession((session) => {
          if (!session || session.objectId !== zone.id) return session;
          const delta = {
            x: point.x - session.originPointer.x,
            y: point.y - session.originPointer.y,
          };
          const shouldActivate =
            session.active || Math.abs(delta.x) >= 1 || Math.abs(delta.y) >= 1;
          if (!shouldActivate) return session;
          if (!session.active) onResizeStart?.();
          const resized = resizeZone(session.originObject, session.resizeHandle, delta, gridSize);
          const snapResult = resolveSmartSnap(
            zone.id,
            resized,
            getResizeActiveEdges(session.resizeHandle),
          );
          onUpdateZone?.(zone.id, {
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
      onResizeStart,
      onSelectZone,
      onUpdateZone,
      readOnly,
      resolveLogicalPoint,
      resolveSmartSnap,
    ],
  );

  useEffect(() => {
    if (readOnly) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
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
      if (selectedZoneId) {
        event.preventDefault();
        onClearZoneSelection?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cancelMoveSession,
    cancelResizeSession,
    moveSession,
    onClearZoneSelection,
    readOnly,
    resizeSession,
    selectedZoneId,
  ]);

  return (
    <>
      <div className="hostly-sala-zone-layer">
        {zones
          .filter((zone) => zone.visible !== false)
          .map((zone) => {
            const selected = !readOnly && zone.id === selectedZoneId;
            const dragging =
              !readOnly && moveSession?.objectId === zone.id && moveSession.active;
            const resizing =
              !readOnly && resizeSession?.objectId === zone.id && resizeSession.active;
            const handlers = !readOnly ? createMoveHandlers(zone) : undefined;

            return (
              <div
                key={zone.id}
                className="hostly-sala-zone-wrap"
                style={createZoneStyle(zone, coordinateScale)}
              >
                <button
                  type="button"
                  className={[
                    "hostly-sala-zone",
                    selected ? "is-selected" : "",
                    dragging ? "is-dragging" : "",
                    resizing ? "is-resizing" : "",
                    readOnly ? "is-readonly" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={`Zona ${zone.name}`}
                  tabIndex={readOnly ? -1 : 0}
                  {...handlers}
                >
                  <span className="hostly-sala-zone__label">{zone.name}</span>
                </button>
                {selected
                  ? ZONE_RESIZE_HANDLES.map((handle) => (
                      <button
                        key={handle}
                        type="button"
                        className={[
                          "hostly-sala-zone__resize-handle",
                          `hostly-sala-zone__resize-handle--${handle}`,
                        ].join(" ")}
                        aria-label={`Redimensionar zona ${handle}`}
                        title="Redimensionar"
                        {...createResizeHandlers(zone, handle)}
                      />
                    ))
                  : null}
              </div>
            );
          })}
      </div>
      {!readOnly ? (
        <>
          <SalaSmartSnapGuidesLayer
            guides={smartSnapGuides}
            coordinateScale={coordinateScale}
          />
          <div
            ref={hitAreaRef}
            className={[
              "hostly-sala-zone-placement-hit-area",
              activeZone ? "is-creating" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={activeZone ? { cursor: "crosshair" } : undefined}
            onPointerDown={handlePlacementPointerDown}
          />
          {activeZone ? (
            <SalaEditorCanvasToolHint icon="◫" text={activeZone.workspaceHint} />
          ) : null}
        </>
      ) : null}
    </>
  );
}
