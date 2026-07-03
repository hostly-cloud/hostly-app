export type SnapAxis = "x" | "y";

export type SnapPointKind = "edge" | "corner" | "center";

export type SnapRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
};

export type SnapEngineResult = {
  rect: SnapRect;
  guides: SnapGuide[];
  snapped: boolean;
};
