"use client";

import { useCallback, useRef, type PointerEvent } from "react";
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
import { SalaCanvasSnapGuides } from "@/components/sala-editor/panels/sala-canvas-snap-guides";
import { SalaOperationalInstanceCanvasObject } from "@/components/sala-editor/panels/sala-operational-instance-canvas-object";

function clientToCanvasPoint(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

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
  const activeResizeCornerRef = useRef<OperationalInstanceResizeCorner | null>(null);
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

  const resolvePoint = useCallback((clientX: number, clientY: number) => {
    const el = surfaceRef.current;
    if (!el) return null;
    return clientToCanvasPoint(el, clientX, clientY);
  }, []);

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (isDragging() || isResizing()) return;
      const point = resolvePoint(event.clientX, event.clientY);
      if (!point) return;
      onCanvasPointerDown(point);
    },
    [isDragging, isResizing, onCanvasPointerDown, resolvePoint],
  );

  const createMoveHandlers = useCallback(
    (instanceId: string) => ({
      onBodyPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        if (isResizing()) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = resolvePoint(event.clientX, event.clientY);
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
        const point = resolvePoint(event.clientX, event.clientY);
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
      resolvePoint,
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
        onResizeStart(instanceId, corner, event.clientX, event.clientY);
      },
      onResizePointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        if (!isResizing()) return;
        event.stopPropagation();
        onResizeMove(event.clientX, event.clientY);
      },
      onResizePointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        activeResizeCornerRef.current = null;
        onResizeEnd();
      },
      onResizePointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        activeResizeCornerRef.current = null;
        onResizeCancel();
      },
    }),
    [isResizing, onResizeCancel, onResizeEnd, onResizeMove, onResizeStart],
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
      onStagePointerDown={handleCanvasPointerDown}
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
      {snapGuides ? <SalaCanvasSnapGuides guides={snapGuides} /> : null}
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
              left: instance.position.x,
              top: instance.position.y,
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
    </SalaEspacioCanvasFrame>
  );
}
