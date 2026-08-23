import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogProductImageCandidate } from "@/lib/productos/catalog-product-image-contract";
import { selectExactCatalogProductImageCandidate } from "@/lib/productos/catalog-product-image-exact-suggestion";

function candidate(externalReference: string): CatalogProductImageCandidate {
  return {
    provider: "open_food_facts",
    externalReference,
    productName: "Coca-Cola Zero",
    brand: "Coca-Cola",
    quantity: "330 ml",
    imageUrl: "https://images.openfoodfacts.org/example/front.jpg",
    thumbnailUrl: "https://images.openfoodfacts.org/example/front-small.jpg",
    sourceUrl: `https://world.openfoodfacts.org/product/${externalReference}`,
    confidence: 1,
    matchLevel: "strong",
    warnings: [],
    license: "CC BY-SA 3.0",
    attribution: "Open Food Facts contributors",
  };
}

test("selects only the candidate matching the persisted GTIN", () => {
  const exact = candidate("5449000131805");
  const other = candidate("8410036002015");

  assert.equal(
    selectExactCatalogProductImageCandidate([other, exact], "5449000131805"),
    exact,
  );
});

test("normalizes formatting without accepting a different reference", () => {
  const exact = candidate("5449000131805");
  assert.equal(
    selectExactCatalogProductImageCandidate([exact], "5 449-0001 31805"),
    exact,
  );
  assert.equal(
    selectExactCatalogProductImageCandidate([exact], "8410036002015"),
    null,
  );
});

test("empty persisted barcode never selects a candidate", () => {
  assert.equal(
    selectExactCatalogProductImageCandidate([candidate("5449000131805")], ""),
    null,
  );
});
