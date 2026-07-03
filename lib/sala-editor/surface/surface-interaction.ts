import type { SalaPoint } from "@/lib/sala-editor/geometry/wall-geometry";
import type { SurfaceMaterialKind } from "@/lib/sala-editor/surface/surface-object";

export type SurfaceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SurfaceCreationDraft = {
  material: SurfaceMaterialKind;
  origin: SalaPoint;
  current: SalaPoint;
  rect: SurfaceRect;
};

export const SURFACE_MIN_RECT_SIZE = 8;

export function snapSurfacePointToGrid(
  point: SalaPoint,
  gridSize: number,
): SalaPoint {
  if (gridSize <= 0) return point;
  const offset = gridSize / 2;
  return {
    x: Math.round((point.x - offset) / gridSize) * gridSize + offset,
    y: Math.round((point.y - offset) / gridSize) * gridSize + offset,
  };
}

export function createSurfaceRectFromPoints(
  a: SalaPoint,
  b: SalaPoint,
): SurfaceRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function isSurfaceRectUsable(rect: SurfaceRect): boolean {
  return rect.width >= SURFACE_MIN_RECT_SIZE && rect.height >= SURFACE_MIN_RECT_SIZE;
}
