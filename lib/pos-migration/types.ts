export type PosMigrationTargetField =
  | "name"
  | "category"
  | "price"
  | "taxRate"
  | "cost"
  | "stock"
  | "unit"
  | "station"
  | "sku"
  | "barcode"
  | "active";

export type PosMigrationStatus =
  | "preview"
  | "published"
  | "rolled_back"
  | "failed";

export type PosMigrationDecision = "create" | "review" | "blocked";

export type PosMigrationColumnMapping = {
  sourceColumn: string;
  targetField: PosMigrationTargetField | null;
  confidence: number;
};

export type PosMigrationCandidate = {
  id: string;
  rowNumber: number;
  name: string;
  category: string | null;
  price: number | null;
  taxRate: number | null;
  cost: number | null;
  stock: number | null;
  unit: "kg" | "g" | "l" | "ml" | "ud";
  station: string | null;
  sku: string | null;
  barcode: string | null;
  active: boolean;
  decision: PosMigrationDecision;
  warnings: string[];
  existingProductId: string | null;
};

export type PosMigrationSummary = {
  rowCount: number;
  createCount: number;
  reviewCount: number;
  blockedCount: number;
  categoryCount: number;
  taxRateDetectedCount: number;
  inventoryDetectedCount: number;
};

export type PosMigrationPreview = {
  migrationId: string;
  status: PosMigrationStatus;
  sourceFileName: string;
  sourceFormat: "csv" | "tsv" | "txt";
  mapping: PosMigrationColumnMapping[];
  items: PosMigrationCandidate[];
  summary: PosMigrationSummary;
  warnings: string[];
};

export type PosMigrationPublishResult = {
  migrationId: string;
  status: "published";
  alreadyPublished: boolean;
  createdProductIds: string[];
  createdCategoryIds: string[];
  skippedItemIds: string[];
};

export type PosMigrationRollbackResult = {
  migrationId: string;
  status: "rolled_back";
  alreadyRolledBack: boolean;
  deletedProductIds: string[];
  deletedCategoryIds: string[];
};
