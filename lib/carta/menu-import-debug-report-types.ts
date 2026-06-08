/** Tipos compartidos cliente/servidor para diagnóstico de importación de carta. */

export type ParseMenuLineOutcome =
  | "noise_skipped"
  | "section_header"
  | "blocked_section"
  | "name_price_inline"
  | "orphan_price_matched"
  | "product_name_with_orphan_price"
  | "product_name_pending"
  | "column_block_matched"
  | "ambiguous_price_skipped"
  | "multilingual_block_matched"
  | "multilingual_v2_section_header"
  | "multilingual_v2_block_matched"
  | "multilingual_v2_translation_consumed"
  | "multilingual_v2_orphan_translation_skipped"
  | "multilingual_v2_header_skipped"
  | "multilingual_v2_fragment_prefix_joined"
  | "multilingual_v2_fragment_translation_consumed"
  | "multilingual_v2_fragment_orphan_blocked"
  | "translation_line_skipped"
  | "ignored";

export type ParseMenuLineEvent = {
  lineIndex: number;
  text: string;
  outcome: ParseMenuLineOutcome;
  detail?: string;
  productName?: string;
  price?: number | null;
};

export type MenuImportInputMetadata = {
  bytes: number;
  contentType: string;
  ocrMethod: "vision_image" | "vision_pdf" | "pdf_embedded" | "url_html";
  storagePath?: string;
};

export type MenuImportDebugPhaseCounts = {
  ocrLines: number;
  parserProducts: number;
  afterEnrichment: number;
  ocrValidationAccepted: number;
  ocrValidationRejected: number;
  needsReviewFinal: number;
  selectedForPublishFinal: number;
};

export type MenuImportDebugRejectedItem = {
  name: string;
  phase: "ocr_validation";
  reason: string;
};

export type MenuImportDebugReviewItem = {
  id: string;
  name: string;
  price: number | null;
  confidence: number;
  needsReview: boolean;
  selectedForPublish: boolean;
  reasons: string[];
};

export type MenuImportDebugReport = {
  generatedAt: string;
  fileName: string | null;
  sourceType: string | null;
  inputMetadata?: MenuImportInputMetadata;
  counts: MenuImportDebugPhaseCounts;
  ocrLines: { index: number; text: string }[];
  ocrRawPreview: string;
  ocrRawLength: number;
  ocrCleanedLength: number;
  parserWarnings: string[];
  aiWarnings: string[];
  parseLineEvents: ParseMenuLineEvent[];
  unparsedPendingNames: Array<{ name: string; rawText: string; section: string }>;
  parserProducts: Array<{
    id: string;
    name: string;
    price: number | null;
    section: string;
    confidence: number;
    needsReview: boolean;
    rawText?: string;
  }>;
  enrichmentChanges: Array<{
    id: string;
    parserName: string;
    finalName: string;
    nameChanged: boolean;
    parserNeedsReview: boolean;
    finalNeedsReview: boolean;
    aiWarnings?: string[];
  }>;
  rejected: MenuImportDebugRejectedItem[];
  reviewItems: MenuImportDebugReviewItem[];
  likelyUnparsedOcrLines: Array<{ index: number; text: string; hint: string }>;
  /** Emparejamientos nombre↔precio por bloque columnar. */
  columnBlockPairings?: Array<{
    name: string;
    price: number;
    nameLineIndex: number;
    priceLineIndex: number;
    priceStrength: "strong" | "ambiguous_integer";
  }>;
  /** Productos detectados en bloque ES + traducciones + precio. */
  multilingualBlockPairings?: Array<{
    primaryName: string;
    price: number;
    primaryLineIndex: number;
    priceLineIndex: number;
    translationLines: string[];
    translationLineIndexes: number[];
  }>;
  /** Líneas numéricas descartadas como precio ambiguo. */
  skippedAmbiguousPrices?: Array<{ lineIndex: number; text: string; reason: string }>;
  parserMode?: "visual_layout" | "text_heuristic";
  /** Líneas OCR con bounding boxes generadas en extract (solo vision_image). */
  layoutLinesCount?: number;
  /** Bloques producto del parser visual (evaluado aunque no se active). */
  visualBlocksCount?: number;
  /** Bloques recuperados en segunda pasada visual. */
  recoveredVisualBlocksCount?: number;
  /** Modo elegido tras el gate visual. */
  selectedParserMode?: "visual_layout" | "text_heuristic";
  /** Motivo del fallback a text_heuristic. */
  visualParserGateReason?: string;
  /** Productos parser textual (comparación dual). */
  textItemsCount?: number;
  /** Productos parser visual candidato. */
  visualItemsCount?: number;
  /** Visual descartado por regla anti-regresión. */
  visualCandidateRejectedReason?: string;
  ocrPageWidth?: number;
  /** Métricas de extracción layout Vision (bloques/párrafos). */
  ocrLayoutExtraction?: {
    method: "vision_blocks" | "global_y_cluster" | "text_fallback";
    visionBlockCount: number;
    visionParagraphCount: number;
    layoutLinesPerBlock: number[];
    sampleLinesBefore: string[];
    sampleLinesAfter: string[];
  };
  /** Comparación shadow IA Import V2 vs parser (solo si HOSTLY_AI_IMPORT_V2_SHADOW=true). */
  aiImportV2Shadow?: {
    model: string;
    usedVision: boolean;
    durationMs: number;
    error?: string;
    parserDetected: number;
    v2Accepted: number;
    v2Rejected: number;
    matchedBoth: number;
    parserVsV2Recall: number | null;
    parserVsV2Precision: number | null;
    avgV2Confidence: number | null;
    parserOnly: string[];
    v2Only: string[];
    priceMismatchCount: number;
    rejectedSample: Array<{ name: string; reasons: string[] }>;
  };
  visualLayout?: {
    pageWidth: number;
    pageHeight: number;
    columnSplitX: number;
    medianLineHeight: number;
    ocrLinesWithCoords: Array<{
      lineIndex: number;
      text: string;
      centerX: number;
      centerY: number;
      minX: number;
      maxX: number;
    }>;
    visualBlocks: Array<{
      nameLine: string;
      rawName?: string;
      canonicalName?: string;
      descriptionFromName?: string;
      nameNormalizationReason?: string;
      matchSource?: "primary_match" | "fallback_match";
      recoveredByFallback?: boolean;
      price: number | null;
      priceLine: string;
      translationLines: string[];
      anchorY: number;
      priceAnchorY: number;
      sectionName?: string;
    }>;
    discardedTranslationLines: Array<{ text: string; lineIndex: number; reason: string }>;
    unpairedTextLines: Array<{ text: string; lineIndex: number }>;
    unpairedPriceLines: Array<{ text: string; lineIndex: number }>;
  };
};

export function isMenuImportDebugPanelEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function isMenuImportDebugReportEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.HOSTLY_MENU_IMPORT_DEBUG === "1";
}

export const PARSE_LINE_OUTCOME_LABELS: Record<ParseMenuLineOutcome, string> = {
  noise_skipped: "Ruido/legal omitido",
  section_header: "Cabecera de sección",
  blocked_section: "Sección bloqueada",
  name_price_inline: "Producto (nombre+precio)",
  orphan_price_matched: "Precio huérfano emparejado",
  product_name_with_orphan_price: "Nombre + precio huérfano",
  product_name_pending: "Nombre pendiente (sin precio)",
  column_block_matched: "Bloque columnar (nombre↔precio)",
  ambiguous_price_skipped: "Precio ambiguo omitido",
  multilingual_block_matched: "Bloque multilenguaje (ES + traducciones + precio)",
  multilingual_v2_section_header: "Cabecera trilingüe (V2)",
  multilingual_v2_block_matched: "Bloque multilenguaje V2 (principal + traducciones + precio)",
  multilingual_v2_translation_consumed: "Traducción consumida por bloque V2",
  multilingual_v2_orphan_translation_skipped: "Traducción huérfana omitida (V2)",
  multilingual_v2_header_skipped: "Cabecera multilingüe descartada como producto (V2)",
  multilingual_v2_fragment_prefix_joined:
    "Fragmento unido por prefijo multilingüe v2",
  multilingual_v2_fragment_translation_consumed:
    "Traducción de fragmento consumida multilingüe v2",
  multilingual_v2_fragment_orphan_blocked:
    "Fragmento huérfano bloqueado multilingüe v2",
  translation_line_skipped: "Traducción omitida (EN/DE/FR)",
  ignored: "Ignorada",
};
