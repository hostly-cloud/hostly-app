import type { CatalogProductImageCandidate } from "@/lib/productos/catalog-product-image-contract";
import { normalizeCatalogMatchText } from "@/lib/server/product-images/open-food-facts-catalog";

export const CATALOG_IMAGE_LIVE_EVAL_SEGMENTS = [
  "soft_drink",
  "energy_drink",
  "beer",
  "water",
  "wine",
  "sparkling_wine",
] as const;

export type CatalogImageLiveEvalSegment =
  (typeof CATALOG_IMAGE_LIVE_EVAL_SEGMENTS)[number];

export type CatalogImageLiveEvalExpectation = {
  brandTokens?: string[];
  quantity?: string;
  vintage?: string;
  barcode?: string;
};

export type CatalogImageLiveEvalCase = {
  id: string;
  segment: CatalogImageLiveEvalSegment;
  query: string;
  context: {
    name: string;
    categoryName?: string;
    description?: string;
    brand?: string;
    quantity?: string;
    barcode?: string;
  };
  expectation?: CatalogImageLiveEvalExpectation;
};

export type CatalogImageLiveEvalStatus =
  | "strong"
  | "review"
  | "miss"
  | "error";

export type CatalogImageLiveEvalExpectationCheck = {
  passed: boolean;
  failures: string[];
};

export type CatalogImageLiveEvalCaseResult = {
  id: string;
  segment: CatalogImageLiveEvalSegment;
  query: string;
  durationMs: number;
  status: CatalogImageLiveEvalStatus;
  candidateCount: number;
  expectation: CatalogImageLiveEvalExpectationCheck | null;
  topCandidate: CatalogProductImageCandidate | null;
  error: {
    code: string;
    message: string;
  } | null;
};

export type CatalogImageLiveEvalSegmentSummary = {
  segment: CatalogImageLiveEvalSegment;
  total: number;
  strong: number;
  review: number;
  miss: number;
  error: number;
  coverageRate: number;
  expectationPassRate: number | null;
};

export type CatalogImageLiveEvalSummary = {
  total: number;
  strong: number;
  review: number;
  miss: number;
  error: number;
  matched: number;
  expectationChecked: number;
  expectationPassed: number;
  coverageRate: number;
  strongRate: number;
  expectationPassRate: number | null;
  errorRate: number;
  latencyMs: {
    p50: number;
    p95: number;
    max: number;
  };
  providerHealthy: boolean;
  assistedCoverageAcceptable: boolean;
  automaticUseAllowed: false;
  segments: CatalogImageLiveEvalSegmentSummary[];
};

function clampRate(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 10_000) / 10_000));
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return Math.round(sorted[index] ?? 0);
}

function normalizedQuantityTokens(value: string): string[] {
  const normalized = value.toLowerCase().replace(/,/g, ".");
  const tokens: string[] = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(ml|cl|l|g|kg)\b/g;
  for (const match of normalized.matchAll(pattern)) {
    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (unit === "l") tokens.push(`${Math.round(amount * 1000)}ml`);
    else if (unit === "cl") tokens.push(`${Math.round(amount * 10)}ml`);
    else if (unit === "kg") tokens.push(`${Math.round(amount * 1000)}g`);
    else tokens.push(`${Math.round(amount)}${unit}`);
  }
  return [...new Set(tokens)];
}

function containsAllTokens(text: string, tokens: string[]): boolean {
  const normalized = normalizeCatalogMatchText(text);
  return tokens.every((token) => {
    const normalizedToken = normalizeCatalogMatchText(token);
    return normalizedToken.length > 0 && normalized.includes(normalizedToken);
  });
}

export function assessCatalogImageCandidateExpectation(
  candidate: CatalogProductImageCandidate,
  expectation?: CatalogImageLiveEvalExpectation,
): CatalogImageLiveEvalExpectationCheck | null {
  if (!expectation) return null;

  const failures: string[] = [];
  const composite = `${candidate.brand ?? ""} ${candidate.productName}`;

  if (
    expectation.brandTokens?.length &&
    !containsAllTokens(composite, expectation.brandTokens)
  ) {
    failures.push("brand_mismatch");
  }

  if (expectation.quantity) {
    const expected = normalizedQuantityTokens(expectation.quantity);
    const actual = normalizedQuantityTokens(candidate.quantity ?? "");
    if (
      expected.length === 0 ||
      actual.length === 0 ||
      !expected.some((token) => actual.includes(token))
    ) {
      failures.push("quantity_mismatch");
    }
  }

  if (expectation.vintage) {
    const vintage = expectation.vintage.trim();
    const vintageText = `${candidate.productName} ${candidate.brand ?? ""} ${
      candidate.quantity ?? ""
    }`;
    if (!vintage || !vintageText.includes(vintage)) {
      failures.push("vintage_unconfirmed");
    }
  }

  if (
    expectation.barcode?.trim() &&
    candidate.externalReference !== expectation.barcode.trim()
  ) {
    failures.push("barcode_mismatch");
  }

  return { passed: failures.length === 0, failures };
}

export function classifyCatalogImageLiveEvalResult(args: {
  candidate: CatalogProductImageCandidate | null;
  expectation: CatalogImageLiveEvalExpectationCheck | null;
  error?: { code: string; message: string } | null;
}): CatalogImageLiveEvalStatus {
  if (args.error) return "error";
  if (!args.candidate) return "miss";
  if (
    args.candidate.matchLevel === "strong" &&
    args.expectation?.passed !== false
  ) {
    return "strong";
  }
  return "review";
}

function summarizeSegment(
  segment: CatalogImageLiveEvalSegment,
  results: CatalogImageLiveEvalCaseResult[],
): CatalogImageLiveEvalSegmentSummary {
  const scoped = results.filter((result) => result.segment === segment);
  const strong = scoped.filter((result) => result.status === "strong").length;
  const review = scoped.filter((result) => result.status === "review").length;
  const miss = scoped.filter((result) => result.status === "miss").length;
  const error = scoped.filter((result) => result.status === "error").length;
  const checked = scoped.filter((result) => result.expectation != null);
  const passed = checked.filter((result) => result.expectation?.passed).length;

  return {
    segment,
    total: scoped.length,
    strong,
    review,
    miss,
    error,
    coverageRate:
      scoped.length === 0 ? 0 : clampRate((strong + review) / scoped.length),
    expectationPassRate:
      checked.length === 0 ? null : clampRate(passed / checked.length),
  };
}

export function summarizeCatalogImageLiveEval(
  results: CatalogImageLiveEvalCaseResult[],
): CatalogImageLiveEvalSummary {
  const total = results.length;
  const strong = results.filter((result) => result.status === "strong").length;
  const review = results.filter((result) => result.status === "review").length;
  const miss = results.filter((result) => result.status === "miss").length;
  const error = results.filter((result) => result.status === "error").length;
  const expectationChecked = results.filter(
    (result) => result.expectation != null,
  ).length;
  const expectationPassed = results.filter(
    (result) => result.expectation?.passed === true,
  ).length;
  const matched = strong + review;
  const coverageRate = total === 0 ? 0 : clampRate(matched / total);
  const expectationPassRate =
    expectationChecked === 0
      ? null
      : clampRate(expectationPassed / expectationChecked);
  const errorRate = total === 0 ? 0 : clampRate(error / total);
  const latencies = results.map((result) => result.durationMs);

  return {
    total,
    strong,
    review,
    miss,
    error,
    matched,
    expectationChecked,
    expectationPassed,
    coverageRate,
    strongRate: total === 0 ? 0 : clampRate(strong / total),
    expectationPassRate,
    errorRate,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: latencies.length === 0 ? 0 : Math.round(Math.max(...latencies)),
    },
    providerHealthy: total > 0 && errorRate <= 0.2,
    assistedCoverageAcceptable:
      total > 0 &&
      coverageRate >= 0.6 &&
      expectationPassRate != null &&
      expectationPassRate >= 0.8 &&
      errorRate <= 0.2,
    automaticUseAllowed: false,
    segments: CATALOG_IMAGE_LIVE_EVAL_SEGMENTS.map((segment) =>
      summarizeSegment(segment, results),
    ).filter((segment) => segment.total > 0),
  };
}
