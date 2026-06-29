/**
 * Resultados de extracción (post-OCR / fetch / paste).
 * Punto de extensión: implementaciones en TextExtractorPort.
 */

export type MenuImportOcrLayoutLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Salida de la etapa EXTRACT_TEXT. */
export type MenuImportExtractionResult = {
  rawText: string;
  /** Proveedor que produjo el texto (vision, pdf-parse, html, paste, …). */
  extractorId: string;
  layoutLines?: MenuImportOcrLayoutLine[];
  pageWidth?: number;
  pageHeight?: number;
  /** Metadatos opacos para trazabilidad (sin persistir en esta fase). */
  diagnostics?: Record<string, unknown>;
};

/** Item bruto antes de normalización (salida de StructureExtractorPort). */
export type StructuredMenuItemRaw = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  sectionName: string;
  rawLineText?: string;
  confidence?: number;
};

export type StructuredMenuSectionRaw = {
  id: string;
  name: string;
  items: StructuredMenuItemRaw[];
};

/** Salida de la etapa EXTRACT_STRUCTURE (LLM o heurística). */
export type StructuredMenuExtraction = {
  sections: StructuredMenuSectionRaw[];
  /** openai | anthropic | google | heuristic */
  structureExtractorId: string;
  modelVersion?: string;
  warnings?: string[];
};
