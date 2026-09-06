export type PosLayoutTargetField =
  | "name"
  | "floorPlan"
  | "zone"
  | "seats"
  | "x"
  | "y"
  | "width"
  | "height"
  | "shape";

export type PosLayoutColumnMapping = {
  sourceColumn: string;
  targetField: PosLayoutTargetField | null;
  confidence: number;
};

export type PosLayoutCandidate = {
  id: string;
  rowNumber: number;
  sourceName: string;
  finalName: string;
  floorPlanName: string;
  zoneName: string;
  seats: number;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  shape: "square" | "round" | "rect";
  decision: "create" | "review" | "blocked";
  warnings: string[];
};

export type PosLayoutSummary = {
  rowCount: number;
  createCount: number;
  reviewCount: number;
  blockedCount: number;
  floorPlanCount: number;
  zoneCount: number;
  renamedCount: number;
};

export type PosLayoutPreview = {
  migrationId: string;
  status: "preview";
  migrationKind: "layout";
  sourceFileName: string;
  sourceFormat: "csv" | "tsv" | "txt";
  mapping: PosLayoutColumnMapping[];
  items: PosLayoutCandidate[];
  summary: PosLayoutSummary;
  warnings: string[];
};

export type PosLayoutPublishResult = {
  migrationId: string;
  status: "published";
  alreadyPublished: boolean;
  createdFloorPlanIds: string[];
  createdZoneIds: string[];
  createdTableIds: string[];
  skippedItemIds: string[];
};

export type PosLayoutRollbackResult = {
  migrationId: string;
  status: "rolled_back";
  alreadyRolledBack: boolean;
  deletedFloorPlanIds: string[];
  deletedZoneIds: string[];
  deletedTableIds: string[];
};
