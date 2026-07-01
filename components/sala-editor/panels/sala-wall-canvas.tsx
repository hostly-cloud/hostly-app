"use client";

import { useCallback, useRef, type PointerEvent } from "react";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { SalaWallDrawingDraft } from "@/hooks/useSalaWallDrawing";
import {
  SALA_WALL_STROKE_COLOR,
  SALA_WALL_STROKE_WIDTH,
} from "@/lib/sala-editor/geometry/wall-geometry";

export type SalaWallCanvasProps = {
  walls: SalaWallSegment[];
  draft: SalaWallDrawingDraft | null;
  selectedWallId: string | null;
  hint: string;
  onPointerDown: (point: { x: number; y: number }) => void;
  onPointerMove: (point: { x: number; y: number }) => void;
};

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

export function SalaWallCanvas({
  walls,
  draft,
  selectedWallId,
  hint,
  onPointerDown,
  onPointerMove,
}: SalaWallCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  const resolvePoint = useCallback((clientX: number, clientY: number) => {
    const el = surfaceRef.current;
    if (!el) return null;
    return clientToCanvasPoint(el, clientX, clientY);
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const point = resolvePoint(event.clientX, event.clientY);
      if (!point) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      onPointerDown(point);
    },
    [onPointerDown, resolvePoint],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const point = resolvePoint(event.clientX, event.clientY);
      if (!point) return;
      onPointerMove(point);
    },
    [onPointerMove, resolvePoint],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={surfaceRef}
        role="application"
        aria-label="Lienzo de paredes"
        className="relative min-h-[320px] flex-1 touch-none select-none"
        style={{ cursor: "crosshair" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
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

        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          {walls.map((wall) => {
            const selected = wall.id === selectedWallId;
            return (
              <line
                key={wall.id}
                x1={wall.x1}
                y1={wall.y1}
                x2={wall.x2}
                y2={wall.y2}
                stroke={selected ? "var(--hostly-accent, #315f7d)" : SALA_WALL_STROKE_COLOR}
                strokeWidth={selected ? SALA_WALL_STROKE_WIDTH + 2 : SALA_WALL_STROKE_WIDTH}
                strokeLinecap="round"
              />
            );
          })}

          {draft ? (
            <line
              x1={draft.x1}
              y1={draft.y1}
              x2={draft.previewX}
              y2={draft.previewY}
              stroke={SALA_WALL_STROKE_COLOR}
              strokeWidth={SALA_WALL_STROKE_WIDTH}
              strokeLinecap="round"
              opacity={0.85}
            />
          ) : null}
        </svg>

        {!draft ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
            <p className="rounded-full border border-slate-200/80 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm backdrop-blur-sm">
              {hint}
            </p>
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
            <p className="rounded-full border border-slate-200/80 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm backdrop-blur-sm">
              Segundo clic para fijar · ESC para cancelar
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
