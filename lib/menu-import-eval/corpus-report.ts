import fs from "node:fs";
import path from "node:path";
import type { CaseEvalResult, CaseMetrics } from "./types";
import { aggregateMetrics } from "./compute-metrics";
import { getCorpusRoot } from "./load-corpus-case";

export type CorpusCaseSnapshot = {
  caseId: string;
  title: string;
  passed: boolean;
  metrics: CaseMetrics;
  pendingNames: number;
};

export type CorpusBaselineReport = {
  schemaVersion: 1;
  phase: "parser-only";
  generatedAt: string;
  corpusTitle: string;
  summary: CaseMetrics & {
    casesTotal: number;
    casesPassed: number;
  };
  cases: CorpusCaseSnapshot[];
};

export function getBaselinePath(corpusRoot = getCorpusRoot()): string {
  return path.join(corpusRoot, "snapshots", "baseline-parser.json");
}

export function buildCorpusReport(args: {
  corpusTitle: string;
  results: CaseEvalResult[];
}): CorpusBaselineReport {
  const global = aggregateMetrics(args.results.map((r) => r.metrics));
  const passedCount = args.results.filter((r) => r.passed).length;

  return {
    schemaVersion: 1,
    phase: "parser-only",
    generatedAt: new Date().toISOString(),
    corpusTitle: args.corpusTitle,
    summary: {
      ...global,
      casesTotal: args.results.length,
      casesPassed: passedCount,
    },
    cases: args.results.map((r) => ({
      caseId: r.caseId,
      title: r.title,
      passed: r.passed,
      metrics: r.metrics,
      pendingNames: r.pendingNames,
    })),
  };
}

export function writeBaselineReport(report: CorpusBaselineReport, corpusRoot = getCorpusRoot()): string {
  const outPath = getBaselinePath(corpusRoot);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outPath;
}

export function loadBaselineReport(corpusRoot = getCorpusRoot()): CorpusBaselineReport | null {
  const baselinePath = getBaselinePath(corpusRoot);
  if (!fs.existsSync(baselinePath)) return null;
  return JSON.parse(fs.readFileSync(baselinePath, "utf8")) as CorpusBaselineReport;
}

export function compareAgainstBaseline(
  current: CorpusBaselineReport,
  baseline: CorpusBaselineReport,
): string[] {
  const issues: string[] = [];
  const cs = current.summary;
  const bs = baseline.summary;

  if (cs.casesPassed < bs.casesPassed) {
    issues.push(`casesPassed regressed: ${cs.casesPassed} < ${bs.casesPassed}`);
  }
  if (cs.tp < bs.tp) issues.push(`TP regressed: ${cs.tp} < ${bs.tp}`);
  if (cs.fp > bs.fp) issues.push(`FP regressed: ${cs.fp} > ${bs.fp}`);
  if (cs.fn > bs.fn) issues.push(`FN regressed: ${cs.fn} > ${bs.fn}`);
  if (cs.recall < bs.recall - 1e-9) {
    issues.push(`recall regressed: ${cs.recall} < ${bs.recall}`);
  }
  if (cs.precision < bs.precision - 1e-9) {
    issues.push(`precision regressed: ${cs.precision} < ${bs.precision}`);
  }

  const baselineById = new Map(baseline.cases.map((c) => [c.caseId, c]));
  for (const c of current.cases) {
    const b = baselineById.get(c.caseId);
    if (!b) {
      issues.push(`new case not in baseline: ${c.caseId}`);
      continue;
    }
    if (b.passed && !c.passed) {
      issues.push(`case regressed to FAIL: ${c.caseId}`);
    }
  }

  for (const b of baseline.cases) {
    if (!current.cases.some((c) => c.caseId === b.caseId)) {
      issues.push(`baseline case missing from run: ${b.caseId}`);
    }
  }

  return issues;
}
