import type { MenuImportExtractionResult } from "../types/extraction.types";
import type {
  NormalizedMenuImport,
  ValidatedMenuImport,
} from "../types/normalized.types";

export type MenuImportValidateParams = {
  normalized: NormalizedMenuImport;
  /** Para cruce OCR (validate-items-against-ocr legacy). */
  extraction: MenuImportExtractionResult;
  restaurantId: string;
};

/** Etapa validate: reglas negocio, OCR cross-check, límites. */
export interface MenuImportValidatorPort {
  readonly validatorId: string;
  validate(params: MenuImportValidateParams): Promise<ValidatedMenuImport>;
}
