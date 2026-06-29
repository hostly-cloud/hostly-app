import type { MenuImportPipelineContext, MenuImportPipelineResult } from "../types/pipeline.types";

/**
 * Orquestador del pipeline unificado.
 * Implementación futura: DefaultMenuImportPipeline (server), con adapters al legacy.
 */
export interface MenuImportPipelinePort {
  readonly pipelineVersion: string;

  /**
   * Ejecuta ingest → map_to_hostly.
   * No persiste Firestore; no llama APIs externas en esta fase de arquitectura.
   */
  run(context: MenuImportPipelineContext): Promise<MenuImportPipelineResult>;
}
