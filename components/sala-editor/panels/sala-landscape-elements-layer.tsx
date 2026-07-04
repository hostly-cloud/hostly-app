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
import type {
  LandscapeElement,
  LandscapeElementDraft,
  LandscapeElementKind,
} from "@/lib/sala-editor/landscape/landscape-element";
import {
  LANDSCAPE_ELEMENT_DEFAULT_SIZE,
  isResizableLandscapeElementKind,
} from "@/lib/sala-editor/landscape/landscape-element";
import { getLandscapeToolboxItem } from "@/lib/sala-editor/catalog/landscape-toolbox";
import type { SurfaceEditOutcome, SurfaceResizeHandle } from "@/lib/sala-editor/surface/surface-interaction";
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

export type SalaLandscapeElementsLayerProps = {
  espacioId: string;
  gridSize: number;
  activeLandscapeKind?: LandscapeElementKind | null;
  landscapeElements: readonly LandscapeElement[];
  selectedLandscapeElementId?: string | null;
  onCreateLandscapeElement?: (draft: LandscapeElementDraft) => void;
  onSelectLandscapeElement?: (elementId: string | null) => void;
  onClearLandscapeSelection?: () => void;
  onUpdateLandscapeElement?: (
    elementId: string,
    patch: Partial<Omit<LandscapeElement, "id">>,
  ) => void;
  onMoveStart?: () => void;
  onMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onResizeStart?: () => void;
  onResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  readOnly?: boolean;
};

type LandscapeRect = Pick<LandscapeElement, "x" | "y" | "width" | "height">;

type LandscapeMoveSession = {
  objectId: string;
  originPointer: { x: number; y: number };
  originObject: LandscapeElement;
  active: boolean;
};

type LandscapeResizeSession = LandscapeMoveSession & {
  resizeHandle: SurfaceResizeHandle;
};

const LANDSCAPE_RESIZE_HANDLES: readonly SurfaceResizeHandle[] = [
  "nw",
  "ne",
  "sw",
  "se",
];

const LANDSCAPE_MIN_SIZE = 20;

function snapPoint(point: { x: number; y: number }, gridSize: number) {
  if (gridSize <= 0) return point;
  const offset = gridSize / 2;
  return {
    x: Math.round((point.x - offset) / gridSize) * gridSize + offset,
    y: Math.round((point.y - offset) / gridSize) * gridSize + offset,
  };
}

function landscapeElementToSnapRect(element: LandscapeElement): SnapRect {
  return {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };
}

function createSnapRect(id: string, rect: LandscapeRect): SnapRect {
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

function isRectUsable(rect: LandscapeRect): boolean {
  return rect.width >= LANDSCAPE_MIN_SIZE && rect.height >= LANDSCAPE_MIN_SIZE;
}

function createElementStyle(
  rect: LandscapeRect,
  coordinateScale: number,
): CSSProperties {
  return {
    left: Math.round(rect.x * coordinateScale),
    top: Math.round(rect.y * coordinateScale),
    width: Math.round(rect.width * coordinateScale),
    height: Math.round(rect.height * coordinateScale),
  };
}

function translateElement(
  element: LandscapeElement,
  delta: { x: number; y: number },
  gridSize: number,
): LandscapeElement {
  const snapped = snapPoint({ x: element.x + delta.x, y: element.y + delta.y }, gridSize);
  return {
    ...element,
    x: snapped.x,
    y: snapped.y,
  };
}

function createRectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
): LandscapeRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

function resizeElement(
  element: LandscapeElement,
  handle: SurfaceResizeHandle,
  delta: { x: number; y: number },
  gridSize: number,
): LandscapeRect {
  const left = element.x;
  const top = element.y;
  const right = element.x + element.width;
  const bottom = element.y + element.height;
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

  if (rect.width < LANDSCAPE_MIN_SIZE) {
    rect.width = LANDSCAPE_MIN_SIZE;
  }
  if (rect.height < LANDSCAPE_MIN_SIZE) {
    rect.height = LANDSCAPE_MIN_SIZE;
  }

  return rect;
}

export function SalaLandscapeElementsLayer({
  espacioId,
  gridSize,
  activeLandscapeKind = null,
  landscapeElements,
  selectedLandscapeElementId = null,
  onCreateLandscapeElement,
  onSelectLandscapeElement,
  onClearLandscapeSelection,
  onUpdateLandscapeElement,
  onMoveStart,
  onMoveEnd,
  onResizeStart,
  onResizeEnd,
  readOnly = false,
}: SalaLandscapeElementsLayerProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const hitAreaRef = useRef<HTMLDivElement>(null);
  const [moveSession, setMoveSession] = useState<LandscapeMoveSession | null>(null);
  const [resizeSession, setResizeSession] = useState<LandscapeResizeSession | null>(null);
  const [smartSnapGuides, setSmartSnapGuides] = useState<SnapGuide[]>([]);
  const activeTool = !readOnly && activeLandscapeKind ? getLandscapeToolboxItem(activeLandscapeKind) : null;

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
    (elementId: string, rect: LandscapeRect, activeEdges?: SnapResizableEdges) => {
      const peers = landscapeElements
        .filter((element) => element.id !== elementId)
        .map(landscapeElementToSnapRect);
      const result = snapRectToPeers(createSnapRect(elementId, rect), peers, {
        activeEdges,
        threshold: SNAP_DISTANCE_PX / Math.max(coordinateScale, 0.001),
      });
      if (!isRectUsable(result.rect)) return { rect, guides: [] };
      return result;
    },
    [coordinateScale, landscapeElements],
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
        onUpdateLandscapeElement?.(session.objectId, {
          x: session.originObject.x,
          y: session.originObject.y,
        });
        onMoveEnd?.("cancel");
      }
      return null;
    });
  }, [onMoveEnd, onUpdateLandscapeElement]);

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
        onUpdateLandscapeElement?.(session.objectId, {
          x: session.originObject.x,
          y: session.originObject.y,
          width: session.originObject.width,
          height: session.originObject.height,
        });
        onResizeEnd?.("cancel");
      }
      return null;
    });
  }, [onResizeEnd, onUpdateLandscapeElement]);

  const handlePlacementPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (readOnly || event.button !== 0 || event.target !== event.currentTarget) return;
      if (!activeLandscapeKind || moveSession || resizeSession) return;
      const point = resolveLogicalPoint(event.clientX, event.clientY);
      if (!point) return;
      const size = LANDSCAPE_ELEMENT_DEFAULT_SIZE[activeLandscapeKind];
      onClearLandscapeSelection?.();
      onCreateLandscapeElement?.({
        espacioId,
        kind: activeLandscapeKind,
        x: point.x - size.width / 2,
        y: point.y - size.height / 2,
        width: size.width,
        height: size.height,
        locked: false,
        visible: true,
        metadata: {},
      });
    },
    [
      activeLandscapeKind,
      espacioId,
      moveSession,
      onClearLandscapeSelection,
      onCreateLandscapeElement,
      readOnly,
      resizeSession,
      resolveLogicalPoint,
    ],
  );

  const createMoveHandlers = useCallback(
    (element: LandscapeElement) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (readOnly || event.button !== 0) return;
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelectLandscapeElement?.(element.id);
        setMoveSession({
          objectId: element.id,
          originPointer: point,
          originObject: element,
          active: false,
        });
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        setMoveSession((session) => {
          if (!session || session.objectId !== element.id) return session;
          const delta = {
            x: point.x - session.originPointer.x,
            y: point.y - session.originPointer.y,
          };
          const shouldActivate =
            session.active || Math.abs(delta.x) >= 1 || Math.abs(delta.y) >= 1;
          if (!shouldActivate) return session;
          if (!session.active) onMoveStart?.();
          const moved = translateElement(session.originObject, delta, gridSize);
          const snapResult = resolveSmartSnap(element.id, moved);
          onUpdateLandscapeElement?.(element.id, {
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
      onMoveStart,
      onSelectLandscapeElement,
      onUpdateLandscapeElement,
      readOnly,
      resolveLogicalPoint,
      resolveSmartSnap,
    ],
  );

  const createResizeHandlers = useCallback(
    (element: LandscapeElement, handle: SurfaceResizeHandle) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (readOnly || event.button !== 0) return;
        if (!isResizableLandscapeElementKind(element.kind)) return;
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelectLandscapeElement?.(element.id);
        setResizeSession({
          objectId: element.id,
          resizeHandle: handle,
          originPointer: point,
          originObject: element,
          active: false,
        });
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        setResizeSession((session) => {
          if (!session || session.objectId !== element.id) return session;
          const delta = {
            x: point.x - session.originPointer.x,
            y: point.y - session.originPointer.y,
          };
          const shouldActivate =
            session.active || Math.abs(delta.x) >= 1 || Math.abs(delta.y) >= 1;
          if (!shouldActivate) return session;
          if (!session.active) onResizeStart?.();
          const resized = resizeElement(
            session.originObject,
            session.resizeHandle,
            delta,
            gridSize,
          );
          const snapResult = resolveSmartSnap(
            element.id,
            resized,
            getResizeActiveEdges(session.resizeHandle),
          );
          onUpdateLandscapeElement?.(element.id, {
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
      onSelectLandscapeElement,
      onUpdateLandscapeElement,
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
      if (selectedLandscapeElementId) {
        event.preventDefault();
        onClearLandscapeSelection?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cancelMoveSession,
    cancelResizeSession,
    moveSession,
    onClearLandscapeSelection,
    readOnly,
    resizeSession,
    selectedLandscapeElementId,
  ]);

  const renderedElements = useMemo(
    () => landscapeElements.filter((element) => element.visible !== false),
    [landscapeElements],
  );

  return (
    <>
      <div className="hostly-sala-landscape-elements">
        {renderedElements.map((element) => {
          const selected =
            !readOnly && element.id === selectedLandscapeElementId;
          const dragging =
            !readOnly && moveSession?.objectId === element.id && moveSession.active;
          const resizing =
            !readOnly &&
            resizeSession?.objectId === element.id &&
            resizeSession.active;
          const handlers = !readOnly ? createMoveHandlers(element) : undefined;
          const resizable = isResizableLandscapeElementKind(element.kind);

          return (
            <div
              key={element.id}
              className="hostly-sala-landscape-element-wrap"
              style={createElementStyle(element, coordinateScale)}
            >
              <button
                type="button"
                className={[
                  "hostly-sala-landscape-element",
                  `hostly-sala-landscape-element--${element.kind}`,
                  selected ? "is-selected" : "",
                  dragging ? "is-dragging" : "",
                  resizing ? "is-resizing" : "",
                  readOnly ? "is-readonly" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={getLandscapeToolboxItem(element.kind)?.label ?? "Paisajismo"}
                tabIndex={readOnly ? -1 : 0}
                {...handlers}
              />
              {selected && resizable
                ? LANDSCAPE_RESIZE_HANDLES.map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      className={[
                        "hostly-sala-landscape-element__resize-handle",
                        `hostly-sala-landscape-element__resize-handle--${handle}`,
                      ].join(" ")}
                      aria-label={`Redimensionar elemento Landscape ${handle}`}
                      title="Redimensionar"
                      {...createResizeHandlers(element, handle)}
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
              "hostly-sala-landscape-placement-hit-area",
              activeLandscapeKind ? "is-creating" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={activeTool ? { cursor: "crosshair" } : undefined}
            onPointerDown={handlePlacementPointerDown}
          />
          {activeTool ? (
            <SalaEditorCanvasToolHint icon={activeTool.icon} text={activeTool.workspaceHint} />
          ) : null}
        </>
      ) : null}
    </>
  );
}
