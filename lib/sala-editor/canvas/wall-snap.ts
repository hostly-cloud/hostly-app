import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import {
  getWallEndpoint,
  resizeWallEndpoint,
  translateWallSegment,
  type SalaPoint,
  type SalaWallEndpoint,
} from "@/lib/sala-editor/geometry/wall-geometry";

/** Offset del dot-grid del lienzo (mitad del tamaño de celda). */
export function getWallGridOffset(gridSize: number): number {
  return gridSize / 2;
}

/** Ajuste duro al centro de celda de la cuadrícula del mapa. */
export function snapWallPointToGrid(
  point: SalaPoint,
  gridSize: number,
): SalaPoint {
  const offset = getWallGridOffset(gridSize);
  return {
    x: Math.round((point.x - offset) / gridSize) * gridSize + offset,
    y: Math.round((point.y - offset) / gridSize) * gridSize + offset,
  };
}

export const WALL_ENDPOINT_SNAP_DISTANCE_PX = 12;
export const WALL_ANGLE_SNAP_STEP_DEG = 45;
export const WALL_ANGLE_SNAP_THRESHOLD_DEG = 7;

export type WallSnapGuide =
  | {
      type: "endpoint";
      from: SalaPoint;
      to: SalaPoint;
    }
  | {
      type: "angle";
      from: SalaPoint;
      to: SalaPoint;
      angleDeg: number;
    };

export type WallSnapResult = {
  wall: SalaWallSegment;
  guide: WallSnapGuide | null;
};

function distanceSq(a: SalaPoint, b: SalaPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function normalizeAngleDeg(angle: number): number {
  const normalized = angle % 180;
  return normalized < 0 ? normalized + 180 : normalized;
}

function shortestAngleDistanceDeg(a: number, b: number): number {
  const diff = Math.abs(normalizeAngleDeg(a) - normalizeAngleDeg(b));
  return Math.min(diff, 180 - diff);
}

function snapPointToAngle(
  movingPoint: SalaPoint,
  fixedPoint: SalaPoint,
): { point: SalaPoint; guide: WallSnapGuide | null } {
  const dx = movingPoint.x - fixedPoint.x;
  const dy = movingPoint.y - fixedPoint.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { point: movingPoint, guide: null };

  const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
  const snappedDeg =
    Math.round(angleDeg / WALL_ANGLE_SNAP_STEP_DEG) *
    WALL_ANGLE_SNAP_STEP_DEG;

  if (
    shortestAngleDistanceDeg(angleDeg, snappedDeg) >
    WALL_ANGLE_SNAP_THRESHOLD_DEG
  ) {
    return { point: movingPoint, guide: null };
  }

  const snappedRad = snappedDeg * (Math.PI / 180);
  const point = {
    x: fixedPoint.x + Math.cos(snappedRad) * length,
    y: fixedPoint.y + Math.sin(snappedRad) * length,
  };

  return {
    point,
    guide: {
      type: "angle",
      from: fixedPoint,
      to: point,
      angleDeg: normalizeAngleDeg(snappedDeg),
    },
  };
}

function findNearestEndpoint(
  point: SalaPoint,
  walls: readonly SalaWallSegment[],
  movingWallId: string,
): SalaPoint | null {
  let nearest: SalaPoint | null = null;
  let nearestDistanceSq = WALL_ENDPOINT_SNAP_DISTANCE_PX * WALL_ENDPOINT_SNAP_DISTANCE_PX;

  for (const wall of walls) {
    if (wall.id === movingWallId) continue;

    for (const endpoint of ["start", "end"] as const) {
      const candidate = getWallEndpoint(wall, endpoint);
      const candidateDistanceSq = distanceSq(point, candidate);
      if (candidateDistanceSq <= nearestDistanceSq) {
        nearest = candidate;
        nearestDistanceSq = candidateDistanceSq;
      }
    }
  }

  return nearest;
}

export function snapWallEndpoint(
  wall: SalaWallSegment,
  endpoint: SalaWallEndpoint,
  rawPoint: SalaPoint,
  walls: readonly SalaWallSegment[],
): WallSnapResult {
  const fixedEndpoint = endpoint === "start" ? "end" : "start";
  const fixedPoint = getWallEndpoint(wall, fixedEndpoint);
  const angleSnap = snapPointToAngle(rawPoint, fixedPoint);
  const anglePoint = angleSnap.point;
  const endpointSnap = findNearestEndpoint(anglePoint, walls, wall.id);

  if (endpointSnap) {
    return {
      wall: resizeWallEndpoint(wall, endpoint, endpointSnap),
      guide: {
        type: "endpoint",
        from: anglePoint,
        to: endpointSnap,
      },
    };
  }

  return {
    wall: resizeWallEndpoint(wall, endpoint, anglePoint),
    guide: angleSnap.guide,
  };
}

export function snapTranslatedWall(
  wall: SalaWallSegment,
  rawDelta: SalaPoint,
  walls: readonly SalaWallSegment[],
): WallSnapResult {
  const translated = translateWallSegment(wall, rawDelta);

  for (const endpoint of ["start", "end"] as const) {
    const translatedPoint = getWallEndpoint(translated, endpoint);
    const endpointSnap = findNearestEndpoint(translatedPoint, walls, wall.id);
    if (!endpointSnap) continue;

    const snapDelta = {
      x: endpointSnap.x - translatedPoint.x,
      y: endpointSnap.y - translatedPoint.y,
    };

    return {
      wall: translateWallSegment(translated, snapDelta),
      guide: {
        type: "endpoint",
        from: translatedPoint,
        to: endpointSnap,
      },
    };
  }

  return { wall: translated, guide: null };
}
