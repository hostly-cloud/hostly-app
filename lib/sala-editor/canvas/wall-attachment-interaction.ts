import type { EditorInteractionSession } from "@/lib/sala-editor/canvas/editor-interaction";
import type { SalaWallAttachment } from "@/lib/sala-editor/types/wall-attachment";
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
