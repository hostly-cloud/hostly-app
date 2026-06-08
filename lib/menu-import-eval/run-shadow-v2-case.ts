import { parseMenuText } from "@/lib/server/menu-imports/parse-menu-text";
import { summarizeOcrLayout } from "@/lib/server/menu-imports/ai-import-v2/build-ai-import-v2-prompt";
import { compareAiImportV2WithParser } from "@/lib/server/menu-imports/ai-import-v2/compare-ai-import-v2-with-parser";
import { extractWithAiImportV2 } from "@/lib/server/menu-imports/ai-import-v2/extract-with-ai-import-v2";
import { validateAiImportV2Output } from "@/lib/server/menu-imports/ai-import-v2/validate-ai-import-v2-output";
import type { AiImportV2Comparison } from "@/lib/server/menu-imports/ai-import-v2/types";
import { computeCaseMetrics, evaluateCasePass } from "./compute-metrics";
import { pickShadowV2Winner, type ShadowV2Winner } from "./pick-shadow-v2-winner";
import {
  loadCaseMeta,
  loadCorpusOcrLayout,
  loadExpectedProducts,
  loadOcrText,
} from "./load-corpus-case";
import { matchProducts } from "./match-products";
import type { CaseEvalResult, CaseMatchResult, CaseMetrics, DetectedProduct } from "./types";

export type ShadowV2CaseEvalResult = {
  caseId: string;
  title: string;
  parser: CaseEvalResult;
  v2: {
    metrics: CaseMetrics;
    match: CaseMatchResult;
    rejected: number;
    model: string;
    durationMs: number;
    error?: string;
  };
  parserVsV2: AiImportV2Comparison | null;
  winner: ShadowV2Winner;
};

function emptyV2Metrics(expectedCount: number): CaseMetrics {
  return {
    expected: expectedCount,
    detected: 0,
    tp: 0,
    fp: 0,
    fn: expectedCount,
    recall: 0,
    precision: expectedCount === 0 ? 1 : 0,
  };
}

function emptyV2Match(): CaseMatchResult {
  return {
    truePositives: [],
    falsePositives: [],
    falseNegatives: [],
    negativeHits: [],
    negativeSectionHits: [],
  };
}

export async function runShadowV2CaseEval(
  caseId: string,
  corpusRoot?: string,
): Promise<ShadowV2CaseEvalResult> {
  const meta = loadCaseMeta(caseId, corpusRoot);
  const expectedFile = loadExpectedProducts(caseId, corpusRoot);
  const ocrText = loadOcrText(caseId, corpusRoot);
  const ocrLayoutLines = loadCorpusOcrLayout(caseId, corpusRoot);

  const parsed = parseMenuText(ocrText, {
    sourceType: meta.sourceType,
    menuType: meta.menuType,
    ocrLayoutLines,
  });

  const parserDetected: DetectedProduct[] = parsed.items.map((item) => ({
    name: item.name,
    price: item.price,
    sectionName: item.sectionName,
    suggestedCategory: item.suggestedCategory,
    suggestedStation: item.suggestedStation,
  }));

  const parserMatch = matchProducts({
    expected: expectedFile.products,
    detected: parserDetected,
    negativeProducts: expectedFile.negativeProducts,
    negativeSections: expectedFile.negativeSections,
  });

  const parserMetrics = computeCaseMetrics(parserMatch, expectedFile.products.length);
  const parserPendingNames = parsed.diagnostics?.unparsedPendingNames?.length ?? 0;

  const parserStationMismatchCount = parserMatch.truePositives.filter((pair) => !pair.stationOk).length;
  const parserPass = evaluateCasePass({
    metrics: parserMetrics,
    globalExpectations: expectedFile.globalExpectations,
    pendingNames: parserPendingNames,
    negativeHitCount: parserMatch.negativeHits.length,
    negativeSectionHitCount: parserMatch.negativeSectionHits.length,
    stationMismatchCount: parserStationMismatchCount,
  });

  const parser: CaseEvalResult = {
    caseId,
    title: meta.title,
    metrics: parserMetrics,
    match: parserMatch,
    pendingNames: parserPendingNames,
    negativeSectionHitCount: parserMatch.negativeSectionHits.length,
    stationMismatchCount: parserStationMismatchCount,
    passed: parserPass.passed,
    failures: parserPass.failures,
  };

  const started = Date.now();

  const layoutSummary = ocrLayoutLines?.length
    ? summarizeOcrLayout(
        ocrLayoutLines.map((line) => ({
          text: line.text,
          centerX: line.box.centerX,
          centerY: line.box.centerY,
        })),
      )
    : undefined;

  try {
    const { extraction, model } = await extractWithAiImportV2({
      rawText: ocrText,
      parserItems: parsed.items,
      menuType: meta.menuType,
      sourceType: meta.sourceType,
      layoutSummary,
    });

    const validation = validateAiImportV2Output(extraction, ocrText);

    const v2Detected: DetectedProduct[] = validation.accepted.map((item) => ({
      name: item.name,
      price: item.price,
      sectionName: item.sectionName,
    }));

    const v2MatchClean = matchProducts({
      expected: expectedFile.products,
      detected: v2Detected,
      negativeProducts: expectedFile.negativeProducts,
    });

    const v2Metrics = computeCaseMetrics(v2MatchClean, expectedFile.products.length);
    const parserVsV2 = compareAiImportV2WithParser({
      parserItems: parsed.items,
      v2Accepted: validation.accepted,
      v2RejectedCount: validation.rejected.length,
    });

    return {
      caseId,
      title: meta.title,
      parser,
      v2: {
        metrics: v2Metrics,
        match: v2MatchClean,
        rejected: validation.rejected.length,
        model,
        durationMs: Date.now() - started,
      },
      parserVsV2,
      winner: pickShadowV2Winner(parserMetrics, v2Metrics),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI_IMPORT_V2_EVAL_FAILED";
    return {
      caseId,
      title: meta.title,
      parser,
      v2: {
        metrics: emptyV2Metrics(expectedFile.products.length),
        match: {
          ...emptyV2Match(),
          falseNegatives: expectedFile.products,
        },
        rejected: 0,
        model: process.env.HOSTLY_AI_IMPORT_V2_MODEL?.trim() || "gpt-4o-mini",
        durationMs: Date.now() - started,
        error: message,
      },
      parserVsV2: null,
      winner: pickShadowV2Winner(parserMetrics, emptyV2Metrics(expectedFile.products.length)),
    };
  }
}
