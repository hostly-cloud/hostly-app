/**
 * Etapas del pipeline unificado de importación inteligente.
 * Orden fijo; cada etapa consume y enriquece MenuImportPipelineContext.
 */

export const MENU_IMPORT_PIPELINE_STAGES = [
  "ingest",
  "resolve_source",
  "extract_text",
  "extract_structure",
  "normalize",
  "validate",
  "map_to_hostly",
] as const;

export type MenuImportPipelineStageId =
  (typeof MENU_IMPORT_PIPELINE_STAGES)[number];

/** Descripción operativa por etapa (documentación en código). */
export const MENU_IMPORT_PIPELINE_STAGE_LABELS: Record<
  MenuImportPipelineStageId,
  string
> = {
  ingest: "Recibir entrada (foto, PDF, QR, URL, texto)",
  resolve_source: "Resolver fuente unificada",
  extract_text: "OCR / fetch / texto pegado → rawText",
  extract_structure: "LLM o heurística → secciones e items",
  normalize: "Formato canónico intermedio",
  validate: "Reglas de negocio y cruce OCR",
  map_to_hostly: "Candidatos producto Hostly",
};

/** Etapa donde se conectan proveedores OCR (Vision, pdf-parse, HTML). */
export const MENU_IMPORT_OCR_STAGE: MenuImportPipelineStageId = "extract_text";

/** Etapa donde se conectan LLM (OpenAI, Gemini, Claude) o parser heurístico. */
export const MENU_IMPORT_LLM_STAGE: MenuImportPipelineStageId =
  "extract_structure";

export const MENU_IMPORT_VALIDATE_STAGE: MenuImportPipelineStageId = "validate";

export const MENU_IMPORT_NORMALIZE_STAGE: MenuImportPipelineStageId = "normalize";

export const MENU_IMPORT_HOSTLY_MAP_STAGE: MenuImportPipelineStageId =
  "map_to_hostly";
