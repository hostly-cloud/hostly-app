import type { HostlyMenuImportCandidates } from "./hostly-product.types";
import type { MenuImportExtractionResult, StructuredMenuExtraction } from "./extraction.types";
import type { NormalizedMenuImport, ValidatedMenuImport } from "./normalized.types";
import type { MenuImportJobInput, ResolvedMenuImportSource } from "./source.types";
import type { MenuImportPipelineStageId } from "../pipeline/stages";

/** Contexto acumulado a lo largo del pipeline (inmutable por etapa). */
export type MenuImportPipelineContext = {
  input: MenuImportJobInput;
  resolvedSource?: ResolvedMenuImportSource;
  extraction?: MenuImportExtractionResult;
  structure?: StructuredMenuExtraction;
  normalized?: NormalizedMenuImport;
  validated?: ValidatedMenuImport;
  hostlyCandidates?: HostlyMenuImportCandidates;
  completedStages: MenuImportPipelineStageId[];
  traceId: string;
};

export type MenuImportPipelineStageResult<T> = {
  context: MenuImportPipelineContext;
  output: T;
  durationMs?: number;
};

export type MenuImportPipelineErrorCode =
  | "SOURCE_RESOLVE_FAILED"
  | "EXTRACTION_FAILED"
  | "STRUCTURE_FAILED"
  | "NORMALIZE_FAILED"
  | "VALIDATION_FAILED"
  | "MAP_FAILED"
  | "PIPELINE_ABORTED";

export type MenuImportPipelineFailure = {
  code: MenuImportPipelineErrorCode;
  stage: MenuImportPipelineStageId;
  message: string;
  cause?: unknown;
};

export type MenuImportPipelineSuccess = {
  context: MenuImportPipelineContext;
  candidates: HostlyMenuImportCandidates;
};

export type MenuImportPipelineResult =
  | { ok: true; data: MenuImportPipelineSuccess }
  | { ok: false; error: MenuImportPipelineFailure };
