"use client";

import {
  useCallback,
  useMemo,
  useRef,
  type PointerEvent,
  type RefObject,
} from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { getOperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import {
  getOperationalInstanceCanvasSize,
  type OperationalInstanceResizeCorner,
} from "@/lib/sala-editor/canvas/operational-instance-layout";
import type { OperationalInstancePointerPayload } from "@/lib/sala-editor/canvas/pointer-interaction";
import type { OperationalSnapGuides } from "@/lib/sala-editor/canvas/operational-snap";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";
import {
  getBaseFloorCatalogEntry,
  type BaseFloorCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { clientToStagePoint } from "@/lib/sala-editor/canvas/canvas-viewport";
import { unscaleEditorPoint } from "@/lib/sala-editor/canvas/editor-visual-scale";
import { useCanvasViewport } from "@/components/sala-editor/canvas/canvas-viewport-context";
import { SalaCanvasSnapGuides } from "@/components/sala-editor/panels/sala-canvas-snap-guides";
import { SalaOperationalInstanceCanvasObject } from "@/components/sala-editor/panels/sala-operational-instance-canvas-object";

export type SalaOperacionWorkspaceProps = {
  espacio: SalaEspacio;
  restaurantId: string;
  instances: OperationalElementInstance[];
  selectedInstanceId: string | null;
  draggingInstanceId: string | null;
  resizingInstanceId: string | null;
  dropAnimatingInstanceId: string | null;
  snapGuides?: OperationalSnapGuides;
  isDragging: () => boolean;
  isResizing: () => boolean;
  onCanvasPointerDown: (point: { x: number; y: number }) => void;
  onInstancePointerDown: (
    instanceId: string,
    payload: OperationalInstancePointerPayload,
  ) => void;
  onInstancePointerMove: (
    instanceId: string,
    payload: OperationalInstancePointerPayload,
  ) => void;
  onInstancePointerUp: (instanceId: string) => void;
  onInstancePointerCancel: (instanceId: string) => void;
  onResizeStart: (
    instanceId: string,
    corner: OperationalInstanceResizeCorner,
    clientX: number,
    clientY: number,
  ) => void;
  onResizeMove: (clientX: number, clientY: number) => void;
  onResizeEnd: () => void;
  onResizeCancel: () => void;
  onDuplicateInstance: (instanceId: string) => void;
  onDeleteInstance: (instanceId: string) => void;
};

type SalaOperacionCanvasContentProps = Omit<
  SalaOperacionWorkspaceProps,
  "espacio" | "restaurantId"
> & {
  surfaceRef: RefObject<HTMLDivElement | null>;
};

export function SalaOperacionWorkspace({
  espacio,
  restaurantId,
  instances,
  selectedInstanceId,
  draggingInstanceId,
  resizingInstanceId,
  dropAnimatingInstanceId,
  snapGuides,
  isDragging,
  isResizing,
  onCanvasPointerDown,
  onInstancePointerDown,
  onInstancePointerMove,
  onInstancePointerUp,
  onInstancePointerCancel,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onResizeCancel,
  onDuplicateInstance,
  onDeleteInstance,
}: SalaOperacionWorkspaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const base = normalizeSalaEspacioBase(espacio.base);
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
      stageRef={surfaceRef}
      stageRole="application"
      stageAriaLabel="Lienzo de elementos operativos"
      stageStyle={{
        cursor: draggingInstanceId
          ? "grabbing"
          : resizingInstanceId
            ? "nwse-resize"
            : "crosshair",
      }}
      hint={
        <>
          {instances.length === 0 ? (
            <div className="hostly-sala-editor-canvas-hint">
              Clic en el plano para colocar
            </div>
          ) : null}
          {draggingInstanceId ? (
            <div className="hostly-sala-editor-canvas-hint hostly-sala-editor-canvas-hint--floating">
              Suelta para fijar
            </div>
          ) : null}
        </>
      }
    >
      <SalaOperacionCanvasContent
        surfaceRef={surfaceRef}
        instances={instances}
        selectedInstanceId={selectedInstanceId}
        draggingInstanceId={draggingInstanceId}
        resizingInstanceId={resizingInstanceId}
        dropAnimatingInstanceId={dropAnimatingInstanceId}
        snapGuides={snapGuides}
        isDragging={isDragging}
        isResizing={isResizing}
        onCanvasPointerDown={onCanvasPointerDown}
        onInstancePointerDown={onInstancePointerDown}
        onInstancePointerMove={onInstancePointerMove}
        onInstancePointerUp={onInstancePointerUp}
        onInstancePointerCancel={onInstancePointerCancel}
        onResizeStart={onResizeStart}
        onResizeMove={onResizeMove}
        onResizeEnd={onResizeEnd}
        onResizeCancel={onResizeCancel}
        onDuplicateInstance={onDuplicateInstance}
        onDeleteInstance={onDeleteInstance}
      />
    </SalaEspacioCanvasFrame>
  );
}

function SalaOperacionCanvasContent({
  surfaceRef,
  instances,
  selectedInstanceId,
  draggingInstanceId,
  resizingInstanceId,
  dropAnimatingInstanceId,
  snapGuides,
  isDragging,
  isResizing,
  onCanvasPointerDown,
  onInstancePointerDown,
  onInstancePointerMove,
  onInstancePointerUp,
  onInstancePointerCancel,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onResizeCancel,
  onDuplicateInstance,
  onDeleteInstance,
}: SalaOperacionCanvasContentProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const fitScale = canvasViewport?.scale ?? 1;
  const activeResizeCornerRef = useRef<OperationalInstanceResizeCorner | null>(null);
  const resizePointerBaselineRef = useRef<{ clientX: number; clientY: number } | null>(
    null,
  );

  const resolveLogicalPoint = useCallback(
    (clientX: number, clientY: number) => {
      const fromViewport = canvasViewport?.resolveStagePoint(clientX, clientY);
      const displayPoint =
        fromViewport ??
        (surfaceRef.current
          ? clientToStagePoint(surfaceRef.current, clientX, clientY)
          : null);
      if (!displayPoint) return null;
      return unscaleEditorPoint(displayPoint, coordinateScale);
    },
    [canvasViewport, coordinateScale],
  );

  const scaledSnapGuides = useMemo(() => {
    if (!snapGuides) return undefined;
    if (coordinateScale === 1) return snapGuides;
    return {
      v: snapGuides.v.map((x) => x * coordinateScale),
      h: snapGuides.h.map((y) => y * coordinateScale),
    };
  }, [coordinateScale, snapGuides]);

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (isDragging() || isResizing()) return;
      const point = resolveLogicalPoint(event.clientX, event.clientY);
      if (!point) return;
      onCanvasPointerDown(point);
    },
    [isDragging, isResizing, onCanvasPointerDown, resolveLogicalPoint],
  );

  const createMoveHandlers = useCallback(
    (instanceId: string) => ({
      onBodyPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        if (isResizing()) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        onInstancePointerDown(instanceId, {
          point,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerType: event.pointerType,
        });
      },
      onBodyPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (isResizing()) return;
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        onInstancePointerMove(instanceId, {
          point,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerType: event.pointerType,
        });
      },
      onBodyPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onInstancePointerUp(instanceId);
      },
      onBodyPointerCancel: (event: PointerEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onInstancePointerCancel(instanceId);
      },
    }),
    [
      isResizing,
      onInstancePointerCancel,
      onInstancePointerDown,
      onInstancePointerMove,
      onInstancePointerUp,
      resolveLogicalPoint,
    ],
  );

  const createResizeHandlers = useCallback(
    (instanceId: string) => ({
      onResizePointerDown: (
        corner: OperationalInstanceResizeCorner,
        event: PointerEvent<HTMLButtonElement>,
      ) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        activeResizeCornerRef.current = corner;
        resizePointerBaselineRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
        };
        onResizeStart(instanceId, corner, event.clientX, event.clientY);
      },
      onResizePointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        if (!isResizing()) return;
        event.stopPropagation();
        const baseline = resizePointerBaselineRef.current;
        if (!baseline || fitScale === 1) {
          onResizeMove(event.clientX, event.clientY);
          return;
        }
        onResizeMove(
          baseline.clientX +
            (event.clientX - baseline.clientX) / fitScale,
          baseline.clientY +
            (event.clientY - baseline.clientY) / fitScale,
        );
      },
      onResizePointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        activeResizeCornerRef.current = null;
        resizePointerBaselineRef.current = null;
        onResizeEnd();
      },
      onResizePointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        activeResizeCornerRef.current = null;
        resizePointerBaselineRef.current = null;
        onResizeCancel();
      },
    }),
    [
      isResizing,
      onResizeCancel,
      onResizeEnd,
      onResizeMove,
      onResizeStart,
      fitScale,
    ],
  );

  return (
    <>
      <div
        className="absolute inset-0"
        aria-hidden
        onPointerDown={handleCanvasPointerDown}
      />
      {scaledSnapGuides ? <SalaCanvasSnapGuides guides={scaledSnapGuides} /> : null}
      {instances.map((instance) => {
        const instanceCatalog = getOperationalElementCatalogItem(instance.elementType);
        const moveHandlers = createMoveHandlers(instance.id);
        const resizeHandlers = createResizeHandlers(instance.id);
        const dragging = draggingInstanceId === instance.id;
        const resizing = resizingInstanceId === instance.id;
        const dropAnimating = dropAnimatingInstanceId === instance.id;
        const size = getOperationalInstanceCanvasSize(instance);

        return (
          <div
            key={instance.id}
            className="absolute"
            style={{
              left: instance.position.x * coordinateScale,
              top: instance.position.y * coordinateScale,
            }}
          >
            <SalaOperationalInstanceCanvasObject
              instance={instance}
              catalogColor={instanceCatalog?.color}
              size={size}
              selected={instance.id === selectedInstanceId}
              isDragging={dragging}
              isResizing={resizing}
              isDropAnimating={dropAnimating}
              onDuplicate={() => onDuplicateInstance(instance.id)}
              onDelete={() => onDeleteInstance(instance.id)}
              {...moveHandlers}
              {...resizeHandlers}
            />
          </div>
        );
      })}
    </>
  );
}
