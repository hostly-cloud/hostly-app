import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogImageBulkEstimateLabel,
  summarizeCatalogImageBulkReadiness,
} from "@/lib/productos/catalog-image-bulk-readiness";

test("bulk readiness separates automatic preparation from immediate review", () => {
  const readiness = summarizeCatalogImageBulkReadiness({
    totalProducts: 20,
    withoutApprovedImage: 12,
    aiGenerable: 4,
    catalogSearchable: 3,
    manualReview: 2,
    pendingReview: 1,
    alreadyProcessing: 2,
    existingImage: 8,
  });

  assert.deepEqual(readiness, {
    pendingTotal: 12,
    automaticNow: 7,
    reviewNow: 3,
    alreadyProcessing: 2,
    aiGeneration: 4,
    catalogSearch: 3,
    manualReview: 2,
    pendingReview: 1,
    accountedPending: 12,
    isConsistent: true,
  });
});

test("bulk readiness flags inconsistent summaries instead of hiding them", () => {
  const readiness = summarizeCatalogImageBulkReadiness({
    totalProducts: 10,
    withoutApprovedImage: 5,
    aiGenerable: 1,
    catalogSearchable: 1,
    manualReview: 1,
    pendingReview: 0,
    alreadyProcessing: 0,
    existingImage: 7,
  });

  assert.equal(readiness.accountedPending, 3);
  assert.equal(readiness.isConsistent, false);
});

test("bulk estimate label surfaces configured credits and safe fallbacks", () => {
  assert.equal(
    catalogImageBulkEstimateLabel({
      aiGenerationRequests: 2,
      catalogSearchRequests: 1,
      credits: 7,
      costUsd: null,
      mode: "credit_balance",
      note: "",
    }),
    "7 créditos estimados",
  );
  assert.equal(
    catalogImageBulkEstimateLabel({
      aiGenerationRequests: 0,
      catalogSearchRequests: 0,
      credits: null,
      costUsd: null,
      mode: "usage_recorded",
      note: "",
    }),
    "Uso registrado",
  );
  assert.equal(
    catalogImageBulkEstimateLabel({
      aiGenerationRequests: 1,
      catalogSearchRequests: 0,
      credits: null,
      costUsd: null,
      mode: "credit_balance",
      note: "",
    }),
    "Créditos por confirmar",
  );
});
