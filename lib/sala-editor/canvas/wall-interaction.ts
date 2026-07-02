import type { SalaPoint, SalaWallEndpoint } from "@/lib/sala-editor/geometry/wall-geometry";
import type {
  EditorInteractionSession,
  EditorInteractionTarget,
} from "@/lib/sala-editor/canvas/editor-interaction";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";

export type WallInteractionTarget =
  | { type: "canvas" }
  | { type: "wall-body"; wallId: string }
  | { type: "wall-move"; wallId: string }
  | { type: "wall-endpoint"; wallId: string; endpoint: SalaWallEndpoint };

export type WallPointerPayload = {
  point: SalaPoint;
  clientX: number;
  clientY: number;
  pointerType: string;
  target: WallInteractionTarget;
};

export type WallEditMode = "move" | "resize";
export type WallEditOutcome = "complete" | "cancel";

export type WallInteractionSession = EditorInteractionSession<
  SalaWallSegment,
  WallEditMode
> & {
  handle?: SalaWallEndpoint;
};

export function wallTargetToEditorTarget(
  target: WallInteractionTarget,
): EditorInteractionTarget {
  if (target.type === "wall-body") {
    return { type: "object-body", objectId: target.wallId };
  }

  if (target.type === "wall-move") {
    return { type: "object-move", objectId: target.wallId };
  }

  if (target.type === "wall-endpoint") {
    return {
      type: "object-handle",
      objectId: target.wallId,
      handle: target.endpoint,
    };
  }

  return { type: "canvas" };
}
