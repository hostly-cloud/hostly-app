"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SalaEspacioId } from "@/lib/sala-editor/types/espacio";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import { createSalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import { DEFAULT_SALA_ESPACIO_BASE_GRID_SIZE } from "@/lib/sala-editor/types/espacio-base";
import {
  findWallAtPoint,
  isWallLengthValid,
  SALA_WALL_MIN_LENGTH,
  wallSegmentLength,
  type SalaPoint,
} from "@/lib/sala-editor/geometry/wall-geometry";
import { snapWallPointToGrid } from "@/lib/sala-editor/canvas/wall-snap";
import type {
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
  /** Tamaño de celda del mapa (Base). */
  gridSize?: number;
  onAddWall: (wall: SalaWallSegment) => void;
};

export function useSalaWallDrawing({
  espacioId,
  walls,
  enabled,
  gridSize = DEFAULT_SALA_ESPACIO_BASE_GRID_SIZE,
  onAddWall,
}: UseSalaWallDrawingOptions) {
  const [draft, setDraft] = useState<SalaWallDrawingDraft | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);

  const wallsInEspacio = useMemo(
    () => (espacioId ? walls.filter((w) => w.espacioId === espacioId) : []),
    [espacioId, walls],
  );

  const selectedWall = useMemo(
    () => wallsInEspacio.find((w) => w.id === selectedWallId) ?? null,
    [wallsInEspacio, selectedWallId],
  );

  const isDrawing = draft !== null;

  const snapPoint = useCallback(
    (point: SalaPoint): SalaPoint => snapWallPointToGrid(point, gridSize),
    [gridSize],
  );

  const cancelDrawing = useCallback(() => {
    setDraft(null);
  }, []);

  const clearWallSelection = useCallback(() => {
    setSelectedWallId(null);
  }, []);

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

  const handlePointerDown = useCallback(
    (payload: WallPointerPayload) => {
      if (!enabled || !espacioId) return;
      const point = snapPoint(payload.point);

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
    [draft, enabled, espacioId, onAddWall, resolveTargetWall, snapPoint],
  );

  const handlePointerMove = useCallback(
    (payload: WallPointerPayload) => {
      if (!draft) return;
      const point = snapPoint(payload.point);
      setDraft((prev) =>
        prev
          ? { ...prev, previewX: point.x, previewY: point.y }
          : null,
      );
    },
    [draft, snapPoint],
  );

  const handlePointerUp = useCallback(() => {}, []);

  const handlePointerCancel = useCallback(() => {}, []);

  useEffect(() => {
    if (!enabled) {
      setDraft(null);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !draft) return;
      event.preventDefault();
      cancelDrawing();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelDrawing, draft, enabled]);

  useEffect(() => {
    setDraft(null);
    setSelectedWallId(null);
  }, [espacioId]);

  useEffect(() => {
    if (!enabled) {
      setDraft(null);
    }
  }, [enabled]);

  useEffect(() => {
    if (!selectedWallId) return;
    if (wallsInEspacio.some((wall) => wall.id === selectedWallId)) return;
    setSelectedWallId(null);
  }, [selectedWallId, wallsInEspacio]);

  return {
    wallsInEspacio,
    draft,
    isDrawing,
    selectedWallId,
    selectedWall,
    cancelDrawing,
    clearWallSelection,
    selectWall,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
