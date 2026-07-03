import type { SnapGuide, SnapRect } from "@/lib/sala-editor/snap/snap-types";

export const SNAP_DISTANCE_PX = 12;

export function createVerticalSnapGuide(
  position: number,
  a: SnapRect,
  b: SnapRect,
  kind: SnapGuide["kind"],
): SnapGuide {
  return {
    axis: "x",
    position,
    from: Math.min(a.y, b.y),
    to: Math.max(a.y + a.height, b.y + b.height),
    kind,
  };
}

export function createHorizontalSnapGuide(
  position: number,
  a: SnapRect,
  b: SnapRect,
  kind: SnapGuide["kind"],
): SnapGuide {
  return {
    axis: "y",
    position,
    from: Math.min(a.x, b.x),
    to: Math.max(a.x + a.width, b.x + b.width),
    kind,
  };
}
