"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SalaEspacioId } from "@/lib/sala-editor/types/espacio";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import { createSalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import { DEFAULT_SALA_ESPACIO_BASE_GRID_SIZE } from "@/lib/sala-editor/types/espacio-base";
import {
  findWallAtPoint,
  getWallCenter,
  isWallLengthValid,
  type SalaPoint,
} from "@/lib/sala-editor/geometry/wall-geometry";
import {
  snapTranslatedWall,
  snapWallEndpoint,
  snapWallPointToGrid,
} from "@/lib/sala-editor/canvas/wall-snap";
import type {
  WallInteractionTarget,
  WallEditMode,
  WallEditOutcome,
  WallInteractionSession,
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
  /** Tamaño de celda del mapa (Base). */
  gridSize?: number;
  onAddWall: (wall: SalaWallSegment) => void;
  onUpdateWall: (
    wallId: string,
    patch: Partial<Pick<SalaWallSegment, "x1" | "y1" | "x2" | "y2">>,
  ) => void;
  onEditSessionStart?: (mode: WallEditMode) => void;
  onEditSessionEnd?: (mode: WallEditMode, outcome: WallEditOutcome) => void;
};

export function useSalaWallDrawing({
  espacioId,
  walls,
  enabled,
  gridSize = DEFAULT_SALA_ESPACIO_BASE_GRID_SIZE,
  onAddWall,
  onUpdateWall,
  onEditSessionStart,
  onEditSessionEnd,
}: UseSalaWallDrawingOptions) {
  const [draft, setDraft] = useState<SalaWallDrawingDraft | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [editSession, setEditSession] = useState<WallInteractionSession | null>(null);

  const wallsInEspacio = useMemo(
    () => (espacioId ? walls.filter((w) => w.espacioId === espacioId) : []),
    [espacioId, walls],
  );

  const selectedWall = useMemo(
    () => wallsInEspacio.find((w) => w.id === selectedWallId) ?? null,
    [wallsInEspacio, selectedWallId],
  );

  const isDrawing = draft !== null;
  const isEditing = editSession !== null;

  const snapPoint = useCallback(
    (point: SalaPoint): SalaPoint => snapWallPointToGrid(point, gridSize),
    [gridSize],
  );

  const cancelDrawing = useCallback(() => {
    setDraft(null);
  }, []);

  const cancelEditSession = useCallback(() => {
    if (!editSession) return;
    onUpdateWall(editSession.objectId, {
      x1: editSession.originObject.x1,
      y1: editSession.originObject.y1,
      x2: editSession.originObject.x2,
      y2: editSession.originObject.y2,
    });
    onEditSessionEnd?.(editSession.mode, "cancel");
    setEditSession(null);
  }, [editSession, onEditSessionEnd, onUpdateWall]);

  const finishEditSession = useCallback(() => {
    if (!editSession) return;

    const currentWall =
      wallsInEspacio.find((wall) => wall.id === editSession.objectId) ?? null;
    if (!currentWall || !isWallLengthValid(currentWall)) {
      onUpdateWall(editSession.objectId, {
        x1: editSession.originObject.x1,
        y1: editSession.originObject.y1,
        x2: editSession.originObject.x2,
        y2: editSession.originObject.y2,
      });
      onEditSessionEnd?.(editSession.mode, "cancel");
      setEditSession(null);
      return;
    }

    onEditSessionEnd?.(editSession.mode, "complete");
    setEditSession(null);
  }, [editSession, onEditSessionEnd, onUpdateWall, wallsInEspacio]);

  const clearWallSelection = useCallback(() => {
    cancelEditSession();
    setSelectedWallId(null);
  }, [cancelEditSession]);

  const selectWall = useCallback((wallId: string | null) => {
    setSelectedWallId(wallId);
  }, []);

  const resolveTargetWall = useCallback(
    (point: SalaPoint, target: WallInteractionTarget): SalaWallSegment | null => {
      if (target.type === "wall-body") {
        return wallsInEspacio.find((item) => item.id === target.wallId) ?? null;
      }

      return findWallAtPoint(point, wallsInEspacio);
    },
    [wallsInEspacio],
  );

  const startEditSession = useCallback(
    (
      wall: SalaWallSegment,
      mode: WallEditMode,
      originPointer: SalaPoint,
      handle?: WallInteractionSession["handle"],
    ) => {
      setDraft(null);
      setSelectedWallId(wall.id);
      setEditSession({
        objectId: wall.id,
        mode,
        handle,
        originPointer,
        originObject: wall,
      });
      onEditSessionStart?.(mode);
    },
    [onEditSessionStart],
  );

  const handlePointerDown = useCallback(
    (payload: WallPointerPayload) => {
      if (!enabled || !espacioId) return;
      const point = snapPoint(payload.point);

      if (editSession) {
        return;
      }

      if (draft) {
        setDraft(null);
        if (
          !isWallLengthValid({
            x1: draft.x1,
            y1: draft.y1,
            x2: point.x,
            y2: point.y,
          })
        ) {
          return;
        }

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

      if (payload.target.type === "wall-move") {
        const target = payload.target;
        const wall =
          wallsInEspacio.find((item) => item.id === target.wallId) ??
          null;
        if (wall) {
          startEditSession(wall, "move", point);
          return;
        }
      }

      if (payload.target.type === "wall-endpoint") {
        const target = payload.target;
        const wall =
          wallsInEspacio.find((item) => item.id === target.wallId) ??
          null;
        if (wall) {
          startEditSession(wall, "resize", point, target.endpoint);
          return;
        }
      }

      const hitWall = resolveTargetWall(point, payload.target);
      if (hitWall) {
        setSelectedWallId(hitWall.id);
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
      draft,
      editSession,
      enabled,
      espacioId,
      onAddWall,
      resolveTargetWall,
      snapPoint,
      startEditSession,
      wallsInEspacio,
    ],
  );

  const handlePointerMove = useCallback(
    (payload: WallPointerPayload) => {
      if (editSession) {
        const point = snapPoint(payload.point);

        if (editSession.mode === "move") {
          const originCenter = snapPoint(getWallCenter(editSession.originObject));
          const rawDelta = {
            x: point.x - originCenter.x,
            y: point.y - originCenter.y,
          };
          const result = snapTranslatedWall(
            editSession.originObject,
            rawDelta,
            wallsInEspacio,
          );
          onUpdateWall(editSession.objectId, {
            x1: result.wall.x1,
            y1: result.wall.y1,
            x2: result.wall.x2,
            y2: result.wall.y2,
          });
          return;
        }

        if (editSession.mode === "resize" && editSession.handle) {
          const result = snapWallEndpoint(
            editSession.originObject,
            editSession.handle,
            point,
            wallsInEspacio,
          );
          onUpdateWall(editSession.objectId, {
            x1: result.wall.x1,
            y1: result.wall.y1,
            x2: result.wall.x2,
            y2: result.wall.y2,
          });
        }
        return;
      }

      if (!draft) return;
      const point = snapPoint(payload.point);
      setDraft((prev) =>
        prev
          ? { ...prev, previewX: point.x, previewY: point.y }
          : null,
      );
    },
    [draft, editSession, onUpdateWall, snapPoint, wallsInEspacio],
  );

  const handlePointerUp = useCallback(() => {
    finishEditSession();
  }, [finishEditSession]);

  const handlePointerCancel = useCallback(() => {
    cancelEditSession();
  }, [cancelEditSession]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!draft && !selectedWallId && !editSession) return;
      event.preventDefault();
      if (editSession) {
        cancelEditSession();
        return;
      }
      if (draft) {
        cancelDrawing();
        return;
      }
      clearWallSelection();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cancelDrawing,
    cancelEditSession,
    clearWallSelection,
    draft,
    editSession,
    enabled,
    selectedWallId,
  ]);

  useEffect(() => {
    return () => {
      setDraft(null);
      setSelectedWallId(null);
      setEditSession(null);
    };
  }, [espacioId]);

  useEffect(() => {
    if (!enabled) return;
    return () => {
      setDraft(null);
      setEditSession(null);
    };
  }, [enabled]);

  const visibleSelectedWallId =
    selectedWallId && wallsInEspacio.some((wall) => wall.id === selectedWallId)
      ? selectedWallId
      : null;

  return {
    wallsInEspacio,
    draft,
    isDrawing,
    isEditing,
    selectedWallId: visibleSelectedWallId,
    selectedWall,
    cancelDrawing,
    clearWallSelection,
    selectWall,
    cancelEditSession,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
