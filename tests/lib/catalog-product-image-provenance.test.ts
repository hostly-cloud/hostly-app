import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManualProductImageEnrichment,
  buildPendingAutomaticProductImageEnrichment,
  readProductImageEnrichment,
} from "@/lib/carta/product-image-enrichment";
import { buildProductImageReviewStateFromDocument } from "@/lib/server/product-images/resolve-product-image-review-state";

const CATALOG_METADATA = buildPendingAutomaticProductImageEnrichment({
  source: "catalog_exact",
  confidence: 0.91,
  provider: "open_food_facts",
  externalReference: "5449000131805",
  matchedAt: 1_000,
  sourceUrl: "https://world.openfoodfacts.org/product/5449000131805",
  imageSourceUrl:
    "https://images.openfoodfacts.org/images/products/544/900/013/1805/front_es.12.400.jpg",
  license: "CC BY-SA 3.0",
  attribution: "Open Food Facts contributors",
  matchedProductName: "Coca-Cola Zero",
  matchedBrand: "Coca-Cola",
  matchedQuantity: "330 ml",
  matchWarnings: ["Revisa el formato."],
});

test("catalog provenance round-trips through defensive metadata parsing", () => {
  const parsed = readProductImageEnrichment(CATALOG_METADATA);
  assert.ok(parsed);
  assert.equal(parsed.source, "catalog_exact");
  assert.equal(parsed.externalReference, "5449000131805");
  assert.equal(parsed.license, "CC BY-SA 3.0");
  assert.equal(parsed.attribution, "Open Food Facts contributors");
  assert.equal(parsed.matchedProductName, "Coca-Cola Zero");
  assert.equal(parsed.matchedBrand, "Coca-Cola");
  assert.equal(parsed.matchedQuantity, "330 ml");
  assert.deepEqual(parsed.matchWarnings, ["Revisa el formato."]);
});

test("pending catalog image exposes aggregate provenance and human review actions", () => {
  const state = buildProductImageReviewStateFromDocument(
    "product-1",
    {
      name: "Coca-Cola Zero 33 cl",
      tipoVenta: "bebida",
      productFamilyType: "drink",
      imageUrl: "https://storage.example/catalog.jpg",
      imagePath:
        "restaurants/r1/products/product-1/catalog/catalog.jpg",
      imageEnrichment: CATALOG_METADATA,
    },
    2_000,
  );

  assert.equal(state.source, "catalog_exact");
  assert.equal(state.reviewStatus, "pending");
  assert.equal(state.canApprove, true);
  assert.equal(state.canReject, true);
  assert.equal(state.canGenerate, false);
  assert.equal(state.canSearchCatalog, true);
  assert.deepEqual(state.catalogProvenance, {
    externalReference: "5449000131805",
    sourceUrl: "https://world.openfoodfacts.org/product/5449000131805",
    imageSourceUrl:
      "https://images.openfoodfacts.org/images/products/544/900/013/1805/front_es.12.400.jpg",
    license: "CC BY-SA 3.0",
    attribution: "Open Food Facts contributors",
    matchedProductName: "Coca-Cola Zero",
    matchedBrand: "Coca-Cola",
    matchedQuantity: "330 ml",
    warnings: ["Revisa el formato."],
  });
});

test("manual and approved images cannot open catalog replacement", () => {
  const manual = buildProductImageReviewStateFromDocument(
    "product-1",
    {
      name: "Producto manual",
      imageUrl: "https://storage.example/manual.jpg",
      imageEnrichment: buildManualProductImageEnrichment({
        reviewedAt: 1_000,
        reviewedBy: "owner-1",
      }),
    },
    2_000,
  );

  assert.equal(manual.canSearchCatalog, false);
  assert.equal(manual.catalogProvenance, null);
});

test("active catalog attach lock suppresses another selection", () => {
  const state = buildProductImageReviewStateFromDocument(
    "product-1",
    {
      name: "Coca-Cola Zero 33 cl",
      tipoVenta: "bebida",
      productFamilyType: "drink",
      catalogImageAttachInProgress: {
        requestId: "request-1",
        startedAt: 1_950,
      },
    },
    2_000,
  );

  assert.equal(state.canSearchCatalog, false);
});
