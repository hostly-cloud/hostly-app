"use client";

import { useCallback, useMemo, useRef, type PointerEvent } from "react";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { SalaWallDrawingDraft } from "@/hooks/useSalaWallDrawing";
import {
  getWallEndpoint,
  getWallCenter,
  isWallLengthValid,
  SALA_WALL_STROKE_COLOR,
  SALA_WALL_STROKE_WIDTH,
} from "@/lib/sala-editor/geometry/wall-geometry";
import { buildWallCanvasVisualModel } from "@/lib/sala-editor/canvas/wall-junction-render";
import { clientToStagePoint } from "@/lib/sala-editor/canvas/canvas-viewport";
import {
  scaleEditorWallSegment,
  unscaleEditorPoint,
} from "@/lib/sala-editor/canvas/editor-visual-scale";
import { useCanvasViewport } from "@/components/sala-editor/canvas/canvas-viewport-context";
import type {
  WallInteractionTarget,
  WallPointerPayload,
} from "@/lib/sala-editor/canvas/wall-interaction";

const WALL_ACCENT_COLOR = "var(--hostly-accent, #315f7d)";

export type SalaWallCanvasProps = {
  walls: SalaWallSegment[];
  draft: SalaWallDrawingDraft | null;
  selectedWallId: string | null;
  hint: string;
  onPointerDown: (payload: WallPointerPayload) => void;
  onPointerMove: (payload: WallPointerPayload) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onDeleteWall?: (wallId: string) => void;
  /** Dentro del frame de espacio — sin chrome propio. */
  embedded?: boolean;
};

function renderWallStroke(
  segment: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    capStart: "round" | "butt";
    capEnd: "round" | "butt";
  },
  stroke: string,
  strokeWidth: number,
  extraProps?: {
    opacity?: number;
    strokeDasharray?: string;
  },
) {
  const halfWidth = strokeWidth / 2;

  return (
    <>
      <line
        x1={segment.x1}
        y1={segment.y1}
        x2={segment.x2}
        y2={segment.y2}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
        opacity={extraProps?.opacity}
        strokeDasharray={extraProps?.strokeDasharray}
      />
      {segment.capStart === "round" ? (
        <circle
          cx={segment.x1}
          cy={segment.y1}
          r={halfWidth}
          fill={stroke}
          opacity={extraProps?.opacity}
        />
      ) : null}
      {segment.capEnd === "round" ? (
        <circle
          cx={segment.x2}
          cy={segment.y2}
          r={halfWidth}
          fill={stroke}
          opacity={extraProps?.opacity}
        />
      ) : null}
    </>
  );
}

export function SalaWallCanvas({
  walls,
  draft,
  selectedWallId,
  hint,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDeleteWall,
  embedded = false,
}: SalaWallCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const selectedWall = walls.find((wall) => wall.id === selectedWallId) ?? null;
  const scaledWalls = useMemo(
    () => walls.map((wall) => scaleEditorWallSegment(wall, coordinateScale)),
    [coordinateScale, walls],
  );
  const scaledDraft = useMemo(() => {
    if (!draft) return null;
    return {
      ...draft,
      x1: draft.x1 * coordinateScale,
      y1: draft.y1 * coordinateScale,
      previewX: draft.previewX * coordinateScale,
      previewY: draft.previewY * coordinateScale,
    };
  }, [coordinateScale, draft]);
  const selectedScaledWall =
    scaledWalls.find((wall) => wall.id === selectedWallId) ?? null;
  const selectedWallCenter = selectedScaledWall
    ? getWallCenter(selectedScaledWall)
    : null;
  const selectedWallStart = selectedScaledWall
    ? getWallEndpoint(selectedScaledWall, "start")
    : null;
  const selectedWallEnd = selectedScaledWall
    ? getWallEndpoint(selectedScaledWall, "end")
    : null;
  const draftValid =
    draft != null &&
    isWallLengthValid({
      x1: draft.x1,
      y1: draft.y1,
      x2: draft.previewX,
      y2: draft.previewY,
    });

  const visualModel = useMemo(
    () =>
      buildWallCanvasVisualModel({
        walls: scaledWalls,
        draft: scaledDraft,
        strokeWidth: SALA_WALL_STROKE_WIDTH,
        junctionFill: SALA_WALL_STROKE_COLOR,
      }),
    [scaledDraft, scaledWalls],
  );

  const resolvePoint = useCallback(
    (clientX: number, clientY: number) => {
      const fromViewport = canvasViewport?.resolveStagePoint(clientX, clientY);
      if (fromViewport) return fromViewport;

      const el = surfaceRef.current;
      if (!el) return null;
      return clientToStagePoint(el, clientX, clientY);
    },
    [canvasViewport],
  );

  const createPayload = useCallback(
    (
      event: PointerEvent<HTMLElement>,
      target: WallInteractionTarget,
    ): WallPointerPayload | null => {
      const displayPoint = resolvePoint(event.clientX, event.clientY);
      if (!displayPoint) return null;
      const point = unscaleEditorPoint(displayPoint, coordinateScale);
      return {
        point,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType,
        target,
      };
    },
    [coordinateScale, resolvePoint],
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

  const createTargetPointerHandlers = useCallback(
    (target: WallInteractionTarget) => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const payload = createPayload(event, target);
        if (!payload) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onPointerDown(payload);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const payload = createPayload(event, target);
        if (!payload) return;
        onPointerMove(payload);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onPointerUp();
      },
      onPointerCancel: (event: PointerEvent<HTMLElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onPointerCancel();
      },
    }),
    [createPayload, onPointerCancel, onPointerDown, onPointerMove, onPointerUp],
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
        <g className="hostly-sala-wall-junctions">
          {visualModel.junctions.map((junction) =>
            junction.kind === "circle" ? (
              <circle
                key={junction.key}
                cx={junction.cx}
                cy={junction.cy}
                r={junction.r}
                fill={junction.fill}
              />
            ) : (
              <path key={junction.key} d={junction.d} fill={junction.fill} />
            ),
          )}
        </g>

        {visualModel.segments.map((segment) => {
          const selected = segment.id === selectedWallId;
          return (
            <g
              key={segment.id}
              className={selected ? "hostly-sala-wall--selected" : undefined}
            >
              {selected
                ? renderWallStroke(
                    segment,
                    WALL_ACCENT_COLOR,
                    SALA_WALL_STROKE_WIDTH + 12,
                    { opacity: 0.2 },
                  )
                : null}
              {renderWallStroke(
                segment,
                selected ? WALL_ACCENT_COLOR : SALA_WALL_STROKE_COLOR,
                SALA_WALL_STROKE_WIDTH,
              )}
            </g>
          );
        })}

        {visualModel.draftSegment ? (
          <g className="hostly-sala-wall-draft">
            {renderWallStroke(
              visualModel.draftSegment,
              WALL_ACCENT_COLOR,
              SALA_WALL_STROKE_WIDTH,
              {
                opacity: draftValid ? 0.92 : 0.55,
                strokeDasharray: draftValid ? undefined : "6 6",
              },
            )}
          </g>
        ) : null}
      </svg>

      {selectedWall && selectedWallCenter && !draft && onDeleteWall ? (
        <div
          className="hostly-sala-wall-selection-action"
          style={{
            left: selectedWallCenter.x,
            top: selectedWallCenter.y,
          }}
        >
          <button
            type="button"
            className="hostly-sala-wall-delete-btn"
            aria-label="Eliminar pared"
            title="Eliminar"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDeleteWall(selectedWall.id);
            }}
          >
            <span aria-hidden>🗑</span>
          </button>
        </div>
      ) : null}

      {selectedWall && selectedWallCenter && !draft ? (
        <button
          type="button"
          className="hostly-sala-wall-interaction-handle hostly-sala-wall-interaction-handle--move"
          aria-label="Mover pared"
          title="Mover pared"
          style={{
            left: selectedWallCenter.x,
            top: selectedWallCenter.y,
          }}
          {...createTargetPointerHandlers({
            type: "wall-move",
            wallId: selectedWall.id,
          })}
        />
      ) : null}

      {selectedWall && selectedWallStart && !draft ? (
        <button
          type="button"
          className="hostly-sala-wall-interaction-handle hostly-sala-wall-interaction-handle--endpoint"
          aria-label="Editar inicio de pared"
          title="Editar inicio"
          style={{
            left: selectedWallStart.x,
            top: selectedWallStart.y,
          }}
          {...createTargetPointerHandlers({
            type: "wall-endpoint",
            wallId: selectedWall.id,
            endpoint: "start",
          })}
        />
      ) : null}

      {selectedWall && selectedWallEnd && !draft ? (
        <button
          type="button"
          className="hostly-sala-wall-interaction-handle hostly-sala-wall-interaction-handle--endpoint"
          aria-label="Editar final de pared"
          title="Editar final"
          style={{
            left: selectedWallEnd.x,
            top: selectedWallEnd.y,
          }}
          {...createTargetPointerHandlers({
            type: "wall-endpoint",
            wallId: selectedWall.id,
            endpoint: "end",
          })}
        />
      ) : null}

      {!draft ? (
        <div className="hostly-sala-editor-canvas-hint">{hint}</div>
      ) : (
        <div className="hostly-sala-editor-canvas-hint hostly-sala-editor-canvas-hint--floating">
          Segundo clic para fijar · Esc cancelar
        </div>
      )}
    </div>
  );
}
