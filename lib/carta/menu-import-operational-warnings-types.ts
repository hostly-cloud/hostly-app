import type { ImportedMenuSourceType } from "./imported-menu-types";
import type { MenuImportInputMetadata } from "./menu-import-debug-report-types";

export type MenuImportOperationalWarningId =
  | "pdf_truncated"
  | "qr_no_content"
  | "many_unparsed_lines"
  | "visual_parser_fallback"
  | "categories_pending";

export type MenuImportOperationalWarningTone = "info" | "caution";

export type MenuImportOperationalWarning = {
  id: MenuImportOperationalWarningId;
  message: string;
  tone: MenuImportOperationalWarningTone;
};

export type BuildMenuImportOperationalWarningsInput = {
  sourceType?: ImportedMenuSourceType;
  ocrMethod?: MenuImportInputMetadata["ocrMethod"];
  parserWarnings?: string[];
  rawTextLength?: number;
  itemCount?: number;
  pdfPagesDetected?: number;
  pdfPagesProcessed?: number;
  /** Productos seleccionados con hint de categoría pero sin match en Hostly. */
  unresolvedCategoryItemCount?: number;
  visualCandidateRejectedReason?: string;
};
