/**
 * Importación inteligente de carta — arquitectura objetivo (v0).
 * Solo tipos y ports; sin IA, sin OCR, sin Firestore.
 * Ver docs/16_HOSTLY_INTELLIGENT_MENU_IMPORT_ARCHITECTURE.md
 */

export * from "./types/source.types";
export * from "./types/extraction.types";
export * from "./types/normalized.types";
export * from "./types/hostly-product.types";
export * from "./types/pipeline.types";

export * from "./pipeline/stages";
export type { MenuImportPipelinePort } from "./pipeline/menu-import-pipeline.port";

export type { MenuImportSourceResolverPort } from "./ports/source-resolver.port";
export type {
  MenuImportTextExtractorPort,
  MenuImportTextExtractorRegistry,
} from "./ports/text-extractor.port";
export type {
  MenuImportStructureExtractorPort,
  MenuImportStructureExtractorRegistry,
  MenuImportStructureProviderId,
  MenuImportStructureExtractParams,
} from "./ports/structure-extractor.port";
export type { MenuImportNormalizerPort } from "./ports/normalizer.port";
export type {
  MenuImportValidatorPort,
  MenuImportValidateParams,
} from "./ports/validator.port";
export type {
  HostlyMenuMapperPort,
  HostlyMenuMapParams,
} from "./ports/hostly-mapper.port";

export {
  MENU_IMPORT_SOURCE_KIND_META,
  type MenuImportSourceKindMeta,
} from "./sources/source-kind";
