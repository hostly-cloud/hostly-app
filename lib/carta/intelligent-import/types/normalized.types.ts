/**
 * Carta canónica intermedia (post-normalización, pre-validación Hostly).
 */

export type NormalizedMenuImportItem = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  sectionId: string;
  sectionName: string;
  normalizedName: string;
  currency?: "EUR";
  rawLineText?: string;
};

export type NormalizedMenuImportSection = {
  id: string;
  name: string;
  normalizedName: string;
  items: NormalizedMenuImportItem[];
};

export type NormalizedMenuImport = {
  sections: NormalizedMenuImportSection[];
  normalizerId: string;
  warnings?: string[];
};

export type MenuImportValidationIssue = {
  code: string;
  message: string;
  itemId?: string;
  severity: "blocker" | "warning";
};

/** Salida de la etapa VALIDATE. */
export type ValidatedMenuImport = {
  normalized: NormalizedMenuImport;
  issues: MenuImportValidationIssue[];
  validatorId: string;
  isPublishReady: boolean;
};
