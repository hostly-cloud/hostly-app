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
  /** Dentro del frame de espacio — sin chrome propio. */
  embedded?: boolean;
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
  embedded = false,
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
    <div
      ref={surfaceRef}
      role={embedded ? undefined : "application"}
      aria-label={embedded ? undefined : "Lienzo de paredes"}
      className={
        embedded
          ? "hostly-sala-espacio-frame__wall-stage"
          : "hostly-sala-editor-canvas-frame__surface"
      }
      style={{ cursor: "crosshair" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      {!embedded ? <div className="hostly-sala-editor-dot-grid" aria-hidden /> : null}

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
        <div className="hostly-sala-editor-canvas-hint">{hint}</div>
      ) : (
        <div className="hostly-sala-editor-canvas-hint hostly-sala-editor-canvas-hint--floating">
          Segundo clic para fijar
        </div>
      )}
    </div>
  );
}
