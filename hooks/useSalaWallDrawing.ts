"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SalaEspacioId } from "@/lib/sala-editor/types/espacio";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import { createSalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import {
  findWallAtPoint,
  hitTestWallEndpoint,
  isWallLengthValid,
  SALA_WALL_MIN_LENGTH,
  wallSegmentLength,
  type SalaPoint,
  type SalaWallEndpoint,
} from "@/lib/sala-editor/geometry/wall-geometry";
import {
  hasExceededDragSlop,
} from "@/lib/sala-editor/canvas/pointer-interaction";
import {
  snapTranslatedWall,
  snapWallEndpoint,
  type WallSnapGuide,
} from "@/lib/sala-editor/canvas/wall-snap";
import type {
  WallEditMode,
  WallEditOutcome,
  WallInteractionTarget,
  WallPointerPayload,
} from "@/lib/sala-editor/canvas/wall-interaction";

export type SalaWallDrawingDraft = {
  x1: number;
  y1: number;
  previewX: number;
  previewY: number;
};

export type UseSalaWallDrawingOptions = {
  espacioId: SalaEspacioId | null;
  walls: SalaWallSegment[];
  enabled: boolean;
  onAddWall: (wall: SalaWallSegment) => void;
  onUpdateWall: (
    wallId: string,
    patch: Partial<Pick<SalaWallSegment, "x1" | "y1" | "x2" | "y2">>,
  ) => void;
  onEditSessionStart?: (mode: WallEditMode) => void;
  onEditSessionEnd?: (mode: WallEditMode, outcome: WallEditOutcome) => void;
};

type WallEditSession = {
  wallId: string;
  mode: WallEditMode;
  endpoint: SalaWallEndpoint | null;
  startPoint: SalaPoint;
  startClientX: number;
  startClientY: number;
  pointerType: string;
  baselineWall: SalaWallSegment;
  active: boolean;
};

export function useSalaWallDrawing({
  espacioId,
  walls,
  enabled,
  onAddWall,
  onUpdateWall,
  onEditSessionStart,
  onEditSessionEnd,
}: UseSalaWallDrawingOptions) {
  const [draft, setDraft] = useState<SalaWallDrawingDraft | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [activeEdit, setActiveEdit] =
    useState<{ wallId: string; mode: WallEditMode } | null>(null);
  const [snapGuide, setSnapGuide] = useState<WallSnapGuide | null>(null);
  const editSessionRef = useRef<WallEditSession | null>(null);

  const wallsInEspacio = useMemo(
    () => (espacioId ? walls.filter((w) => w.espacioId === espacioId) : []),
    [espacioId, walls],
  );

  const selectedWall = useMemo(
    () => wallsInEspacio.find((w) => w.id === selectedWallId) ?? null,
    [wallsInEspacio, selectedWallId],
  );

  const isDrawing = draft !== null;
  const draggingWallId = activeEdit?.mode === "move" ? activeEdit.wallId : null;
  const resizingWallId = activeEdit?.mode === "resize" ? activeEdit.wallId : null;

  const finishEditSession = useCallback(
    (outcome: WallEditOutcome) => {
      const session = editSessionRef.current;
      if (!session) return;

      if (session.active && outcome === "cancel") {
        onUpdateWall(session.wallId, {
          x1: session.baselineWall.x1,
          y1: session.baselineWall.y1,
          x2: session.baselineWall.x2,
          y2: session.baselineWall.y2,
        });
      }

      editSessionRef.current = null;
      setActiveEdit(null);
      setSnapGuide(null);

      if (session.active) {
        onEditSessionEnd?.(session.mode, outcome);
      }
    },
    [onEditSessionEnd, onUpdateWall],
  );

  const cancelDrawing = useCallback(() => {
    setDraft(null);
  }, []);

  const cancelEditing = useCallback(() => {
    finishEditSession("cancel");
  }, [finishEditSession]);

  const clearWallSelection = useCallback(() => {
    setSelectedWallId(null);
  }, []);

  const selectWall = useCallback((wallId: string | null) => {
    setSelectedWallId(wallId);
  }, []);

  const beginEditSession = useCallback(
    (
      wall: SalaWallSegment,
      mode: WallEditMode,
      payload: WallPointerPayload,
      endpoint: SalaWallEndpoint | null,
    ) => {
      editSessionRef.current = {
        wallId: wall.id,
        mode,
        endpoint,
        startPoint: payload.point,
        startClientX: payload.clientX,
        startClientY: payload.clientY,
        pointerType: payload.pointerType,
        baselineWall: wall,
        active: false,
      };
    },
    [],
  );

  const resolveTargetWall = useCallback(
    (point: SalaPoint, target: WallInteractionTarget): {
      wall: SalaWallSegment | null;
      endpoint: SalaWallEndpoint | null;
    } => {
      if (target.type === "wall-endpoint") {
        const wall = wallsInEspacio.find((item) => item.id === target.wallId) ?? null;
        return { wall, endpoint: target.endpoint };
      }

      if (target.type === "wall-body") {
        const wall = wallsInEspacio.find((item) => item.id === target.wallId) ?? null;
        return { wall, endpoint: null };
      }

      const hit = findWallAtPoint(point, wallsInEspacio);
      if (!hit) return { wall: null, endpoint: null };

      return {
        wall: hit,
        endpoint: hitTestWallEndpoint(point, hit),
      };
    },
    [wallsInEspacio],
  );

  const handlePointerDown = useCallback(
    (payload: WallPointerPayload) => {
      if (!enabled || !espacioId) return;
      const { point } = payload;

      if (draft) {
        const length = wallSegmentLength({
          x1: draft.x1,
          y1: draft.y1,
          x2: point.x,
          y2: point.y,
        });
        setDraft(null);
        if (length < SALA_WALL_MIN_LENGTH) return;

        const wall = createSalaWallSegment({
          espacioId,
          x1: draft.x1,
          y1: draft.y1,
          x2: point.x,
          y2: point.y,
        });
        onAddWall(wall);
        setSelectedWallId(wall.id);
        return;
      }

      const { wall, endpoint } = resolveTargetWall(point, payload.target);
      if (wall) {
        setSelectedWallId(wall.id);
        setDraft(null);
        beginEditSession(
          wall,
          endpoint ? "resize" : "move",
          payload,
          endpoint,
        );
        return;
      }

      setSelectedWallId(null);
      setDraft({
        x1: point.x,
        y1: point.y,
        previewX: point.x,
        previewY: point.y,
      });
    },
    [
      beginEditSession,
      draft,
      enabled,
      espacioId,
      onAddWall,
      resolveTargetWall,
    ],
  );

  const handlePointerMove = useCallback(
    (payload: WallPointerPayload) => {
      const session = editSessionRef.current;
      if (session) {
        if (!session.active) {
          if (
            !hasExceededDragSlop(
              session.startClientX,
              session.startClientY,
              payload.clientX,
              payload.clientY,
              session.pointerType,
            )
          ) {
            return;
          }

          session.active = true;
          setActiveEdit({ wallId: session.wallId, mode: session.mode });
          onEditSessionStart?.(session.mode);
        }

        const result =
          session.mode === "move"
            ? snapTranslatedWall(
                session.baselineWall,
                {
                  x: payload.point.x - session.startPoint.x,
                  y: payload.point.y - session.startPoint.y,
                },
                wallsInEspacio,
              )
            : snapWallEndpoint(
                session.baselineWall,
                session.endpoint ?? "end",
                payload.point,
                wallsInEspacio,
              );

        if (!isWallLengthValid(result.wall)) return;

        setSnapGuide(result.guide);
        onUpdateWall(session.wallId, {
          x1: result.wall.x1,
          y1: result.wall.y1,
          x2: result.wall.x2,
          y2: result.wall.y2,
        });
        return;
      }

      if (!draft) return;
      setDraft((prev) =>
        prev
          ? { ...prev, previewX: payload.point.x, previewY: payload.point.y }
          : null,
      );
    },
    [draft, onEditSessionStart, onUpdateWall, wallsInEspacio],
  );

  const handlePointerUp = useCallback(
    () => {
      finishEditSession("complete");
    },
    [finishEditSession],
  );

  const handlePointerCancel = useCallback(
    () => {
      finishEditSession("cancel");
    },
    [finishEditSession],
  );

  useEffect(() => {
    if (!enabled) {
      setDraft(null);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!draft && !editSessionRef.current) return;
      event.preventDefault();
      cancelEditing();
      cancelDrawing();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelDrawing, cancelEditing, draft, enabled]);

  useEffect(() => {
    setDraft(null);
    setSelectedWallId(null);
    finishEditSession("cancel");
  }, [espacioId, finishEditSession]);

  useEffect(() => {
    if (!enabled) {
      setDraft(null);
      finishEditSession("cancel");
    }
  }, [enabled, finishEditSession]);

  useEffect(() => {
    if (!selectedWallId) return;
    if (wallsInEspacio.some((wall) => wall.id === selectedWallId)) return;
    setSelectedWallId(null);
  }, [selectedWallId, wallsInEspacio]);

  return {
    wallsInEspacio,
    draft,
    isDrawing,
    draggingWallId,
    resizingWallId,
    snapGuide,
    selectedWallId,
    selectedWall,
    cancelDrawing,
    cancelEditing,
    clearWallSelection,
    selectWall,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
