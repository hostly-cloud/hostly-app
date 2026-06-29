import type { StructuredMenuExtraction } from "../types/extraction.types";
import type { NormalizedMenuImport } from "../types/normalized.types";

/** Etapa normalize: precios, secciones, encoding, IDs estables. */
export interface MenuImportNormalizerPort {
  readonly normalizerId: string;
  normalize(input: StructuredMenuExtraction): Promise<NormalizedMenuImport>;
}
