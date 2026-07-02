import type { SalaPoint, SalaWallEndpoint } from "@/lib/sala-editor/geometry/wall-geometry";

export type WallInteractionTarget =
  | { type: "canvas" }
  | { type: "wall-body"; wallId: string }
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
