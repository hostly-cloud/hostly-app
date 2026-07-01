"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SalaEspacioId } from "@/lib/sala-editor/types/espacio";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import { createSalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import {
  findWallAtPoint,
  SALA_WALL_MIN_LENGTH,
  wallSegmentLength,
  type SalaPoint,
} from "@/lib/sala-editor/geometry/wall-geometry";

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
};

export function useSalaWallDrawing({
  espacioId,
  walls,
  enabled,
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

  const cancelDrawing = useCallback(() => {
    setDraft(null);
  }, []);

  const clearWallSelection = useCallback(() => {
    setSelectedWallId(null);
  }, []);

  const selectWall = useCallback((wallId: string | null) => {
    setSelectedWallId(wallId);
  }, []);

  const handlePointerDown = useCallback(
    (point: SalaPoint) => {
      if (!enabled || !espacioId) return;

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

      const hit = findWallAtPoint(point, wallsInEspacio);
      if (hit) {
        setSelectedWallId(hit.id);
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
    [draft, enabled, espacioId, onAddWall, wallsInEspacio],
  );

  const handlePointerMove = useCallback(
    (point: SalaPoint) => {
      if (!draft) return;
      setDraft((prev) =>
        prev
          ? { ...prev, previewX: point.x, previewY: point.y }
          : null,
      );
    },
    [draft],
  );

  useEffect(() => {
    if (!enabled) {
      setDraft(null);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!draft) return;
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
  };
}
