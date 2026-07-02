import type { EditorInteractionSession } from "@/lib/sala-editor/canvas/editor-interaction";
import type { SalaWallAttachment } from "@/lib/sala-editor/types/wall-attachment";
import { clampWallAttachmentPosition } from "@/lib/sala-editor/types/wall-attachment";
import type { SalaWallSegmentId } from "@/lib/sala-editor/types/wall-segment";

export type WallAttachmentEditMode = "move";
export type WallAttachmentEditOutcome = "complete" | "cancel";

export type WallAttachmentInteractionSession = EditorInteractionSession<
  SalaWallAttachment,
  WallAttachmentEditMode
> & {
  wallId: SalaWallSegmentId;
  active: boolean;
};

const WALL_ATTACHMENT_SNAP_RATIOS = [0, 0.25, 0.5, 0.75, 1] as const;
const WALL_ATTACHMENT_SNAP_THRESHOLD = 0.035;

export function snapWallAttachmentPositionRatio(positionRatio: number): number {
  const clamped = clampWallAttachmentPosition(positionRatio);
  let bestRatio = clamped;
  let bestDistance = WALL_ATTACHMENT_SNAP_THRESHOLD;

  for (const snapRatio of WALL_ATTACHMENT_SNAP_RATIOS) {
    const distance = Math.abs(clamped - snapRatio);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestRatio = snapRatio;
    }
  }

  return bestRatio;
}
