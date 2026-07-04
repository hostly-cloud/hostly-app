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
  SalaStructuralElement,
  SalaStructuralElementDraft,
  SalaStructuralElementKind,
} from "@/lib/sala-editor/types/elementos-estructurales";
import {
  STRUCTURAL_OBJECT_DEFAULT_SIZE,
  isSalaStructuralObjectKind,
} from "@/lib/sala-editor/types/elementos-estructurales";
import type { SurfaceEditOutcome } from "@/lib/sala-editor/surface/surface-interaction";
import type { SurfaceResizeHandle } from "@/lib/sala-editor/surface/surface-interaction";
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
import {
  getStructuralToolHint,
  resolveEditorToolHint,
  resolveSurfaceInteractionState,
} from "@/lib/sala-editor/ux/editor-tool-hints";

export type SalaStructureObjectsLayerProps = {
  espacioId: string;
  gridSize: number;
  activeToolKind?: SalaStructuralElementKind | null;
  structuralElements: readonly SalaStructuralElement[];
  selectedStructuralElementId?: string | null;
  onCreateStructuralElement?: (draft: SalaStructuralElementDraft) => void;
  onSelectStructuralElement?: (elementId: string | null) => void;
  onClearStructuralElementSelection?: () => void;
  onUpdateStructuralElement?: (
    elementId: string,
    patch: Partial<Omit<SalaStructuralElement, "id">>,
  ) => void;
  onMoveStart?: () => void;
  onMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onResizeStart?: () => void;
  onResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  readOnly?: boolean;
};

type StructuralRect = Pick<SalaStructuralElement, "x" | "y" | "width" | "height">;

type StructureMoveSession = {
  objectId: string;
  originPointer: { x: number; y: number };
  originObject: SalaStructuralElement;
  active: boolean;
};

type StructureResizeSession = StructureMoveSession & {
  resizeHandle: SurfaceResizeHandle;
};

const STRUCTURE_RESIZE_HANDLES: readonly SurfaceResizeHandle[] = [
  "nw",
  "ne",
  "sw",
  "se",
];

const STRUCTURE_MIN_SIZE = 12;

function snapPoint(point: { x: number; y: number }, gridSize: number) {
  if (gridSize <= 0) return point;
  const offset = gridSize / 2;
  return {
    x: Math.round((point.x - offset) / gridSize) * gridSize + offset,
    y: Math.round((point.y - offset) / gridSize) * gridSize + offset,
  };
}

function structuralElementToSnapRect(element: SalaStructuralElement): SnapRect {
  return {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };
}

function createSnapRect(id: string, rect: StructuralRect): SnapRect {
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

function isRectUsable(rect: StructuralRect): boolean {
  return rect.width >= STRUCTURE_MIN_SIZE && rect.height >= STRUCTURE_MIN_SIZE;
}

function createObjectStyle(
  rect: StructuralRect,
  coordinateScale: number,
): CSSProperties {
  return {
    left: Math.round(rect.x * coordinateScale),
    top: Math.round(rect.y * coordinateScale),
    width: Math.round(rect.width * coordinateScale),
    height: Math.round(rect.height * coordinateScale),
  };
}

function translateObject(
  element: SalaStructuralElement,
  delta: { x: number; y: number },
  gridSize: number,
): SalaStructuralElement {
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
): StructuralRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

function resizeObject(
  element: SalaStructuralElement,
  handle: SurfaceResizeHandle,
  delta: { x: number; y: number },
  gridSize: number,
): StructuralRect {
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
  const snapped = snapPoint(dragged, gridSize);
  const rect = createRectFromPoints(anchor, snapped);

  if (rect.width < STRUCTURE_MIN_SIZE) {
    rect.width = STRUCTURE_MIN_SIZE;
    if (snapped.x < anchor.x) rect.x = anchor.x - STRUCTURE_MIN_SIZE;
  }
  if (rect.height < STRUCTURE_MIN_SIZE) {
    rect.height = STRUCTURE_MIN_SIZE;
    if (snapped.y < anchor.y) rect.y = anchor.y - STRUCTURE_MIN_SIZE;
  }

  return rect;
}

export function SalaStructureObjectsLayer({
  espacioId,
  gridSize,
  activeToolKind = null,
  structuralElements,
  selectedStructuralElementId = null,
  onCreateStructuralElement,
  onSelectStructuralElement,
  onClearStructuralElementSelection,
  onUpdateStructuralElement,
  onMoveStart,
  onMoveEnd,
  onResizeStart,
  onResizeEnd,
  readOnly = false,
}: SalaStructureObjectsLayerProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const hitAreaRef = useRef<HTMLDivElement>(null);
  const [moveSession, setMoveSession] = useState<StructureMoveSession | null>(null);
  const [resizeSession, setResizeSession] = useState<StructureResizeSession | null>(null);
  const [smartSnapGuides, setSmartSnapGuides] = useState<SnapGuide[]>([]);
  const activeObjectKind =
    !readOnly && isSalaStructuralObjectKind(activeToolKind) ? activeToolKind : null;
  const toolHint = activeObjectKind
    ? resolveEditorToolHint(
        getStructuralToolHint(activeObjectKind),
        resolveSurfaceInteractionState({
          draftActive: false,
          moveActive: Boolean(moveSession?.active),
          resizeActive: Boolean(resizeSession?.active),
        }),
      )
    : null;

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
    (elementId: string, rect: StructuralRect, activeEdges?: SnapResizableEdges) => {
      const peers = structuralElements
        .filter(
          (element) =>
            element.id !== elementId && isSalaStructuralObjectKind(element.kind),
        )
        .map(structuralElementToSnapRect);
      const snapResult = snapRectToPeers(createSnapRect(elementId, rect), peers, {
        activeEdges,
        threshold: SNAP_DISTANCE_PX / Math.max(coordinateScale, 0.001),
      });

      if (!isRectUsable(snapResult.rect)) {
        return { rect, guides: [] };
      }

      return snapResult;
    },
    [coordinateScale, structuralElements],
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
        onUpdateStructuralElement?.(session.objectId, {
          x: session.originObject.x,
          y: session.originObject.y,
        });
        onMoveEnd?.("cancel");
      }
      return null;
    });
  }, [onMoveEnd, onUpdateStructuralElement]);

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
        onUpdateStructuralElement?.(session.objectId, {
          x: session.originObject.x,
          y: session.originObject.y,
          width: session.originObject.width,
          height: session.originObject.height,
        });
        onResizeEnd?.("cancel");
      }
      return null;
    });
  }, [onResizeEnd, onUpdateStructuralElement]);

  const handlePlacementPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (readOnly || event.button !== 0 || event.target !== event.currentTarget) return;
      if (!activeObjectKind || moveSession || resizeSession) return;
      const point = resolveLogicalPoint(event.clientX, event.clientY);
      if (!point) return;
      const size = STRUCTURAL_OBJECT_DEFAULT_SIZE[activeObjectKind];
      onClearStructuralElementSelection?.();
      onCreateStructuralElement?.({
        espacioId,
        kind: activeObjectKind,
        x: point.x - size.width / 2,
        y: point.y - size.height / 2,
        width: size.width,
        height: size.height,
        locked: false,
        metadata: {},
      });
    },
    [
      activeObjectKind,
      espacioId,
      moveSession,
      onClearStructuralElementSelection,
      onCreateStructuralElement,
      readOnly,
      resizeSession,
      resolveLogicalPoint,
    ],
  );

  const createMoveHandlers = useCallback(
    (element: SalaStructuralElement) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (readOnly || event.button !== 0) return;
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelectStructuralElement?.(element.id);
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

          const moved = translateObject(session.originObject, delta, gridSize);
          const snapResult = resolveSmartSnap(element.id, moved);
          onUpdateStructuralElement?.(element.id, {
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
      onSelectStructuralElement,
      onUpdateStructuralElement,
      readOnly,
      resolveLogicalPoint,
      resolveSmartSnap,
    ],
  );

  const createResizeHandlers = useCallback(
    (element: SalaStructuralElement, handle: SurfaceResizeHandle) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (readOnly || event.button !== 0) return;
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelectStructuralElement?.(element.id);
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

          const resized = resizeObject(
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
          onUpdateStructuralElement?.(element.id, {
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
      onSelectStructuralElement,
      onUpdateStructuralElement,
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
      if (selectedStructuralElementId) {
        event.preventDefault();
        onClearStructuralElementSelection?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cancelMoveSession,
    cancelResizeSession,
    moveSession,
    onClearStructuralElementSelection,
    readOnly,
    resizeSession,
    selectedStructuralElementId,
  ]);

  const renderedElements = useMemo(
    () =>
      structuralElements.filter((element) =>
        isSalaStructuralObjectKind(element.kind),
      ),
    [structuralElements],
  );

  return (
    <>
      <div className="hostly-sala-structure-objects">
        {renderedElements.map((element) => {
          const selected =
            !readOnly && element.id === selectedStructuralElementId;
          const dragging =
            !readOnly && moveSession?.objectId === element.id && moveSession.active;
          const resizing =
            !readOnly &&
            resizeSession?.objectId === element.id &&
            resizeSession.active;
          const handlers = !readOnly ? createMoveHandlers(element) : undefined;

          return (
            <div
              key={element.id}
              className="hostly-sala-structure-object-wrap"
              style={createObjectStyle(element, coordinateScale)}
            >
              <button
                type="button"
                className={[
                  "hostly-sala-structure-object",
                  `hostly-sala-structure-object--${element.kind}`,
                  selected ? "is-selected" : "",
                  dragging ? "is-dragging" : "",
                  resizing ? "is-resizing" : "",
                  readOnly ? "is-readonly" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label="Objeto estructural"
                tabIndex={readOnly ? -1 : 0}
                {...handlers}
              />
              {selected
                ? STRUCTURE_RESIZE_HANDLES.map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      className={[
                        "hostly-sala-structure-object__resize-handle",
                        `hostly-sala-structure-object__resize-handle--${handle}`,
                      ].join(" ")}
                      aria-label={`Redimensionar objeto estructural ${handle}`}
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
              "hostly-sala-structure-placement-hit-area",
              activeObjectKind ? "is-creating" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={toolHint ? { cursor: toolHint.cursor } : undefined}
            onPointerDown={handlePlacementPointerDown}
          />
          {toolHint ? (
            <SalaEditorCanvasToolHint icon={toolHint.icon} text={toolHint.text} />
          ) : null}
        </>
      ) : null}
    </>
  );
}
