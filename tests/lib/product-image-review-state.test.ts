import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManualProductImageEnrichment,
  buildPendingAutomaticProductImageEnrichment,
  approveProductImageEnrichment,
  rejectProductImageEnrichment,
} from "@/lib/carta/product-image-enrichment";
import { buildProductImageReviewView } from "@/lib/productos/product-image-review-view";
import { buildProductImageReviewStateFromDocument } from "@/lib/server/product-images/resolve-product-image-review-state";

function importedDish(patch: Record<string, unknown> = {}) {
  return {
    name: "Lubina a la sal",
    normalizedName: "lubina a la sal",
    categoryName: "Pescados",
    tipoVenta: "plato",
    productFamilyType: "food",
    importedFromMenuDraftId: "draft-1",
    ...patch,
  };
}

test("an imported dish without image exposes one explicit generate action", () => {
  const state = buildProductImageReviewStateFromDocument(
    "product-1",
    importedDish(),
    1_000,
  );
  assert.equal(state.canGenerate, true);
  assert.equal(state.hasImage, false);
  assert.deepEqual(buildProductImageReviewView(state).actions, ["generate"]);
});

test("a pending AI image can be approved, regenerated or rejected", () => {
  const state = buildProductImageReviewStateFromDocument(
    "product-1",
    importedDish({
      imageUrl: "https://example.test/generated.webp",
      imagePath: "restaurants/r1/products/product-1/ai/generated.webp",
      imageEnrichment: buildPendingAutomaticProductImageEnrichment({
        source: "ai_generated",
        confidence: 0.65,
        provider: "openai",
      }),
    }),
    1_000,
  );

  assert.equal(state.canApprove, true);
  assert.equal(state.canReject, true);
  assert.equal(state.canGenerate, true);
  assert.deepEqual(buildProductImageReviewView(state).actions, [
    "approve",
    "regenerate",
    "reject",
  ]);
});

test("an approved automatic image is locked and exposes no destructive actions", () => {
  const pending = buildPendingAutomaticProductImageEnrichment({
    source: "ai_generated",
  });
  const approved = approveProductImageEnrichment(pending, {
    reviewedAt: 900,
    reviewedBy: "owner-1",
  });
  const state = buildProductImageReviewStateFromDocument(
    "product-1",
    importedDish({
      imageUrl: "https://example.test/approved.webp",
      imageEnrichment: approved,
    }),
    1_000,
  );

  assert.equal(state.locked, true);
  assert.equal(state.reviewStatus, "approved");
  assert.equal(state.canGenerate, false);
  assert.deepEqual(buildProductImageReviewView(state).actions, []);
});

test("a rejected automatic image remains eligible only for regeneration", () => {
  const pending = buildPendingAutomaticProductImageEnrichment({
    source: "ai_generated",
  });
  const rejected = rejectProductImageEnrichment(pending, {
    reviewedAt: 900,
    reviewedBy: "owner-1",
  });
  const state = buildProductImageReviewStateFromDocument(
    "product-1",
    importedDish({
      imageUrl: "https://example.test/rejected.webp",
      imageEnrichment: rejected,
    }),
    1_000,
  );

  assert.equal(state.reviewStatus, "rejected");
  assert.equal(state.canGenerate, true);
  assert.deepEqual(buildProductImageReviewView(state).actions, ["regenerate"]);
});

test("manual and legacy images remain protected in the UI", () => {
  const manual = buildProductImageReviewStateFromDocument(
    "product-1",
    importedDish({
      imageUrl: "https://example.test/manual.webp",
      imageEnrichment: buildManualProductImageEnrichment({
        reviewedAt: 800,
        reviewedBy: "owner-1",
      }),
    }),
    1_000,
  );
  const legacy = buildProductImageReviewStateFromDocument(
    "product-2",
    importedDish({ imageUrl: "https://example.test/legacy.webp" }),
    1_000,
  );

  assert.deepEqual(buildProductImageReviewView(manual).actions, []);
  assert.equal(manual.source, "manual");
  assert.deepEqual(buildProductImageReviewView(legacy).actions, []);
  assert.equal(legacy.source, "legacy");
  assert.equal(legacy.reviewStatus, "protected");
});

test("an active generation lock suppresses a second paid request", () => {
  const state = buildProductImageReviewStateFromDocument(
    "product-1",
    importedDish({
      imageGenerationInProgress: {
        requestId: "request-1",
        startedAt: 950,
      },
    }),
    1_000,
  );

  assert.equal(state.generationInProgress, true);
  assert.equal(state.canGenerate, false);
  assert.equal(state.generationReason, "generation_in_progress");
  assert.deepEqual(buildProductImageReviewView(state).actions, []);
});

test("a pending manual image draft suppresses all AI actions until save", () => {
  const state = buildProductImageReviewStateFromDocument(
    "product-1",
    importedDish(),
    1_000,
  );
  const view = buildProductImageReviewView(state, true);
  assert.deepEqual(view.actions, []);
  assert.match(view.guidance ?? "", /Guarda o descarta/);
});
