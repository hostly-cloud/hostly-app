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
  espacioName,
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
    <div className="hostly-sala-editor-canvas-frame">
      <div className="hostly-sala-editor-canvas-frame__bar">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg text-sm"
            style={{ backgroundColor: `${catalogItem.color}22` }}
            aria-hidden
          >
            {catalogItem.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-extrabold text-slate-900">{catalogItem.label}</p>
            <p className="truncate text-[10px] font-semibold text-slate-500">
              {espacioName}
              {instances.length > 0
                ? ` · ${instances.length} colocado${instances.length === 1 ? "" : "s"}`
                : " · clic para colocar"}
            </p>
          </div>
        </div>
      </div>

      <div
        ref={surfaceRef}
        role="application"
        aria-label="Lienzo de elementos operativos"
        className="hostly-sala-editor-canvas-frame__surface"
        style={{ cursor: draggingInstanceId ? "grabbing" : "crosshair" }}
        onPointerDown={handleCanvasPointerDown}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden
        />

        {instances.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
            <div className="text-center">
              <p className="text-sm font-extrabold text-slate-700">Haz clic en el plano</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                Aparecerá {catalogItem.label} 1 donde pulses
              </p>
            </div>
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

        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-3">
          <p className="rounded-full border border-slate-200/80 bg-white/92 px-3 py-1 text-[10px] font-semibold text-slate-500 shadow-sm backdrop-blur-sm">
            {draggingInstanceId
              ? "Suelta para fijar la posición"
              : `Haz clic para colocar · ${catalogItem.label}`}
          </p>
        </div>
      </div>
    </div>
  );
}
