/** Línea OCR con caja delimitadora (Google Vision documentTextDetection). */

export type OcrLayoutBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

export type OcrLayoutLine = {
  lineIndex: number;
  text: string;
  box: OcrLayoutBox;
  /** Índice del bloque Vision (pages → blocks). */
  blockIndex?: number;
  /** Índice del párrafo dentro del bloque. */
  paragraphIndex?: number;
  /** Índice de página (0-based). */
  pageIndex?: number;
};

export type VisualProductMatchSource = "primary_match" | "fallback_match";

export type VisualMenuProductBlock = {
  /** Nombre comercial normalizado (propuesto en revisión). */
  nameLine: string;
  /** Línea OCR original elegida como primaria antes de normalizar. */
  rawName?: string;
  /** Descripción recortada del nombre (conectores con/with/mit…). */
  descriptionFromName?: string;
  /** Motivo de la normalización comercial. */
  nameNormalizationReason?: string;
  translationLines: string[];
  priceLine: string;
  price: number | null;
  sectionName?: string;
  confidence: number;
  needsReview: boolean;
  rawLines: string[];
  anchorY: number;
  priceAnchorY: number;
  matchSource?: VisualProductMatchSource;
  recoveredByFallback?: boolean;
};

export type VisualMenuLayoutDiagnostics = {
  pageWidth: number;
  pageHeight: number;
  columnSplitX: number;
  medianLineHeight: number;
  ocrLinesWithCoords: OcrLayoutLine[];
  visualBlocks: VisualMenuProductBlock[];
  discardedTranslationLines: Array<{ text: string; lineIndex: number; reason: string }>;
  unpairedPriceLines: Array<{ text: string; lineIndex: number }>;
  unpairedTextLines: Array<{ text: string; lineIndex: number }>;
  /** Bloques creados en la segunda pasada de recuperación. */
  recoveredVisualBlocksCount?: number;
};
