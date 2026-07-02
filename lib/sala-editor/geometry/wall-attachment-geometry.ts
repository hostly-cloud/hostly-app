import type { SalaPoint } from "@/lib/sala-editor/geometry/wall-geometry";
import type { SalaWallAttachment } from "@/lib/sala-editor/types/wall-attachment";
import { clampWallAttachmentPosition } from "@/lib/sala-editor/types/wall-attachment";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";

export type ResolvedWallAttachment = {
  point: SalaPoint;
  angleRad: number;
  tangent: SalaPoint;
  normal: SalaPoint;
};

export function resolveWallAttachment(
  wall: Pick<SalaWallSegment, "x1" | "y1" | "x2" | "y2">,
  attachment: Pick<SalaWallAttachment, "positionRatio" | "offset">,
): ResolvedWallAttachment {
  const ratio = clampWallAttachmentPosition(attachment.positionRatio);
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const length = Math.hypot(dx, dy);
  const tangent = length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
  const normal = { x: -tangent.y, y: tangent.x };
  const tangentOffset = attachment.offset?.tangent ?? 0;
  const normalOffset = attachment.offset?.normal ?? 0;

  return {
    point: {
      x: wall.x1 + dx * ratio + tangent.x * tangentOffset + normal.x * normalOffset,
      y: wall.y1 + dy * ratio + tangent.y * tangentOffset + normal.y * normalOffset,
    },
    angleRad: Math.atan2(tangent.y, tangent.x),
    tangent,
    normal,
  };
}

export function projectPointToWallAttachmentPosition(
  wall: Pick<SalaWallSegment, "x1" | "y1" | "x2" | "y2">,
  point: SalaPoint,
): number {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;

  return clampWallAttachmentPosition(
    ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lenSq,
  );
}
