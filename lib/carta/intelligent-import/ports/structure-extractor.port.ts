import type {
  MenuImportExtractionResult,
  StructuredMenuExtraction,
} from "../types/extraction.types";
import type { MenuImportCartaKind } from "../types/source.types";

/** Identificador de proveedor de estructura (multi-modelo). */
export type MenuImportStructureProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "heuristic";

export type MenuImportStructureExtractParams = {
  extraction: MenuImportExtractionResult;
  cartaKind: MenuImportCartaKind;
  restaurantId: string;
};

/**
 * Etapa extract_structure.
 * OpenAI, Gemini, Claude comparten este contrato; heuristic = parse-menu-text legacy.
 */
export interface MenuImportStructureExtractorPort {
  readonly providerId: MenuImportStructureProviderId;
  readonly modelId?: string;
  extract(
    params: MenuImportStructureExtractParams,
  ): Promise<StructuredMenuExtraction>;
}

export type MenuImportStructureExtractorRegistry = {
  extractors: MenuImportStructureExtractorPort[];
  select(providerId: MenuImportStructureProviderId): MenuImportStructureExtractorPort | null;
};
