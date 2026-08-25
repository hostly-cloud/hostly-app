import {
  evaluatePhotoVisionCase,
  type PhotoVisionEvalCaseResult,
  type PhotoVisionEvalProduct,
} from "./photo-vision-eval";

export type MultiPhotoVisionEvalPageInput = {
  id: string;
  expected: PhotoVisionEvalProduct[];
  parser: PhotoVisionEvalProduct[];
  vision: PhotoVisionEvalProduct[];
};

export type MultiPhotoVisionEvalBatchInput = {
  id: string;
  pages: MultiPhotoVisionEvalPageInput[];
};

export type MultiPhotoVisionEvalBatchResult = {
  id: string;
  pageCount: number;
  pages: PhotoVisionEvalCaseResult[];
  expectedCount: number;
  parserTruePositive: number;
  visionTruePositive: number;
  parserRecall: number;
  visionRecall: number;
  visionPrecision: number;
  recallLift: number;
  falsePositiveCount: number;
  recoveredExpectedCount: number;
  expectedExactDuplicatesAcrossPages: number;
  expectedSameNameDifferentPriceVariants: number;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function priceKey(price: number | undefined): string {
  return typeof price === "number" && Number.isFinite(price)
    ? (Math.round(price * 100) / 100).toFixed(2)
    : "";
}

function productKey(product: PhotoVisionEvalProduct): string {
  return `${normalize(product.name)}::${priceKey(product.price)}`;
}

function productMatches(a: PhotoVisionEvalProduct, b: PhotoVisionEvalProduct): boolean {
  const an = normalize(a.name);
  const bn = normalize(b.name);
  if (!an || !bn || an !== bn) return false;
  if (a.price == null || b.price == null) return true;
  return Math.abs(a.price - b.price) <= 0.01;
}

function mergeProductsByNamePrice(pages: PhotoVisionEvalProduct[][]): PhotoVisionEvalProduct[] {
  const merged = new Map<string, PhotoVisionEvalProduct>();
  for (const products of pages) {
    for (const product of products) {
      const key = productKey(product);
      if (!key.startsWith("::") && !merged.has(key)) merged.set(key, product);
    }
  }
  return [...merged.values()];
}

function countMatches(expected: PhotoVisionEvalProduct[], detected: PhotoVisionEvalProduct[]): number {
  const used = new Set<number>();
  let count = 0;
  for (const target of expected) {
    const index = detected.findIndex(
      (candidate, candidateIndex) =>
        !used.has(candidateIndex) && productMatches(target, candidate),
    );
    if (index >= 0) {
      used.add(index);
      count += 1;
    }
  }
  return count;
}

function countExpectedCrossPageIdentity(input: MultiPhotoVisionEvalBatchInput): {
  duplicates: number;
  variants: number;
} {
  const firstPageForKey = new Map<string, number>();
  const pricesByName = new Map<string, Set<string>>();
  let duplicates = 0;

  input.pages.forEach((page, pageIndex) => {
    for (const product of page.expected) {
      const key = productKey(product);
      const name = normalize(product.name);
      const price = priceKey(product.price);
      const firstPage = firstPageForKey.get(key);
      if (firstPage != null && firstPage !== pageIndex) duplicates += 1;
      else if (firstPage == null) firstPageForKey.set(key, pageIndex);

      if (!name) continue;
      const prices = pricesByName.get(name) ?? new Set<string>();
      prices.add(price);
      pricesByName.set(name, prices);
    }
  });

  let variants = 0;
  for (const prices of pricesByName.values()) {
    const knownPrices = [...prices].filter(Boolean);
    if (knownPrices.length > 1) variants += knownPrices.length - 1;
  }

  return { duplicates, variants };
}

export function evaluateMultiPhotoVisionBatch(
  input: MultiPhotoVisionEvalBatchInput,
): MultiPhotoVisionEvalBatchResult {
  const pages = input.pages.map((page) =>
    evaluatePhotoVisionCase({
      id: `${input.id}:${page.id}`,
      scenario: "other",
      expected: page.expected,
      parser: page.parser,
      vision: page.vision,
    }),
  );

  const expected = mergeProductsByNamePrice(input.pages.map((page) => page.expected));
  const parser = mergeProductsByNamePrice(input.pages.map((page) => page.parser));
  const vision = mergeProductsByNamePrice(input.pages.map((page) => page.vision));
  const parserTruePositive = countMatches(expected, parser);
  const visionTruePositive = countMatches(expected, vision);
  const parserRecall = expected.length ? parserTruePositive / expected.length : 1;
  const visionRecall = expected.length ? visionTruePositive / expected.length : 1;
  const visionPrecision = vision.length ? visionTruePositive / vision.length : 1;
  const parserKeys = new Set(parser.map(productKey));
  const recoveredExpectedCount = vision.filter(
    (candidate) =>
      !parserKeys.has(productKey(candidate)) &&
      expected.some((target) => productMatches(target, candidate)),
  ).length;
  const identity = countExpectedCrossPageIdentity(input);

  return {
    id: input.id,
    pageCount: input.pages.length,
    pages,
    expectedCount: expected.length,
    parserTruePositive,
    visionTruePositive,
    parserRecall,
    visionRecall,
    visionPrecision,
    recallLift: visionRecall - parserRecall,
    falsePositiveCount: Math.max(0, vision.length - visionTruePositive),
    recoveredExpectedCount,
    expectedExactDuplicatesAcrossPages: identity.duplicates,
    expectedSameNameDifferentPriceVariants: identity.variants,
  };
}

export function summarizeMultiPhotoVisionEvaluation(
  results: MultiPhotoVisionEvalBatchResult[],
) {
  const batchCount = results.length;
  const pageCount = results.reduce((sum, row) => sum + row.pageCount, 0);
  const totalExpected = results.reduce((sum, row) => sum + row.expectedCount, 0);
  const parserTruePositive = results.reduce((sum, row) => sum + row.parserTruePositive, 0);
  const visionTruePositive = results.reduce((sum, row) => sum + row.visionTruePositive, 0);
  const falsePositives = results.reduce((sum, row) => sum + row.falsePositiveCount, 0);
  const recoveredExpected = results.reduce((sum, row) => sum + row.recoveredExpectedCount, 0);
  const parserRecall = totalExpected ? parserTruePositive / totalExpected : 1;
  const visionRecall = totalExpected ? visionTruePositive / totalExpected : 1;
  const precisionDenominator = visionTruePositive + falsePositives;
  const visionPrecision = precisionDenominator ? visionTruePositive / precisionDenominator : 1;

  return {
    batchCount,
    pageCount,
    totalExpected,
    parserRecall,
    visionRecall,
    recallLift: visionRecall - parserRecall,
    visionPrecision,
    falsePositives,
    recoveredExpected,
    exactDuplicatesAcrossPages: results.reduce(
      (sum, row) => sum + row.expectedExactDuplicatesAcrossPages,
      0,
    ),
    sameNameDifferentPriceVariants: results.reduce(
      (sum, row) => sum + row.expectedSameNameDifferentPriceVariants,
      0,
    ),
    activationRecommended:
      batchCount >= 5 &&
      pageCount >= 10 &&
      visionRecall >= parserRecall &&
      visionPrecision >= 0.98 &&
      falsePositives === 0,
  };
}
