import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogProductImageCandidate } from "@/lib/productos/catalog-product-image-contract";
import {
  assessCatalogImageCandidateExpectation,
  classifyCatalogImageLiveEvalResult,
  summarizeCatalogImageLiveEval,
  type CatalogImageLiveEvalCaseResult,
} from "@/lib/productos/catalog-image-live-eval";

function candidate(
  patch: Partial<CatalogProductImageCandidate> = {},
): CatalogProductImageCandidate {
  return {
    provider: "open_food_facts",
    externalReference: "5449000131805",
    productName: "Coca-Cola Zero",
    brand: "Coca-Cola",
    quantity: "330 ml",
    imageUrl:
      "https://images.openfoodfacts.org/images/products/544/900/013/1805/front_es.12.400.jpg",
    thumbnailUrl:
      "https://images.openfoodfacts.org/images/products/544/900/013/1805/front_es.12.200.jpg",
    sourceUrl: "https://world.openfoodfacts.org/product/5449000131805",
    confidence: 0.94,
    matchLevel: "strong",
    warnings: [],
    license: "CC BY-SA 3.0",
    attribution: "Open Food Facts contributors",
    ...patch,
  };
}

function result(
  patch: Partial<CatalogImageLiveEvalCaseResult> = {},
): CatalogImageLiveEvalCaseResult {
  return {
    id: "case-1",
    segment: "soft_drink",
    query: "Coca-Cola Zero 33 cl",
    durationMs: 500,
    status: "strong",
    candidateCount: 1,
    expectation: { passed: true, failures: [] },
    topCandidate: candidate(),
    error: null,
    ...patch,
  };
}

test("brand, barcode and equivalent 33 cl / 330 ml expectation pass", () => {
  const assessment = assessCatalogImageCandidateExpectation(candidate(), {
    brandTokens: ["Coca-Cola", "Zero"],
    quantity: "33 cl",
    barcode: "5449000131805",
  });

  assert.deepEqual(assessment, { passed: true, failures: [] });
});

test("an unconfirmed vintage remains visible as a review failure", () => {
  const assessment = assessCatalogImageCandidateExpectation(
    candidate({
      externalReference: "8410000000000",
      productName: "Marqués de Riscal Reserva",
      brand: "Marqués de Riscal",
      quantity: "750 ml",
    }),
    {
      brandTokens: ["Marqués de Riscal", "Reserva"],
      quantity: "75 cl",
      vintage: "2019",
    },
  );

  assert.ok(assessment);
  assert.equal(assessment.passed, false);
  assert.deepEqual(assessment.failures, ["vintage_unconfirmed"]);
});

test("a provider strong match is downgraded to review when identity checks fail", () => {
  const status = classifyCatalogImageLiveEvalResult({
    candidate: candidate(),
    expectation: { passed: false, failures: ["quantity_mismatch"] },
  });

  assert.equal(status, "review");
});

test("summary reports assisted coverage but never enables automatic use", () => {
  const summary = summarizeCatalogImageLiveEval([
    result({ id: "strong-1" }),
    result({
      id: "review-1",
      segment: "beer",
      status: "review",
      expectation: { passed: true, failures: [] },
      topCandidate: candidate({ matchLevel: "review", confidence: 0.78 }),
    }),
    result({
      id: "miss-1",
      segment: "wine",
      status: "miss",
      candidateCount: 0,
      expectation: null,
      topCandidate: null,
    }),
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.matched, 2);
  assert.equal(summary.coverageRate, 0.6667);
  assert.equal(summary.expectationPassRate, 1);
  assert.equal(summary.providerHealthy, true);
  assert.equal(summary.assistedCoverageAcceptable, true);
  assert.equal(summary.automaticUseAllowed, false);
  assert.deepEqual(
    summary.segments.map((segment) => segment.segment),
    ["soft_drink", "beer", "wine"],
  );
});

test("provider errors make the live evaluation unhealthy", () => {
  const summary = summarizeCatalogImageLiveEval([
    result({
      id: "error-1",
      status: "error",
      candidateCount: 0,
      expectation: null,
      topCandidate: null,
      error: { code: "CATALOG_PROVIDER_RATE_LIMITED", message: "429" },
    }),
    result({
      id: "error-2",
      status: "error",
      candidateCount: 0,
      expectation: null,
      topCandidate: null,
      error: { code: "CATALOG_PROVIDER_TIMEOUT", message: "timeout" },
    }),
  ]);

  assert.equal(summary.errorRate, 1);
  assert.equal(summary.providerHealthy, false);
  assert.equal(summary.assistedCoverageAcceptable, false);
  assert.equal(summary.automaticUseAllowed, false);
});
