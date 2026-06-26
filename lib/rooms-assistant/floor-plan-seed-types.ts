import type { PlanElementType, TableVisualShape } from "@/lib/firestore/tables";

export type FloorPlanSeedRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type FloorPlanSeedZoneKey = "main" | "terrace" | "outdoor";
export type FloorPlanSeedElementType = Extract<
  PlanElementType,
  "table" | "bar" | "door"
>;

export type FloorPlanSeedElement = {
  type: FloorPlanSeedElementType;
  x: number;
  y: number;
  name?: string;
  width?: number;
  height?: number;
  tableShape?: TableVisualShape;
  seats?: number;
  zoneKey?: FloorPlanSeedZoneKey;
};

export type FloorPlanSeedZone = FloorPlanSeedRect & {
  name: string;
  key: FloorPlanSeedZoneKey;
};

export type FloorPlanSeedFromDraft = {
  zones: FloorPlanSeedZone[];
  elements: FloorPlanSeedElement[];
};
