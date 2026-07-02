import type { SalaPoint } from "@/lib/sala-editor/geometry/wall-geometry";

export type EditorInteractionHandleKind = "start" | "end" | "resize" | "custom";

export type EditorInteractionTarget =
  | { type: "canvas" }
  | { type: "object-body"; objectId: string }
  | { type: "object-move"; objectId: string }
  | {
      type: "object-handle";
      objectId: string;
      handle: EditorInteractionHandleKind;
    };

export type EditorInteractionMode = string;

export type EditorInteractionSession<TObject, TMode extends EditorInteractionMode> = {
  objectId: string;
  mode: TMode;
  handle?: EditorInteractionHandleKind;
  originPointer: SalaPoint;
  originObject: TObject;
};
