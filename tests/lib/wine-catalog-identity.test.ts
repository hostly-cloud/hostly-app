import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogProductImageCandidate } from "@/lib/productos/catalog-product-image-contract";
import {
  assessWineCatalogIdentity,
  filterCatalogCandidatesByWineIdentity,
} from "@/lib/server/product-images/wine-catalog-identity";

function candidate(patch: Partial<CatalogProductImageCandidate> = {}): CatalogProductImageCandidate {
  return {
    provider: "open_food_facts",
    externalReference: "8410869450199",
    productName: "Vega Sicilia Único 2019 Ribera del Duero",
    brand: "Tempos Vega Sicilia",
    quantity: "750 ml",
    imageUrl: "https://images.openfoodfacts.org/images/products/841/086/945/0199/front_es.1.400.jpg",
    thumbnailUrl: "https://images.openfoodfacts.org/images/products/841/086/945/0199/front_es.1.200.jpg",
    sourceUrl: "https://world.openfoodfacts.org/product/8410869450199",
    confidence: 0.92,
    matchLevel: "strong",
    warnings: [],
    license: "CC BY-SA 3.0",
    attribution: "Open Food Facts contributors",
    ...patch,
  };
}

test("wine identity accepts explicit producer appellation and vintage evidence", () => {
  const result = assessWineCatalogIdentity({
    context: {
      wineProducer: "Tempos Vega Sicilia",
      wineAppellation: "Ribera del Duero",
      wineVintage: "2019",
    },
    candidate: candidate(),
  });

  assert.equal(result.applicable, true);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.missingEvidence, []);
  assert.deepEqual(result.conflictingEvidence, []);
});

test("wine identity rejects a candidate without winery evidence", () => {
  const result = assessWineCatalogIdentity({
    context: { wineProducer: "Marqués de Riscal" },
    candidate: candidate({
      productName: "Reserva 2019 Rioja",
      brand: "Bodega Genérica",
    }),
  });

  assert.equal(result.accepted, false);
  assert.equal(result.missingEvidence.includes("wine_producer"), true);
});

test("wine identity rejects a missing appellation when restaurant requires it", () => {
  const result = assessWineCatalogIdentity({
    context: { wineAppellation: "Ribera del Duero" },
    candidate: candidate({
      productName: "Vega Sicilia Único 2019",
      brand: "Tempos Vega Sicilia",
    }),
  });

  assert.equal(result.accepted, false);
  assert.equal(result.missingEvidence.includes("wine_appellation"), true);
});

test("wine identity rejects unconfirmed or conflicting vintages", () => {
  const missing = assessWineCatalogIdentity({
    context: { wineVintage: "2019" },
    candidate: candidate({ productName: "Vega Sicilia Único Ribera del Duero" }),
  });
  assert.equal(missing.accepted, false);
  assert.equal(missing.missingEvidence.includes("wine_vintage"), true);

  const conflicting = assessWineCatalogIdentity({
    context: { wineVintage: "2019" },
    candidate: candidate({ productName: "Vega Sicilia Único 2020 Ribera del Duero" }),
  });
  assert.equal(conflicting.accepted, false);
  assert.equal(conflicting.conflictingEvidence.includes("wine_vintage"), true);
});

test("products without wine identity are unaffected", () => {
  const item = candidate({ productName: "Coca-Cola Zero", brand: "Coca-Cola" });
  assert.deepEqual(
    filterCatalogCandidatesByWineIdentity({ context: {}, candidates: [item] }),
    [item],
  );
});
