"use client";

import { useCallback, useRef, type PointerEvent } from "react";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import { getOperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import { SalaOperationalElementInstanceCard } from "@/components/sala-editor/panels/sala-operational-element-instance-card";

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
  espacioName: string;
  catalogItem: OperationalElementCatalogItem;
  instances: OperationalElementInstance[];
  selectedInstanceId: string | null;
  draggingInstanceId: string | null;
  dropAnimatingInstanceId: string | null;
  isDragging: () => boolean;
  onCanvasPointerDown: (point: { x: number; y: number }) => void;
  onInstancePointerDown: (instanceId: string, point: { x: number; y: number }) => void;
  onInstancePointerMove: (instanceId: string, point: { x: number; y: number }) => void;
  onInstancePointerUp: (instanceId: string) => void;
  onInstancePointerCancel: (instanceId: string) => void;
};

export function SalaOperacionWorkspace({
  catalogItem,
  instances,
  selectedInstanceId,
  draggingInstanceId,
  dropAnimatingInstanceId,
  isDragging,
  onCanvasPointerDown,
  onInstancePointerDown,
  onInstancePointerMove,
  onInstancePointerUp,
  onInstancePointerCancel,
}: SalaOperacionWorkspaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  const resolvePoint = useCallback((clientX: number, clientY: number) => {
    const el = surfaceRef.current;
    if (!el) return null;
    return clientToCanvasPoint(el, clientX, clientY);
  }, []);

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (isDragging()) return;
      const point = resolvePoint(event.clientX, event.clientY);
      if (!point) return;
      onCanvasPointerDown(point);
    },
    [isDragging, onCanvasPointerDown, resolvePoint],
  );

  const createInstanceHandlers = useCallback(
    (instanceId: string) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = resolvePoint(event.clientX, event.clientY);
        if (!point) return;
        onInstancePointerDown(instanceId, point);
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const point = resolvePoint(event.clientX, event.clientY);
        if (!point) return;
        onInstancePointerMove(instanceId, point);
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onInstancePointerUp(instanceId);
      },
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onInstancePointerCancel(instanceId);
      },
    }),
    [
      onInstancePointerCancel,
      onInstancePointerDown,
      onInstancePointerMove,
      onInstancePointerUp,
      resolvePoint,
    ],
  );

  return (
    <div className="hostly-sala-editor-canvas-frame hostly-sala-editor-canvas-frame--canvas">
      <div
        ref={surfaceRef}
        role="application"
        aria-label="Lienzo de elementos operativos"
        className="hostly-sala-editor-canvas-frame__surface"
        style={{ cursor: draggingInstanceId ? "grabbing" : "crosshair" }}
        onPointerDown={handleCanvasPointerDown}
      >
        <div className="hostly-sala-editor-dot-grid" aria-hidden />

        {instances.length === 0 ? (
          <div className="hostly-sala-editor-canvas-hint">
            Clic en el plano para colocar
          </div>
        ) : null}

        {instances.map((instance) => {
          const instanceCatalog = getOperationalElementCatalogItem(instance.elementType);
          const handlers = createInstanceHandlers(instance.id);
          const dragging = draggingInstanceId === instance.id;
          const dropAnimating = dropAnimatingInstanceId === instance.id;

          return (
            <div
              key={instance.id}
              className="absolute"
              style={{
                left: instance.position.x,
                top: instance.position.y,
                zIndex: dragging ? 30 : instance.id === selectedInstanceId ? 10 : 1,
              }}
            >
              <SalaOperationalElementInstanceCard
                instance={instance}
                catalogIcon={instanceCatalog?.icon}
                catalogColor={instanceCatalog?.color}
                selected={instance.id === selectedInstanceId}
                isDragging={dragging}
                isDropAnimating={dropAnimating}
                {...handlers}
              />
            </div>
          );
        })}

        {draggingInstanceId ? (
          <div className="hostly-sala-editor-canvas-hint hostly-sala-editor-canvas-hint--floating">
            Suelta para fijar
          </div>
        ) : null}
      </div>
    </div>
  );
}
