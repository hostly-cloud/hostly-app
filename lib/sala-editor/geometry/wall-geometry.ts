/**
 * Utilidades geométricas para paredes del editor V2.
 */

import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";

export const SALA_WALL_STROKE_WIDTH = 8;
export const SALA_WALL_MIN_LENGTH = 6;
/** Umbral de selección en px (hit test sobre el trazo). */
export const SALA_WALL_HIT_THRESHOLD = 10;

/** Color gris Hostly para paredes y preview. */
export const SALA_WALL_STROKE_COLOR = "var(--hostly-ink-muted, #667085)";

export type SalaPoint = { x: number; y: number };

export function wallSegmentLength(wall: Pick<SalaWallSegment, "x1" | "y1" | "x2" | "y2">): number {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  return Math.hypot(dx, dy);
}

export function formatWallLengthPx(length: number): string {
  return `${Math.round(length)} px`;
}

export function formatWallCoordinates(
  wall: Pick<SalaWallSegment, "x1" | "y1" | "x2" | "y2">,
): string {
  const fmt = (n: number) => Math.round(n);
  return `(${fmt(wall.x1)}, ${fmt(wall.y1)}) → (${fmt(wall.x2)}, ${fmt(wall.y2)})`;
}

/** Distancia de un punto al segmento AB. */
export function distancePointToSegment(
  point: SalaPoint,
  a: SalaPoint,
  b: SalaPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);

  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

export function hitTestWallSegment(
  point: SalaPoint,
  wall: SalaWallSegment,
  threshold = SALA_WALL_HIT_THRESHOLD,
): boolean {
  return (
    distancePointToSegment(
      point,
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 },
    ) <= threshold
  );
}

export function findWallAtPoint(
  point: SalaPoint,
  walls: readonly SalaWallSegment[],
): SalaWallSegment | null {
  for (let i = walls.length - 1; i >= 0; i -= 1) {
    const wall = walls[i]!;
    if (hitTestWallSegment(point, wall)) return wall;
  }
  return null;
}
