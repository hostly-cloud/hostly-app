export type PhotoVisionEvalProduct = {
  name: string;
  price?: number;
};

export type PhotoVisionEvalCaseInput = {
  id: string;
  scenario: "frontal" | "inclined" | "columns" | "low_light" | "wine" | "other";
  expected: PhotoVisionEvalProduct[];
  parser: PhotoVisionEvalProduct[];
  vision: PhotoVisionEvalProduct[];
};

export type PhotoVisionEvalCaseResult = {
  id: string;
  scenario: PhotoVisionEvalCaseInput["scenario"];
  expectedCount: number;
  parserTruePositive: number;
  visionTruePositive: number;
  parserRecall: number;
  visionRecall: number;
  visionPrecision: number;
  recallLift: number;
  falsePositiveCount: number;
  recoveredExpectedCount: number;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function productMatches(a: PhotoVisionEvalProduct, b: PhotoVisionEvalProduct): boolean {
  const an = normalize(a.name);
  const bn = normalize(b.name);
  if (!an || !bn || an !== bn) return false;
  if (a.price == null || b.price == null) return true;
  return Math.abs(a.price - b.price) <= 0.01;
}

function countMatches(expected: PhotoVisionEvalProduct[], detected: PhotoVisionEvalProduct[]): number {
  const used = new Set<number>();
  let count = 0;
  for (const target of expected) {
    const index = detected.findIndex((candidate, idx) => !used.has(idx) && productMatches(target, candidate));
    if (index >= 0) {
      used.add(index);
      count += 1;
    }
  }
  return count;
}

export function evaluatePhotoVisionCase(input: PhotoVisionEvalCaseInput): PhotoVisionEvalCaseResult {
  const expectedCount = input.expected.length;
  const parserTruePositive = countMatches(input.expected, input.parser);
  const visionTruePositive = countMatches(input.expected, input.vision);
  const parserRecall = expectedCount ? parserTruePositive / expectedCount : 1;
  const visionRecall = expectedCount ? visionTruePositive / expectedCount : 1;
  const visionPrecision = input.vision.length ? visionTruePositive / input.vision.length : 1;
  const parserNames = new Set(input.parser.map((p) => `${normalize(p.name)}:${p.price ?? ""}`));
  const recoveredExpectedCount = input.vision.filter((candidate) => {
    const key = `${normalize(candidate.name)}:${candidate.price ?? ""}`;
    if (parserNames.has(key)) return false;
    return input.expected.some((target) => productMatches(target, candidate));
  }).length;

  return {
    id: input.id,
    scenario: input.scenario,
    expectedCount,
    parserTruePositive,
    visionTruePositive,
    parserRecall,
    visionRecall,
    visionPrecision,
    recallLift: visionRecall - parserRecall,
    falsePositiveCount: Math.max(0, input.vision.length - visionTruePositive),
    recoveredExpectedCount,
  };
}

export function summarizePhotoVisionEvaluation(results: PhotoVisionEvalCaseResult[]) {
  const totalExpected = results.reduce((sum, row) => sum + row.expectedCount, 0);
  const parserTp = results.reduce((sum, row) => sum + row.parserTruePositive, 0);
  const visionTp = results.reduce((sum, row) => sum + row.visionTruePositive, 0);
  const falsePositives = results.reduce((sum, row) => sum + row.falsePositiveCount, 0);
  const recoveredExpected = results.reduce((sum, row) => sum + row.recoveredExpectedCount, 0);
  const parserRecall = totalExpected ? parserTp / totalExpected : 1;
  const visionRecall = totalExpected ? visionTp / totalExpected : 1;
  const precisionDenominator = visionTp + falsePositives;
  const visionPrecision = precisionDenominator ? visionTp / precisionDenominator : 1;

  return {
    caseCount: results.length,
    totalExpected,
    parserRecall,
    visionRecall,
    recallLift: visionRecall - parserRecall,
    visionPrecision,
    falsePositives,
    recoveredExpected,
    activationRecommended:
      results.length >= 5 && visionRecall >= parserRecall && visionPrecision >= 0.98 && falsePositives === 0,
  };
}
