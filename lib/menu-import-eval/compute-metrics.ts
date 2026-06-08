import type { CaseMatchResult, CaseMetrics, GlobalExpectations } from "./types";

export function computeCaseMetrics(match: CaseMatchResult, expectedCount: number): CaseMetrics {
  const tp = match.truePositives.length;
  const fn = match.falseNegatives.length;
  const fpFromUnmatched = match.falsePositives.length;
  const fpFromNegatives = match.negativeHits.length;
  const fp = fpFromUnmatched + fpFromNegatives;
  const detected = tp + fpFromUnmatched;

  const recall = expectedCount === 0 ? (tp === 0 ? 1 : 0) : tp / expectedCount;
  const precision = detected === 0 ? (tp === 0 ? 1 : 0) : tp / detected;

  return {
    expected: expectedCount,
    detected,
    tp,
    fp,
    fn,
    recall,
    precision,
  };
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function evaluateCasePass(args: {
  metrics: CaseMetrics;
  globalExpectations?: GlobalExpectations;
  pendingNames: number;
  negativeHitCount: number;
  negativeSectionHitCount?: number;
  stationMismatchCount?: number;
}): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  const g = args.globalExpectations ?? {};

  const minRecall = g.minRecall ?? 1;
  const minPrecision = g.minPrecision ?? 1;
  const maxFp = g.maxFalsePositives ?? 0;
  const maxPending = g.maxPendingNames ?? 0;

  if (args.metrics.recall < minRecall) {
    failures.push(`recall ${formatPercent(args.metrics.recall)} < ${formatPercent(minRecall)}`);
  }
  if (args.metrics.precision < minPrecision) {
    failures.push(`precision ${formatPercent(args.metrics.precision)} < ${formatPercent(minPrecision)}`);
  }
  if (args.metrics.fp > maxFp) {
    failures.push(`FP ${args.metrics.fp} > max ${maxFp}`);
  }
  if (args.pendingNames > maxPending) {
    failures.push(`pendingNames ${args.pendingNames} > max ${maxPending}`);
  }
  if (args.negativeHitCount > 0) {
    failures.push(`negativeProducts matched: ${args.negativeHitCount}`);
  }
  if ((args.negativeSectionHitCount ?? 0) > 0) {
    failures.push(`negativeSections matched: ${args.negativeSectionHitCount}`);
  }
  if ((args.stationMismatchCount ?? 0) > 0) {
    failures.push(`station mismatches: ${args.stationMismatchCount}`);
  }

  return { passed: failures.length === 0, failures };
}

export function aggregateMetrics(rows: CaseMetrics[]): CaseMetrics {
  const tp = rows.reduce((s, r) => s + r.tp, 0);
  const fp = rows.reduce((s, r) => s + r.fp, 0);
  const fn = rows.reduce((s, r) => s + r.fn, 0);
  const expected = rows.reduce((s, r) => s + r.expected, 0);
  const detected = rows.reduce((s, r) => s + r.detected, 0);

  return {
    expected,
    detected,
    tp,
    fp,
    fn,
    recall: expected === 0 ? 1 : tp / expected,
    precision: detected === 0 ? (tp === 0 ? 1 : 0) : tp / detected,
  };
}
