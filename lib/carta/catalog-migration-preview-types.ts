/** Payload mínimo enviado al preview (sin restaurantId en cliente). */
export type CatalogMigrationLegacyPlatoInput = {
  id: string;
  nombre: string;
  categoria?: string;
  categoriaCartaId?: string;
  precioVenta?: number;
  preparationArea?: string;
  activo?: boolean;
  tipoVenta?: string;
};

export type CatalogMigrationToCreateItem = {
  legacyPlatoId: string;
  name: string;
  categoryName: string;
  categoryId: string | null;
  price: number;
  preparationArea: string | null;
  tipoVenta: string | null;
  /** `activo` legacy: visibilidad en carta/TPV al migrar. */
  legacyActivo: boolean;
  warnings: string[];
};

export type CatalogMigrationDuplicateItem = {
  legacyPlatoId: string;
  name: string;
  reason: "id_exists" | "normalized_name_category" | "similar_match";
  existingProductId: string;
  existingProductName: string;
  matchScore: number;
  details: string[];
};

export type CatalogMigrationBlockedItem = {
  legacyPlatoId: string;
  name: string;
  reasons: string[];
};

export type CatalogMigrationWarningEntry = {
  code: string;
  message: string;
  legacyPlatoIds: string[];
};

export type CatalogMigrationMissingCategory = {
  categoryName: string;
  legacyPlatoIds: string[];
};

export type CatalogMigrationPreviewTotals = {
  legacyReceived: number;
  legacyProcessed: number;
  legacyTruncated: number;
  toCreate: number;
  duplicates: number;
  blocked: number;
  warningsCount: number;
  missingCategoriesCount: number;
};

export type CatalogMigrationPreviewResult = {
  generatedAt: number;
  restaurantId: string;
  toCreate: CatalogMigrationToCreateItem[];
  duplicates: CatalogMigrationDuplicateItem[];
  blocked: CatalogMigrationBlockedItem[];
  warnings: CatalogMigrationWarningEntry[];
  missingCategories: CatalogMigrationMissingCategory[];
  totals: CatalogMigrationPreviewTotals;
};

export type CatalogMigrationConfig = {
  status: "completed";
  completedAt: number;
  completedBy: string;
  createdCount: number;
  skippedCount: number;
  blockedCount: number;
  legacyCount: number;
  duplicateCount: number;
  errorCount: number;
};

export type CatalogMigrationSkippedItem = {
  legacyPlatoId: string;
  name: string;
  reason:
    | "already_migrated"
    | "duplicate_id"
    | "duplicate_legacy_plato_id"
    | "duplicate_name_category"
    | "preview_duplicate"
    | "preview_blocked";
};

export type CatalogMigrationCreatedItem = {
  legacyPlatoId: string;
  productId: string;
  name: string;
};

export type CatalogMigrationErrorItem = {
  legacyPlatoId: string;
  name: string;
  error: string;
};

export type CatalogMigrationExecuteResult = {
  preview: CatalogMigrationPreviewResult;
  created: CatalogMigrationCreatedItem[];
  skipped: CatalogMigrationSkippedItem[];
  errors: CatalogMigrationErrorItem[];
  migrationConfig: CatalogMigrationConfig;
};
