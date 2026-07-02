import type { OperationalElementPosition } from "@/lib/sala-editor/ose/operational-element";
import type { EditorInteractionSession } from "@/lib/sala-editor/canvas/editor-interaction";

export type OperationalInteractionMode = "move";

export type OperationalMoveSession = EditorInteractionSession<
  OperationalElementPosition,
  OperationalInteractionMode
> & {
  startClientX: number;
  startClientY: number;
  pointerType: string;
  active: boolean;
};
