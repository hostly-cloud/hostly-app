"use client";

import { useCallback, useRef, type PointerEvent } from "react";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { SalaWallDrawingDraft } from "@/hooks/useSalaWallDrawing";
import {
  getWallCenter,
  SALA_WALL_STROKE_COLOR,
  SALA_WALL_STROKE_WIDTH,
} from "@/lib/sala-editor/geometry/wall-geometry";
import type {
  WallInteractionTarget,
  WallPointerPayload,
} from "@/lib/sala-editor/canvas/wall-interaction";
import type { WallSnapGuide } from "@/lib/sala-editor/canvas/wall-snap";
import { SalaCanvasSelectionToolbar } from "@/components/sala-editor/panels/sala-canvas-selection-toolbar";

export type SalaWallCanvasProps = {
  walls: SalaWallSegment[];
  draft: SalaWallDrawingDraft | null;
  selectedWallId: string | null;
  draggingWallId?: string | null;
  resizingWallId?: string | null;
  snapGuide?: WallSnapGuide | null;
  hint: string;
  onPointerDown: (payload: WallPointerPayload) => void;
  onPointerMove: (payload: WallPointerPayload) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onDuplicateWall?: (wallId: string) => void;
  onDeleteWall?: (wallId: string) => void;
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
  draggingWallId = null,
  resizingWallId = null,
  snapGuide = null,
  hint,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDuplicateWall,
  onDeleteWall,
  embedded = false,
}: SalaWallCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const selectedWall = walls.find((wall) => wall.id === selectedWallId) ?? null;
  const editingWallId = draggingWallId ?? resizingWallId;
  const selectedWallCenter = selectedWall ? getWallCenter(selectedWall) : null;

  const resolvePoint = useCallback((clientX: number, clientY: number) => {
    const el = surfaceRef.current;
    if (!el) return null;
    return clientToCanvasPoint(el, clientX, clientY);
  }, []);

  const createPayload = useCallback(
    (
      event: PointerEvent<HTMLElement>,
      target: WallInteractionTarget,
    ): WallPointerPayload | null => {
      const point = resolvePoint(event.clientX, event.clientY);
      if (!point) return null;
      return {
        point,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType,
        target,
      };
    },
    [resolvePoint],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const payload = createPayload(event, { type: "canvas" });
      if (!payload) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      onPointerDown(payload);
    },
    [createPayload, onPointerDown],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const payload = createPayload(event, { type: "canvas" });
      if (!payload) return;
      onPointerMove(payload);
    },
    [createPayload, onPointerMove],
  );

  const handleEndpointPointerDown = useCallback(
    (
      wall: SalaWallSegment,
      endpoint: "start" | "end",
      event: PointerEvent<HTMLButtonElement>,
    ) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const payload = createPayload(event, {
        type: "wall-endpoint",
        wallId: wall.id,
        endpoint,
      });
      if (!payload) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      onPointerDown(payload);
    },
    [createPayload, onPointerDown],
  );

  const handleEndpointPointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const payload = createPayload(event, { type: "canvas" });
      if (!payload) return;
      onPointerMove(payload);
    },
    [createPayload, onPointerMove],
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
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {!embedded ? <div className="hostly-sala-editor-dot-grid" aria-hidden /> : null}

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        {snapGuide ? (
          <g className="hostly-sala-wall-snap-guide">
            <line
              x1={snapGuide.from.x}
              y1={snapGuide.from.y}
              x2={snapGuide.to.x}
              y2={snapGuide.to.y}
            />
            {snapGuide.type === "endpoint" ? (
              <circle cx={snapGuide.to.x} cy={snapGuide.to.y} r={5} />
            ) : null}
          </g>
        ) : null}

        {walls.map((wall) => {
          const selected = wall.id === selectedWallId;
          const editing = wall.id === editingWallId;
          return (
            <g
              key={wall.id}
              className={[
                selected ? "hostly-sala-wall--selected" : "",
                editing ? "hostly-sala-wall--editing" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {selected ? (
                <>
                  <line
                    x1={wall.x1}
                    y1={wall.y1}
                    x2={wall.x2}
                    y2={wall.y2}
                    stroke="var(--hostly-accent, #315f7d)"
                    strokeWidth={SALA_WALL_STROKE_WIDTH + 10}
                    strokeLinecap="round"
                    opacity={0.18}
                  />
                  <circle
                    cx={wall.x1}
                    cy={wall.y1}
                    r={6}
                    fill="white"
                    stroke="var(--hostly-accent, #315f7d)"
                    strokeWidth={2}
                  />
                  <circle
                    cx={wall.x2}
                    cy={wall.y2}
                    r={6}
                    fill="white"
                    stroke="var(--hostly-accent, #315f7d)"
                    strokeWidth={2}
                  />
                </>
              ) : null}
              <line
                x1={wall.x1}
                y1={wall.y1}
                x2={wall.x2}
                y2={wall.y2}
                stroke={selected ? "var(--hostly-accent, #315f7d)" : SALA_WALL_STROKE_COLOR}
                strokeWidth={selected ? SALA_WALL_STROKE_WIDTH + 2 : SALA_WALL_STROKE_WIDTH}
                strokeLinecap="round"
              />
            </g>
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

      {selectedWall && selectedWallCenter ? (
        <div
          className={[
            "hostly-sala-wall-selection-anchor",
            editingWallId === selectedWall.id ? "is-editing" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            left: selectedWallCenter.x,
            top: selectedWallCenter.y,
          }}
        >
          <SalaCanvasSelectionToolbar
            onDuplicate={() => onDuplicateWall?.(selectedWall.id)}
            onDelete={() => onDeleteWall?.(selectedWall.id)}
          />
        </div>
      ) : null}

      {selectedWall ? (
        <>
          <button
            type="button"
            aria-label="Mover extremo inicial de pared"
            className="hostly-sala-wall-endpoint-handle hostly-sala-wall-endpoint-handle--start"
            style={{ left: selectedWall.x1, top: selectedWall.y1 }}
            onPointerDown={(event) =>
              handleEndpointPointerDown(selectedWall, "start", event)
            }
            onPointerMove={handleEndpointPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          />
          <button
            type="button"
            aria-label="Mover extremo final de pared"
            className="hostly-sala-wall-endpoint-handle hostly-sala-wall-endpoint-handle--end"
            style={{ left: selectedWall.x2, top: selectedWall.y2 }}
            onPointerDown={(event) =>
              handleEndpointPointerDown(selectedWall, "end", event)
            }
            onPointerMove={handleEndpointPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          />
        </>
      ) : null}

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
