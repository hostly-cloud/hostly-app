import { parseMenuText } from "@/lib/server/menu-imports/parse-menu-text";
import { aggregateMetrics, computeCaseMetrics, evaluateCasePass } from "./compute-metrics";
import { loadCaseMeta, loadCorpusOcrLayoutBundle, loadExpectedProducts, loadOcrText } from "./load-corpus-case";
import { matchProducts } from "./match-products";
import type { CaseEvalResult, DetectedProduct } from "./types";

export function runParserCaseEval(caseId: string, corpusRoot?: string): CaseEvalResult {
  const meta = loadCaseMeta(caseId, corpusRoot);
  const expectedFile = loadExpectedProducts(caseId, corpusRoot);
  const ocrText = loadOcrText(caseId, corpusRoot);
  const layoutBundle = loadCorpusOcrLayoutBundle(caseId, corpusRoot);

  const parsed = parseMenuText(ocrText, {
    sourceType: meta.sourceType,
    menuType: meta.menuType,
    ocrLayoutLines: layoutBundle?.lines,
    ocrPageWidth: layoutBundle?.pageWidth ?? meta.ocrPageWidth,
    ocrPageHeight: layoutBundle?.pageHeight ?? meta.ocrPageHeight,
  });

  const detected: DetectedProduct[] = parsed.items.map((item) => ({
    name: item.name,
    price: item.price,
    sectionName: item.sectionName,
    suggestedCategory: item.suggestedCategory,
    suggestedStation: item.suggestedStation,
  }));

  const match = matchProducts({
    expected: expectedFile.products,
    detected,
    negativeProducts: expectedFile.negativeProducts,
    negativeSections: expectedFile.negativeSections,
  });

  const metrics = computeCaseMetrics(match, expectedFile.products.length);
  const pendingNames = parsed.diagnostics?.unparsedPendingNames?.length ?? 0;
  const stationMismatchCount = match.truePositives.filter((pair) => !pair.stationOk).length;
  const passCheck = evaluateCasePass({
    metrics,
    globalExpectations: expectedFile.globalExpectations,
    pendingNames,
    negativeHitCount: match.negativeHits.length,
    negativeSectionHitCount: match.negativeSectionHits.length,
    stationMismatchCount,
  });

  return {
    caseId,
    title: meta.title,
    metrics,
    match,
    pendingNames,
    negativeSectionHitCount: match.negativeSectionHits.length,
    stationMismatchCount,
    passed: passCheck.passed,
    failures: passCheck.failures,
  };
}

export function runAllParserCases(caseIds: string[], corpusRoot?: string): CaseEvalResult[] {
  return caseIds.map((id) => runParserCaseEval(id, corpusRoot));
}

export { aggregateMetrics };
