import type { SalaPoint } from "@/lib/sala-editor/geometry/wall-geometry";
import type {
  SurfaceMaterialKind,
  SurfaceObject,
} from "@/lib/sala-editor/surface/surface-object";
import type { EditorInteractionSession } from "@/lib/sala-editor/canvas/editor-interaction";

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

export type SurfaceInteractionMode = "move" | "resize";
export type SurfaceEditOutcome = "complete" | "cancel";
export type SurfaceResizeHandle = "nw" | "ne" | "sw" | "se";

export type SurfaceMoveSession = EditorInteractionSession<
  SurfaceObject,
  SurfaceInteractionMode
> & {
  active: boolean;
  pointerType: string;
};

export type SurfaceResizeSession = EditorInteractionSession<
  SurfaceObject,
  SurfaceInteractionMode
> & {
  resizeHandle: SurfaceResizeHandle;
  active: boolean;
  pointerType: string;
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

export function translateSurfaceObject(
  surface: SurfaceObject,
  delta: SalaPoint,
  gridSize: number,
): SurfaceObject {
  const snapped = snapSurfacePointToGrid(
    {
      x: surface.x + delta.x,
      y: surface.y + delta.y,
    },
    gridSize,
  );

  return {
    ...surface,
    x: snapped.x,
    y: snapped.y,
  };
}

function getResizePoints(
  surface: SurfaceObject,
  handle: SurfaceResizeHandle,
): { anchor: SalaPoint; dragged: SalaPoint } {
  const left = surface.x;
  const top = surface.y;
  const right = surface.x + surface.width;
  const bottom = surface.y + surface.height;

  if (handle === "nw") {
    return { anchor: { x: right, y: bottom }, dragged: { x: left, y: top } };
  }
  if (handle === "ne") {
    return { anchor: { x: left, y: bottom }, dragged: { x: right, y: top } };
  }
  if (handle === "sw") {
    return { anchor: { x: right, y: top }, dragged: { x: left, y: bottom } };
  }
  return { anchor: { x: left, y: top }, dragged: { x: right, y: bottom } };
}

function enforceMinDistance(
  anchor: number,
  desired: number,
  originalDragged: number,
): number {
  if (Math.abs(desired - anchor) >= SURFACE_MIN_RECT_SIZE) return desired;
  const direction = desired === anchor
    ? originalDragged < anchor
      ? -1
      : 1
    : desired < anchor
      ? -1
      : 1;
  return anchor + direction * SURFACE_MIN_RECT_SIZE;
}

export function resizeSurfaceObject(
  surface: SurfaceObject,
  handle: SurfaceResizeHandle,
  delta: SalaPoint,
  gridSize: number,
): SurfaceObject {
  const { anchor, dragged } = getResizePoints(surface, handle);
  const snappedDragged = snapSurfacePointToGrid(
    {
      x: dragged.x + delta.x,
      y: dragged.y + delta.y,
    },
    gridSize,
  );
  const adjustedDragged = {
    x: enforceMinDistance(anchor.x, snappedDragged.x, dragged.x),
    y: enforceMinDistance(anchor.y, snappedDragged.y, dragged.y),
  };
  const rect = createSurfaceRectFromPoints(anchor, adjustedDragged);

  return {
    ...surface,
    ...rect,
  };
}
