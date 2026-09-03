import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import type {
  MenuImportDebugRejectedItem,
  MenuImportDebugReport,
  MenuImportDebugReviewItem,
} from "@/lib/carta/menu-import-debug-report-types";
import type { ParseMenuTextDiagnostics } from "./parse-menu-text";
import { explainOcrValidationDecision } from "./validate-items-against-ocr";
import { isMenuImportDebugReportEnabled } from "@/lib/carta/menu-import-debug-report-types";
import type { AiImportV2ShadowReport } from "./ai-import-v2/types";

export { isMenuImportDebugReportEnabled };

export type { MenuImportDebugReport, MenuImportDebugPhaseCounts } from "@/lib/carta/menu-import-debug-report-types";
function summarizeReviewReasons(item: ImportedMenuItem): string[] {
  const reasons: string[] = [];
  if (item.needsReview) reasons.push("needsReview");
  if (!item.selectedForPublish) reasons.push("not_selected_for_publish");
  if (item.price == null) reasons.push("missing_price");
  if (item.confidence < 75) reasons.push("low_confidence");
  if (item.aiWarnings?.length) reasons.push(...item.aiWarnings);
  return reasons;
}

export function buildMenuImportDebugReport(input: {
  fileName: string | null;
  sourceType: string | null;
  inputMetadata?: MenuImportDebugReport["inputMetadata"];
  ocrLayoutExtractionMeta?: MenuImportDebugReport["ocrLayoutExtraction"];
  rawOcrText: string;
  cleanedOcrText: string;
  parserWarnings: string[];
  aiWarnings: string[];
  parseDiagnostics?: ParseMenuTextDiagnostics;
  parsedItems: ImportedMenuItem[];
  enrichedItems: ImportedMenuItem[];
  ocrValidationAccepted: ImportedMenuItem[];
  ocrValidationRejected: { name: string }[];
  rawOcrTextForValidation: string;
  aiImportV2Shadow?: AiImportV2ShadowReport | null;
}): MenuImportDebugReport {
  const ocrLines = input.cleanedOcrText
    .split("\n")
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ index, text }));

  const parsedById = new Map(input.parsedItems.map((item) => [item.id, item]));

  const enrichmentChanges = input.enrichedItems.map((final) => {
    const parsed = parsedById.get(final.id);
    return {
      id: final.id,
      parserName: parsed?.name ?? final.name,
      finalName: final.name,
      nameChanged: parsed != null && parsed.name !== final.name,
      parserNeedsReview: parsed?.needsReview ?? false,
      finalNeedsReview: final.needsReview,
      aiWarnings: final.aiWarnings,
    };
  });

  const rejected: MenuImportDebugRejectedItem[] = input.ocrValidationRejected.map((row) => {
    const decision = explainOcrValidationDecision(row.name, input.rawOcrTextForValidation);
    return {
      name: row.name,
      phase: "ocr_validation",
      reason: decision.reason,
    };
  });

  const reviewItems: MenuImportDebugReviewItem[] = input.ocrValidationAccepted
    .filter((item) => item.needsReview || !item.selectedForPublish)
    .map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price ?? null,
      confidence: item.confidence,
      needsReview: item.needsReview,
      selectedForPublish: item.selectedForPublish,
      reasons: summarizeReviewReasons(item),
    }));

  const parsedOutcomes = new Set(
    (input.parseDiagnostics?.lineEvents ?? [])
      .filter((e) =>
        e.outcome === "name_price_inline" ||
        e.outcome === "orphan_price_matched" ||
        e.outcome === "product_name_with_orphan_price" ||
        e.outcome === "column_block_matched" ||
        e.outcome === "multilingual_block_matched",
      )
      .map((e) => e.lineIndex),
  );

  const likelyUnparsedOcrLines = ocrLines
    .filter(({ index, text }) => {
      if (parsedOutcomes.has(index)) return false;
      const event = input.parseDiagnostics?.lineEvents.find((e) => e.lineIndex === index);
      if (event?.outcome === "section_header" || event?.outcome === "noise_skipped") return false;
      if (text.length < 4) return false;
      if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(text)) return false;
      return true;
    })
    .map(({ index, text }) => {
      const event = input.parseDiagnostics?.lineEvents.find((e) => e.lineIndex === index);
      return {
        index,
        text,
        hint: event?.outcome ?? "no_parser_match",
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    fileName: input.fileName,
    sourceType: input.sourceType,
    inputMetadata: input.inputMetadata,
    counts: {      ocrLines: ocrLines.length,
      parserProducts: input.parsedItems.length,
      afterEnrichment: input.enrichedItems.length,
      ocrValidationAccepted: input.ocrValidationAccepted.length,
      ocrValidationRejected: rejected.length,
      needsReviewFinal: input.ocrValidationAccepted.filter((i) => i.needsReview).length,
      selectedForPublishFinal: input.ocrValidationAccepted.filter((i) => i.selectedForPublish).length,
    },
    ocrLines,
    ocrRawPreview: input.rawOcrText.slice(0, 8000),
    ocrRawLength: input.rawOcrText.length,
    ocrCleanedLength: input.cleanedOcrText.length,
    parserWarnings: input.parserWarnings,
    aiWarnings: input.aiWarnings,
    parseLineEvents: input.parseDiagnostics?.lineEvents ?? [],
    unparsedPendingNames: input.parseDiagnostics?.unparsedPendingNames ?? [],
    parserProducts: input.parsedItems.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price ?? null,
      section: item.sectionName,
      confidence: item.confidence,
      needsReview: item.needsReview,
      rawText: item.rawText,
    })),
    enrichmentChanges,
    rejected,
    reviewItems,
    likelyUnparsedOcrLines,
    columnBlockPairings: input.parseDiagnostics?.columnBlockPairings ?? [],
    skippedAmbiguousPrices: input.parseDiagnostics?.skippedAmbiguousPrices ?? [],
    multilingualBlockPairings: input.parseDiagnostics?.multilingualBlockPairings ?? [],
    parserMode: input.parseDiagnostics?.parserMode,
    layoutLinesCount: input.parseDiagnostics?.layoutLinesCount,
    visualBlocksCount: input.parseDiagnostics?.visualBlocksCount,
    recoveredVisualBlocksCount: input.parseDiagnostics?.visualLayout?.recoveredVisualBlocksCount,
    selectedParserMode: input.parseDiagnostics?.selectedParserMode,
    visualParserGateReason: input.parseDiagnostics?.visualParserGateReason,
    textItemsCount: input.parseDiagnostics?.textItemsCount,
    visualItemsCount: input.parseDiagnostics?.visualItemsCount,
    visualCandidateRejectedReason: input.parseDiagnostics?.visualCandidateRejectedReason,
    ocrPageWidth: input.parseDiagnostics?.ocrPageWidth,
    ocrLayoutExtraction: input.ocrLayoutExtractionMeta,
    aiImportV2Shadow: input.aiImportV2Shadow?.comparison
      ? {
          model: input.aiImportV2Shadow.model,
          usedVision: input.aiImportV2Shadow.usedVision,
          durationMs: input.aiImportV2Shadow.durationMs,
          error: input.aiImportV2Shadow.error,
          parserDetected: input.aiImportV2Shadow.comparison.parserDetected,
          v2Accepted: input.aiImportV2Shadow.comparison.v2Accepted,
          v2Rejected: input.aiImportV2Shadow.comparison.v2Rejected,
          matchedBoth: input.aiImportV2Shadow.comparison.matchedBoth,
          parserVsV2Recall: input.aiImportV2Shadow.comparison.parserVsV2Recall,
          parserVsV2Precision: input.aiImportV2Shadow.comparison.parserVsV2Precision,
          avgV2Confidence: input.aiImportV2Shadow.comparison.avgV2Confidence,
          parserOnly: input.aiImportV2Shadow.comparison.parserOnly.map((p) => p.name),
          v2Only: input.aiImportV2Shadow.comparison.v2Only.map((p) => p.name),
          priceMismatchCount: input.aiImportV2Shadow.comparison.priceMismatches.length,
          rejectedSample: (input.aiImportV2Shadow.validation?.rejected ?? []).slice(0, 6).map((r) => ({
            name: r.name,
            reasons: r.rejectionReasons,
          })),
        }
      : input.aiImportV2Shadow
        ? {
            model: input.aiImportV2Shadow.model,
            usedVision: input.aiImportV2Shadow.usedVision,
            durationMs: input.aiImportV2Shadow.durationMs,
            error: input.aiImportV2Shadow.error,
            parserDetected: 0,
            v2Accepted: 0,
            v2Rejected: 0,
            matchedBoth: 0,
            parserVsV2Recall: null,
            parserVsV2Precision: null,
            avgV2Confidence: null,
            parserOnly: [],
            v2Only: [],
            priceMismatchCount: 0,
            rejectedSample: [],
          }
        : undefined,
    visualLayout: input.parseDiagnostics?.visualLayout
      ? {
          pageWidth: input.parseDiagnostics.visualLayout.pageWidth,
          pageHeight: input.parseDiagnostics.visualLayout.pageHeight,
          columnSplitX: input.parseDiagnostics.visualLayout.columnSplitX,
          medianLineHeight: input.parseDiagnostics.visualLayout.medianLineHeight,
          ocrLinesWithCoords: input.parseDiagnostics.visualLayout.ocrLinesWithCoords.map((l) => ({
            lineIndex: l.lineIndex,
            text: l.text,
            centerX: Math.round(l.box.centerX),
            centerY: Math.round(l.box.centerY),
            minX: Math.round(l.box.minX),
            maxX: Math.round(l.box.maxX),
          })),
          visualBlocks: input.parseDiagnostics.visualLayout.visualBlocks.map((b) => ({
            nameLine: b.nameLine,
            rawName: b.rawName,
            canonicalName: b.nameLine,
            descriptionFromName: b.descriptionFromName,
            nameNormalizationReason: b.nameNormalizationReason,
            matchSource: b.matchSource,
            recoveredByFallback: b.recoveredByFallback,
            price: b.price,
            priceLine: b.priceLine,
            translationLines: b.translationLines,
            anchorY: Math.round(b.anchorY),
            priceAnchorY: Math.round(b.priceAnchorY),
            sectionName: b.sectionName,
          })),
          discardedTranslationLines: input.parseDiagnostics.visualLayout.discardedTranslationLines,
          unpairedTextLines: input.parseDiagnostics.visualLayout.unpairedTextLines,
          unpairedPriceLines: input.parseDiagnostics.visualLayout.unpairedPriceLines,
        }
      : undefined,
  };
}
