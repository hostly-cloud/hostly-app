import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";

export type SalaWallPreset =
  | "free"
  | "horizontal"
  | "vertical"
  | "corner"
  | "u-shape"
  | "arc";

export const SALA_WALL_PRESET_EVENT = "hostly:sala-wall-preset";

export type SalaWallPresetEventDetail = {
  preset: SalaWallPreset;
};

type Point = { x: number; y: number };

type BuildWallPresetSegmentsInput = {
  espacioId: string;
  start: Point;
  end: Point;
  preset: SalaWallPreset;
  groupId?: string;
};

function groupId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `wall-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function segmentId(group: string, index: number): string {
  return `${group}-${index + 1}`;
}

function makeSegment(
  espacioId: string,
  group: string,
  preset: SalaWallPreset,
  index: number,
  a: Point,
  b: Point,
): SalaWallSegment {
  return {
    id: segmentId(group, index),
    espacioId,
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    metadata: {
      preset,
      presetGroupId: group,
      presetSegmentIndex: index,
    },
  };
}

function pointOnQuadraticBezier(a: Point, control: Point, b: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * a.x + 2 * mt * t * control.x + t * t * b.x,
    y: mt * mt * a.y + 2 * mt * t * control.y + t * t * b.y,
  };
}

export function constrainWallPresetEnd(start: Point, end: Point, preset: SalaWallPreset): Point {
  if (preset === "horizontal") return { x: end.x, y: start.y };
  if (preset === "vertical") return { x: start.x, y: end.y };
  return end;
}

export function buildWallPresetSegments({
  espacioId,
  start,
  end: rawEnd,
  preset,
  groupId: explicitGroupId,
}: BuildWallPresetSegmentsInput): SalaWallSegment[] {
  const end = constrainWallPresetEnd(start, rawEnd, preset);
  const group = explicitGroupId ?? groupId();

  if (preset === "free" || preset === "horizontal" || preset === "vertical") {
    return [makeSegment(espacioId, group, preset, 0, start, end)];
  }

  if (preset === "corner") {
    const elbow = { x: end.x, y: start.y };
    return [
      makeSegment(espacioId, group, preset, 0, start, elbow),
      makeSegment(espacioId, group, preset, 1, elbow, end),
    ];
  }

  if (preset === "u-shape") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const horizontalDominant = Math.abs(dx) >= Math.abs(dy);

    if (horizontalDominant) {
      const depth = Math.max(48, Math.min(180, Math.abs(dx) * 0.32));
      const direction = dy >= 0 ? 1 : -1;
      const p1 = { x: start.x, y: start.y + direction * depth };
      const p2 = { x: end.x, y: start.y + direction * depth };
      return [
        makeSegment(espacioId, group, preset, 0, start, p1),
        makeSegment(espacioId, group, preset, 1, p1, p2),
        makeSegment(espacioId, group, preset, 2, p2, end),
      ];
    }

    const depth = Math.max(48, Math.min(180, Math.abs(dy) * 0.32));
    const direction = dx >= 0 ? 1 : -1;
    const p1 = { x: start.x + direction * depth, y: start.y };
    const p2 = { x: start.x + direction * depth, y: end.y };
    return [
      makeSegment(espacioId, group, preset, 0, start, p1),
      makeSegment(espacioId, group, preset, 1, p1, p2),
      makeSegment(espacioId, group, preset, 2, p2, end),
    ];
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) {
    return [makeSegment(espacioId, group, preset, 0, start, end)];
  }

  const nx = -dy / length;
  const ny = dx / length;
  const bulge = Math.max(48, Math.min(220, length * 0.38));
  const control = {
    x: (start.x + end.x) / 2 + nx * bulge,
    y: (start.y + end.y) / 2 + ny * bulge,
  };
  const steps = Math.max(6, Math.min(12, Math.round(length / 70)));
  const points: Point[] = [];
  for (let index = 0; index <= steps; index += 1) {
    points.push(pointOnQuadraticBezier(start, control, end, index / steps));
  }

  return points.slice(0, -1).map((point, index) =>
    makeSegment(espacioId, group, preset, index, point, points[index + 1]),
  );
}
