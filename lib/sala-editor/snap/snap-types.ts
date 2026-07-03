export type SnapAxis = "x" | "y";

export type SnapPointKind = "edge" | "corner" | "center";

export type SnapRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SnapResizableEdges = {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
};

export type SnapGuide = {
  axis: SnapAxis;
  position: number;
  from: number;
  to: number;
  kind: SnapPointKind;
};

export type SnapEngineOptions = {
  threshold?: number;
  activeEdges?: SnapResizableEdges;
};

export type SnapEngineResult = {
  rect: SnapRect;
  guides: SnapGuide[];
  snapped: boolean;
};
