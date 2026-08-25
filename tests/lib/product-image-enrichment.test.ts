import assert from "node:assert/strict";
import test from "node:test";
import {
  approveProductImageEnrichment,
  buildManualProductImageEnrichment,
  buildPendingAutomaticProductImageEnrichment,
  canAutomaticallyReplaceProductImage,
  readProductImageEnrichment,
  rejectProductImageEnrichment,
} from "@/lib/carta/product-image-enrichment";

test("automatic enrichment is allowed when product has no image", () => {
  assert.equal(canAutomaticallyReplaceProductImage({}), true);
});

test("legacy image without metadata is never overwritten automatically", () => {
  assert.equal(
    canAutomaticallyReplaceProductImage({
      imageUrl: "https://example.test/manual.jpg",
      imagePath: "restaurants/r1/products/p1/manual.jpg",
    }),
    false,
  );
});

test("manual image is approved and locked", () => {
  const metadata = buildManualProductImageEnrichment({
    reviewedAt: 123,
    reviewedBy: "user-1",
  });

  assert.deepEqual(metadata, {
    source: "manual",
    reviewStatus: "approved",
    locked: true,
    reviewedAt: 123,
    reviewedBy: "user-1",
  });
  assert.equal(
    canAutomaticallyReplaceProductImage({
      imageUrl: "https://example.test/manual.jpg",
      imageEnrichment: metadata,
    }),
    false,
  );
});

test("pending automatic image can be replaced until approved", () => {
  const pending = buildPendingAutomaticProductImageEnrichment({
    source: "catalog_exact",
    confidence: 1.5,
    provider: "catalog-provider",
  });

  assert.equal(pending.confidence, 1);
  assert.equal(
    canAutomaticallyReplaceProductImage({
      imageUrl: "https://example.test/catalog.jpg",
      imageEnrichment: pending,
    }),
    true,
  );

  const approved = approveProductImageEnrichment(pending, {
    reviewedAt: 456,
    reviewedBy: "owner-1",
  });
  assert.equal(approved.reviewStatus, "approved");
  assert.equal(approved.locked, true);
  assert.equal(
    canAutomaticallyReplaceProductImage({
      imageUrl: "https://example.test/catalog.jpg",
      imageEnrichment: approved,
    }),
    false,
  );
});

test("rejected automatic image remains replaceable", () => {
  const pending = buildPendingAutomaticProductImageEnrichment({
    source: "ai_generated",
    confidence: 0.72,
    generatedAt: 100,
  });
  const rejected = rejectProductImageEnrichment(pending, {
    reviewedAt: 200,
    reviewedBy: "owner-2",
  });

  assert.equal(rejected.reviewStatus, "rejected");
  assert.equal(rejected.locked, false);
  assert.equal(
    canAutomaticallyReplaceProductImage({
      imagePath: "restaurants/r1/products/p1/generated.webp",
      imageEnrichment: rejected,
    }),
    true,
  );
});

test("stored metadata is read defensively and confidence is clamped", () => {
  assert.deepEqual(
    readProductImageEnrichment({
      source: "catalog_exact",
      reviewStatus: "pending",
      locked: false,
      confidence: 3,
      provider: " catalog ",
      externalReference: " sku-123 ",
    }),
    {
      source: "catalog_exact",
      reviewStatus: "pending",
      locked: false,
      confidence: 1,
      provider: "catalog",
      externalReference: "sku-123",
    },
  );
});

test("malformed stored metadata is treated as legacy protection", () => {
  const metadata = readProductImageEnrichment({
    source: "manual",
    reviewStatus: "approved",
  });
  assert.equal(metadata, null);
  assert.equal(
    canAutomaticallyReplaceProductImage({
      imageUrl: "https://example.test/unknown.jpg",
      imageEnrichment: metadata,
    }),
    false,
  );
});
