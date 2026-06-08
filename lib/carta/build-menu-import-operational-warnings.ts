import type {
  BuildMenuImportOperationalWarningsInput,
  MenuImportOperationalWarning,
  MenuImportOperationalWarningId,
} from "./menu-import-operational-warnings-types";

/** Líneas explícitamente no emparejadas (parser) antes de mostrar aviso global. */
export const MENU_IMPORT_UNPARSED_LINES_THRESHOLD = 5;

/** Espejo de `menu-import-limits` (evita import server en cliente). */
const MIN_MENU_TEXT_CHARS = 40;
const MAX_PROCESSED_PDF_PAGES = 5;

type ParserWarningMetrics = {
  pdfTruncated: boolean;
  visualParserDiscarded: boolean;
  pendingNamesCount: number;
  ambiguousPricesCount: number;
  fewProductsDetected: boolean;
};

function parseParserWarningMetrics(parserWarnings: string[]): ParserWarningMetrics {
  let pdfTruncated = false;
  let visualParserDiscarded = false;
  let pendingNamesCount = 0;
  let ambiguousPricesCount = 0;
  let fewProductsDetected = false;

  for (const warning of parserWarnings) {
    if (warning.includes("OCR PDF limitado")) pdfTruncated = true;
    if (warning.includes("Parser visual descartado")) visualParserDiscarded = true;
    if (warning.includes("Pocos productos detectados")) fewProductsDetected = true;

    const pendingMatch = warning.match(/(\d+)\s+nombre\(s\)\s+sin precio/i);
    if (pendingMatch?.[1]) pendingNamesCount += Number(pendingMatch[1]);

    const ambiguousMatch = warning.match(/(\d+)\s+línea\(s\)\s+numérica\(s\)\s+omitida\(s\)/i);
    if (ambiguousMatch?.[1]) ambiguousPricesCount += Number(ambiguousMatch[1]);
  }

  return {
    pdfTruncated,
    visualParserDiscarded,
    pendingNamesCount,
    ambiguousPricesCount,
    fewProductsDetected,
  };
}

function estimateUnparsedLineCount(input: BuildMenuImportOperationalWarningsInput): number {
  const parserWarnings = input.parserWarnings ?? [];
  const metrics = parseParserWarningMetrics(parserWarnings);
  let count = metrics.pendingNamesCount + metrics.ambiguousPricesCount;

  const rawTextLength = input.rawTextLength ?? 0;
  const itemCount = input.itemCount ?? 0;
  if (rawTextLength > 0 && itemCount >= 0) {
    const approxOcrLines = Math.max(1, Math.round(rawTextLength / 28));
    const approxParsedLines = Math.max(0, itemCount * 2 + 4);
    const gap = Math.max(0, approxOcrLines - approxParsedLines);
    if (gap >= MENU_IMPORT_UNPARSED_LINES_THRESHOLD) {
      count = Math.max(count, gap);
    }
  }

  return count;
}

function pushWarning(
  warnings: MenuImportOperationalWarning[],
  seen: Set<MenuImportOperationalWarningId>,
  warning: MenuImportOperationalWarning,
): void {
  if (seen.has(warning.id)) return;
  seen.add(warning.id);
  warnings.push(warning);
}

/**
 * Construye avisos operativos compactos a partir de flags y warnings ya existentes.
 * Sin efectos secundarios; usable en cliente y servidor.
 */
export function buildMenuImportOperationalWarnings(
  input: BuildMenuImportOperationalWarningsInput,
): MenuImportOperationalWarning[] {
  const warnings: MenuImportOperationalWarning[] = [];
  const seen = new Set<MenuImportOperationalWarningId>();
  const parserWarnings = input.parserWarnings ?? [];
  const metrics = parseParserWarningMetrics(parserWarnings);

  const pdfPagesProcessed =
    typeof input.pdfPagesProcessed === "number" && input.pdfPagesProcessed > 0
      ? input.pdfPagesProcessed
      : MAX_PROCESSED_PDF_PAGES;
  const pdfPagesDetected = input.pdfPagesDetected;
  const pdfTruncatedByPages =
    typeof pdfPagesDetected === "number" &&
    pdfPagesDetected > pdfPagesProcessed &&
    (metrics.pdfTruncated || input.ocrMethod === "vision_pdf");

  if (pdfTruncatedByPages) {
    pushWarning(warnings, seen, {
      id: "pdf_truncated",
      message: `Se han procesado ${pdfPagesProcessed} de ${pdfPagesDetected} páginas del PDF.`,
      tone: "caution",
    });
  } else if (metrics.pdfTruncated) {
    pushWarning(warnings, seen, {
      id: "pdf_truncated",
      message: `Se han procesado solo las primeras ${pdfPagesProcessed} páginas del PDF.`,
      tone: "caution",
    });
  }

  const isQr = input.sourceType === "qr_url";
  const rawTextLength = input.rawTextLength ?? 0;
  const itemCount = input.itemCount ?? 0;
  const qrWeakContent =
    isQr &&
    (rawTextLength < MIN_MENU_TEXT_CHARS * 2 ||
      itemCount < 3 ||
      (metrics.fewProductsDetected && itemCount < 6));

  if (qrWeakContent) {
    pushWarning(warnings, seen, {
      id: "qr_no_content",
      message: "No se ha encontrado una carta válida en el QR.",
      tone: "caution",
    });
  }

  const unparsedLines = estimateUnparsedLineCount(input);
  if (unparsedLines > MENU_IMPORT_UNPARSED_LINES_THRESHOLD) {
    pushWarning(warnings, seen, {
      id: "many_unparsed_lines",
      message: "Parte de la carta no ha podido interpretarse automáticamente.",
      tone: "caution",
    });
  }

  const visualFallback =
    metrics.visualParserDiscarded || Boolean(input.visualCandidateRejectedReason?.trim());

  if (visualFallback) {
    pushWarning(warnings, seen, {
      id: "visual_parser_fallback",
      message: "Se ha utilizado el parser más fiable para esta carta.",
      tone: "info",
    });
  }

  const unresolvedCategoryItemCount = input.unresolvedCategoryItemCount ?? 0;
  if (unresolvedCategoryItemCount > 0) {
    pushWarning(warnings, seen, {
      id: "categories_pending",
      message: "Algunos productos necesitan revisión de categoría antes de publicar.",
      tone: "info",
    });
  }

  return warnings;
}

/** Fusiona listas de avisos por id (prioriza el primer mensaje). */
export function mergeMenuImportOperationalWarnings(
  ...lists: Array<MenuImportOperationalWarning[] | undefined>
): MenuImportOperationalWarning[] {
  const byId = new Map<MenuImportOperationalWarningId, MenuImportOperationalWarning>();
  for (const list of lists) {
    for (const warning of list ?? []) {
      if (!byId.has(warning.id)) byId.set(warning.id, warning);
    }
  }
  return [...byId.values()];
}
