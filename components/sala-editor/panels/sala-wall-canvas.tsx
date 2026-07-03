"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type {
  SalaWallAttachment,
  SalaWallAttachmentKind,
} from "@/lib/sala-editor/types/wall-attachment";
import type { SalaWallDrawingDraft } from "@/hooks/useSalaWallDrawing";
import {
  getWallEndpoint,
  getWallCenter,
  hitTestWallSegment,
  isWallLengthValid,
  SALA_WALL_STROKE_COLOR,
  SALA_WALL_STROKE_WIDTH,
} from "@/lib/sala-editor/geometry/wall-geometry";
import {
  projectPointToWallAttachmentPosition,
  resolveWallAttachment,
} from "@/lib/sala-editor/geometry/wall-attachment-geometry";
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
import type {
  WallAttachmentEditOutcome,
  WallAttachmentInteractionSession,
} from "@/lib/sala-editor/canvas/wall-attachment-interaction";
import {
  getWallAttachmentLogicalLength,
  resolveConstrainedWallAttachmentPosition,
} from "@/lib/sala-editor/canvas/wall-attachment-constraints";

const WALL_ACCENT_COLOR = "var(--hostly-accent, #315f7d)";
const WALL_BLOCKED_COLOR = "#dc2626";
const WALL_ATTACHMENT_HIT_THRESHOLD = 18;
const SUPPORTED_RENDERED_WALL_ATTACHMENT_KINDS: readonly SalaWallAttachmentKind[] = [
  "door",
  "glass",
];

function isRenderedWallAttachmentKind(kind: SalaWallAttachmentKind): boolean {
  return SUPPORTED_RENDERED_WALL_ATTACHMENT_KINDS.includes(kind);
}

function getWallAttachmentLabel(kind: SalaWallAttachmentKind): string {
  if (kind === "glass") return "Cristal fijo";
  return "Puerta simple";
}

export type SalaWallCanvasProps = {
  walls: SalaWallSegment[];
  wallAttachments?: SalaWallAttachment[];
  draft: SalaWallDrawingDraft | null;
  selectedWallId: string | null;
  selectedWallAttachmentId?: string | null;
  attachmentPlacementKind?: SalaWallAttachmentKind | null;
  hint: string;
  onPointerDown?: (payload: WallPointerPayload) => void;
  onPointerMove?: (payload: WallPointerPayload) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
  onDeleteWall?: (wallId: string) => void;
  onPlaceWallAttachment?: (
    wallId: string,
    positionRatio: number,
    kind: SalaWallAttachmentKind,
  ) => void;
  onSelectWallAttachment?: (attachmentId: string) => void;
  onClearWallAttachmentSelection?: () => void;
  onUpdateWallAttachment?: (
    attachmentId: string,
    patch: Partial<Pick<SalaWallAttachment, "positionRatio" | "offset">>,
  ) => void;
  onDeleteWallAttachment?: (attachmentId: string) => void;
  onWallAttachmentMoveStart?: () => void;
  onWallAttachmentMoveEnd?: (outcome: WallAttachmentEditOutcome) => void;
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
  wallAttachments = [],
  draft,
  selectedWallId,
  selectedWallAttachmentId = null,
  attachmentPlacementKind = null,
  hint,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDeleteWall,
  onPlaceWallAttachment,
  onSelectWallAttachment,
  onClearWallAttachmentSelection,
  onUpdateWallAttachment,
  onDeleteWallAttachment,
  onWallAttachmentMoveStart,
  onWallAttachmentMoveEnd,
  embedded = false,
}: SalaWallCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [hoveredAttachmentWallId, setHoveredAttachmentWallId] = useState<string | null>(
    null,
  );
  const [blockedAttachmentWallId, setBlockedAttachmentWallId] = useState<string | null>(
    null,
  );
  const [attachmentEditSession, setAttachmentEditSession] =
    useState<WallAttachmentInteractionSession | null>(null);
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const attachmentPlacementEnabled =
    attachmentPlacementKind != null && onPlaceWallAttachment != null;
  const selectedWall = walls.find((wall) => wall.id === selectedWallId) ?? null;
  const scaledWalls = useMemo(
    () => walls.map((wall) => scaleEditorWallSegment(wall, coordinateScale)),
    [coordinateScale, walls],
  );
  const scaledWallById = useMemo(
    () => new Map(scaledWalls.map((wall) => [wall.id, wall])),
    [scaledWalls],
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

  const renderedWallAttachments = useMemo(
    () =>
      wallAttachments
        .map((attachment) => {
          const wall = scaledWallById.get(attachment.wallId);
          if (!wall || !isRenderedWallAttachmentKind(attachment.kind)) return null;
          return {
            attachment,
            resolved: resolveWallAttachment(wall, attachment),
          };
        })
        .filter(
          (
            item,
          ): item is {
            attachment: SalaWallAttachment;
            resolved: ReturnType<typeof resolveWallAttachment>;
          } => item != null,
        ),
    [scaledWallById, wallAttachments],
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

  const cancelAttachmentEditSession = useCallback(() => {
    setAttachmentEditSession((session) => {
      if (!session) return null;
      if (session.active) {
        onUpdateWallAttachment?.(session.objectId, {
          positionRatio: session.originObject.positionRatio,
          offset: session.originObject.offset,
        });
        onWallAttachmentMoveEnd?.("cancel");
      }
      return null;
    });
  }, [onUpdateWallAttachment, onWallAttachmentMoveEnd]);

  const finishAttachmentEditSession = useCallback(() => {
    setAttachmentEditSession((session) => {
      if (!session) return null;
      if (session.active) {
        onWallAttachmentMoveEnd?.("complete");
      }
      return null;
    });
  }, [onWallAttachmentMoveEnd]);

  const findAttachmentTargetWall = useCallback(
    (point: { x: number; y: number }) => {
      for (let i = walls.length - 1; i >= 0; i -= 1) {
        const wall = walls[i]!;
        if (hitTestWallSegment(point, wall, WALL_ATTACHMENT_HIT_THRESHOLD)) {
          return wall;
        }
      }
      return null;
    },
    [walls],
  );

  const resolveConstrainedAttachmentPosition = useCallback(
    (
      wall: SalaWallSegment,
      kind: SalaWallAttachmentKind,
      desiredPositionRatio: number,
      movingAttachmentId?: string | null,
    ) =>
      resolveConstrainedWallAttachmentPosition({
        wallId: wall.id,
        wall,
        attachments: wallAttachments,
        kind,
        desiredPositionRatio,
        movingAttachmentId,
      }),
    [wallAttachments],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const payload = createPayload(event, { type: "canvas" });
      if (!payload) return;

      if (attachmentPlacementEnabled) {
        const wall = findAttachmentTargetWall(payload.point);
        if (!wall) {
          onClearWallAttachmentSelection?.();
          setBlockedAttachmentWallId(null);
          return;
        }
        const constrained = resolveConstrainedAttachmentPosition(
          wall,
          attachmentPlacementKind,
          projectPointToWallAttachmentPosition(wall, payload.point),
        );
        if (!constrained) {
          setHoveredAttachmentWallId(wall.id);
          setBlockedAttachmentWallId(wall.id);
          return;
        }
        onPlaceWallAttachment?.(
          wall.id,
          constrained.positionRatio,
          attachmentPlacementKind,
        );
        setHoveredAttachmentWallId(wall.id);
        setBlockedAttachmentWallId(null);
        return;
      }

      if (!onPointerDown) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      onPointerDown(payload);
    },
    [
      attachmentPlacementEnabled,
      createPayload,
      findAttachmentTargetWall,
      onClearWallAttachmentSelection,
      onPlaceWallAttachment,
      onPointerDown,
    ],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const payload = createPayload(event, { type: "canvas" });
      if (!payload) return;
      if (attachmentPlacementEnabled) {
        const wall = findAttachmentTargetWall(payload.point);
        setHoveredAttachmentWallId(wall?.id ?? null);
        if (!wall) {
          setBlockedAttachmentWallId(null);
          return;
        }
        const constrained = resolveConstrainedAttachmentPosition(
          wall,
          attachmentPlacementKind,
          projectPointToWallAttachmentPosition(wall, payload.point),
        );
        setBlockedAttachmentWallId(constrained ? null : wall.id);
        return;
      }
      onPointerMove?.(payload);
    },
    [
      attachmentPlacementEnabled,
      createPayload,
      findAttachmentTargetWall,
      onPointerMove,
    ],
  );

  const createTargetPointerHandlers = useCallback(
    (target: WallInteractionTarget) => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return;
        if (!onPointerDown) return;
        event.stopPropagation();
        const payload = createPayload(event, target);
        if (!payload) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onPointerDown(payload);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!onPointerMove) return;
        const payload = createPayload(event, target);
        if (!payload) return;
        onPointerMove(payload);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onPointerUp?.();
      },
      onPointerCancel: (event: PointerEvent<HTMLElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onPointerCancel?.();
      },
    }),
    [createPayload, onPointerCancel, onPointerDown, onPointerMove, onPointerUp],
  );

  const createAttachmentPointerHandlers = useCallback(
    (attachment: SalaWallAttachment) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelectWallAttachment?.(attachment.id);

        const displayPoint = resolvePoint(event.clientX, event.clientY);
        if (!displayPoint) return;
        const point = unscaleEditorPoint(displayPoint, coordinateScale);

        setAttachmentEditSession({
          objectId: attachment.id,
          wallId: attachment.wallId,
          mode: "move",
          originPointer: point,
          originObject: attachment,
          active: false,
        });
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const session = attachmentEditSession;
        if (!session || session.objectId !== attachment.id) return;
        event.stopPropagation();

        const wall = walls.find((item) => item.id === session.wallId);
        const displayPoint = resolvePoint(event.clientX, event.clientY);
        if (!wall || !displayPoint) return;

        const point = unscaleEditorPoint(displayPoint, coordinateScale);
        const constrained = resolveConstrainedAttachmentPosition(
          wall,
          attachment.kind,
          projectPointToWallAttachmentPosition(wall, point),
          attachment.id,
        );
        if (!constrained) return;
        if (!session.active) {
          setAttachmentEditSession((current) =>
            current?.objectId === session.objectId
              ? { ...current, active: true }
              : current,
          );
          onWallAttachmentMoveStart?.();
        }
        onUpdateWallAttachment?.(attachment.id, {
          positionRatio: constrained.positionRatio,
        });
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finishAttachmentEditSession();
      },
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        cancelAttachmentEditSession();
      },
    }),
    [
      attachmentEditSession,
      cancelAttachmentEditSession,
      coordinateScale,
      finishAttachmentEditSession,
      onSelectWallAttachment,
      onUpdateWallAttachment,
      onWallAttachmentMoveStart,
      resolveConstrainedAttachmentPosition,
      resolvePoint,
      walls,
    ],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (attachmentEditSession) {
        event.preventDefault();
        cancelAttachmentEditSession();
        return;
      }
      if (selectedWallAttachmentId) {
        event.preventDefault();
        onClearWallAttachmentSelection?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    attachmentEditSession,
    cancelAttachmentEditSession,
    onClearWallAttachmentSelection,
    selectedWallAttachmentId,
  ]);

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
      onPointerLeave={() => {
        if (attachmentPlacementEnabled) {
          setHoveredAttachmentWallId(null);
          setBlockedAttachmentWallId(null);
        }
      }}
      onPointerUp={() => onPointerUp?.()}
      onPointerCancel={() => {
        setHoveredAttachmentWallId(null);
        setBlockedAttachmentWallId(null);
        onPointerCancel?.();
      }}
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
          const attachmentHover = segment.id === hoveredAttachmentWallId;
          const attachmentBlocked = segment.id === blockedAttachmentWallId;
          return (
            <g
              key={segment.id}
              className={selected ? "hostly-sala-wall--selected" : undefined}
            >
              {selected || attachmentHover
                ? renderWallStroke(
                    segment,
                    attachmentBlocked ? WALL_BLOCKED_COLOR : WALL_ACCENT_COLOR,
                    SALA_WALL_STROKE_WIDTH + (attachmentHover ? 16 : 12),
                    { opacity: attachmentBlocked ? 0.28 : attachmentHover ? 0.24 : 0.2 },
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

      {renderedWallAttachments.map(({ attachment, resolved }) => {
        const selected = attachment.id === selectedWallAttachmentId;
        const editing = attachmentEditSession?.objectId === attachment.id;
        const attachmentHandlers = createAttachmentPointerHandlers(attachment);
        const label = getWallAttachmentLabel(attachment.kind);
        const attachmentLength = Math.max(
          24,
          getWallAttachmentLogicalLength(attachment.kind) * coordinateScale,
        );
        return (
          <div key={attachment.id}>
            <button
              type="button"
              className={[
                "hostly-sala-wall-attachment",
                `hostly-sala-wall-attachment--${attachment.kind}`,
                selected ? "is-selected" : "",
                editing ? "is-dragging" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={selected}
              aria-label={label}
              title={label}
              style={{
                left: resolved.point.x,
                top: resolved.point.y,
                width: attachmentLength + 20,
                transform: `translate(-50%, -50%) rotate(${resolved.angleRad}rad)`,
              }}
              {...attachmentHandlers}
              onClick={(event) => {
                event.stopPropagation();
                onSelectWallAttachment?.(attachment.id);
              }}
            >
              <span
                className="hostly-sala-wall-attachment__panel"
                style={{ width: attachmentLength }}
                aria-hidden
              />
              {attachment.kind === "door" ? (
                <span className="hostly-sala-wall-attachment__door-swing" aria-hidden />
              ) : null}
            </button>
            {selected && !editing && onDeleteWallAttachment ? (
              <button
                type="button"
                className="hostly-sala-wall-attachment__delete-btn"
                aria-label={`Eliminar ${label.toLowerCase()}`}
                title="Eliminar"
                style={{
                  left: resolved.point.x,
                  top: resolved.point.y,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteWallAttachment(attachment.id);
                }}
              >
                <span aria-hidden>🗑</span>
              </button>
            ) : null}
          </div>
        );
      })}

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
        <div className="hostly-sala-editor-canvas-hint">
          {blockedAttachmentWallId ? "No cabe en este hueco" : hint}
        </div>
      ) : (
        <div className="hostly-sala-editor-canvas-hint hostly-sala-editor-canvas-hint--floating">
          Segundo clic para fijar · Esc cancelar
        </div>
      )}
    </div>
  );
}
