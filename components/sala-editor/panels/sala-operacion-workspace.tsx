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
  onCanvasPlace: (point: { x: number; y: number }) => void;
  onSelectInstance: (instanceId: string) => void;
};

export function SalaOperacionWorkspace({
  espacioName,
  catalogItem,
  instances,
  selectedInstanceId,
  onCanvasPlace,
  onSelectInstance,
}: SalaOperacionWorkspaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const el = surfaceRef.current;
      if (!el) return;
      const point = clientToCanvasPoint(el, event.clientX, event.clientY);
      onCanvasPlace(point);
    },
    [onCanvasPlace],
  );

  return (
    <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_55%,#eef2f7_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
      <div className="border-b border-slate-200/70 bg-white/85 px-4 py-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
          Elemento activo
        </p>
        <div className="mt-1 flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
            style={{ backgroundColor: `${catalogItem.color}22` }}
            aria-hidden
          >
            {catalogItem.icon}
          </span>
          <div>
            <p className="text-base font-extrabold text-slate-900">{catalogItem.label}</p>
            <p className="text-[11px] font-semibold text-slate-500">{espacioName}</p>
          </div>
        </div>
      </div>

      <div
        ref={surfaceRef}
        role="application"
        aria-label="Lienzo de elementos operativos"
        className="relative min-h-[320px] flex-1 touch-none select-none"
        style={{ cursor: "crosshair" }}
        onPointerDown={handlePointerDown}
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

        {instances.map((instance) => {
          const instanceCatalog = getOperationalElementCatalogItem(instance.elementType);
          return (
            <div
              key={instance.id}
              className="absolute"
              style={{
                left: instance.position.x,
                top: instance.position.y,
              }}
            >
              <SalaOperationalElementInstanceCard
                instance={instance}
                catalogIcon={instanceCatalog?.icon}
                selected={instance.id === selectedInstanceId}
                onSelect={() => onSelectInstance(instance.id)}
              />
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
          <p className="rounded-full border border-slate-200/80 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm backdrop-blur-sm">
            Haz clic para colocar · {catalogItem.label}
          </p>
        </div>
      </div>
    </div>
  );
}
