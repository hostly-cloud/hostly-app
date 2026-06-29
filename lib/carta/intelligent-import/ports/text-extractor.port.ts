import type { MenuImportExtractionResult } from "../types/extraction.types";
import type { ResolvedMenuImportSource } from "../types/source.types";

/**
 * Etapa extract_text.
 * Implementaciones futuras: Google Vision, pdf-parse, HTML fetch, pasted text bypass.
 */
export interface MenuImportTextExtractorPort {
  readonly extractorId: string;
  supports(source: ResolvedMenuImportSource): boolean;
  extract(source: ResolvedMenuImportSource): Promise<MenuImportExtractionResult>;
}

/** Registro de extractores OCR/texto (permite cadena o selección por MIME). */
export type MenuImportTextExtractorRegistry = {
  extractors: MenuImportTextExtractorPort[];
  select(source: ResolvedMenuImportSource): MenuImportTextExtractorPort | null;
};
