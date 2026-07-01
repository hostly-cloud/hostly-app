/**
 * Segmento de pared local (Editor V2 · Fase 2.3).
 * Solo memoria; sin Firestore.
 */

import type { SalaEspacioId } from "@/lib/sala-editor/types/espacio";

export type SalaWallSegmentId = string;

export type SalaWallSegment = {
  id: SalaWallSegmentId;
  espacioId: SalaEspacioId;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type SalaWallSegmentDraft = Omit<SalaWallSegment, "id">;

export function createSalaWallSegment(
  draft: SalaWallSegmentDraft,
): SalaWallSegment {
  return {
    id: `wall-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...draft,
  };
}
