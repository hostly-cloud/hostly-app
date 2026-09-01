import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManualProductImageEnrichment,
  buildPendingAutomaticProductImageEnrichment,
} from "@/lib/carta/product-image-enrichment";
import {
  buildImportedProductImagePrompt,
  evaluateImportedProductImageEligibility,
  looksLikeBrandedOrBeverageProduct,
} from "@/lib/server/product-images/generate-imported-product-image";

function importedDish(overrides: Record<string, unknown> = {}) {
  return {
    restaurantId: "restaurant-1",
    importedFromMenuDraftId: "draft-1",
    importedMenuItemId: "item-1",
    name: "Lubina a la sal",
    categoryName: "Pescados",
    tipoVenta: "plato",
    productFamilyType: "food",
    ...overrides,
  };
}

test("an imported generic dish without image is eligible", () => {
  const result = evaluateImportedProductImageEligibility(importedDish());
  assert.deepEqual(result, {
    eligible: true,
    name: "Lubina a la sal",
    categoryName: "Pescados",
  });
});

test("a manually created generic dish without image is eligible", () => {
  const result = evaluateImportedProductImageEligibility(
    importedDish({ importedFromMenuDraftId: undefined }),
  );
  assert.deepEqual(result, {
    eligible: true,
    name: "Lubina a la sal",
    categoryName: "Pescados",
  });
});

test("the saved Spanish description or current form draft feeds the prompt", () => {
  assert.deepEqual(
    evaluateImportedProductImageEligibility(
      importedDish({ descripcion: "Con patata y verduras de temporada" }),
    ),
    {
      eligible: true,
      name: "Lubina a la sal",
      categoryName: "Pescados",
      description: "Con patata y verduras de temporada",
    },
  );

  assert.deepEqual(
    evaluateImportedProductImageEligibility(
      importedDish({ descripcion: "Descripción guardada" }),
      "  Descripción actual del formulario  ",
    ),
    {
      eligible: true,
      name: "Lubina a la sal",
      categoryName: "Pescados",
      description: "Descripción actual del formulario",
    },
  );
});

test("beverages and drink families are excluded", () => {
  assert.deepEqual(
    evaluateImportedProductImageEligibility(
      importedDish({ tipoVenta: "bebida", name: "Agua con gas" }),
    ),
    { eligible: false, reason: "not_food" },
  );
  assert.deepEqual(
    evaluateImportedProductImageEligibility(
      importedDish({ productFamilyType: "drink", name: "Rioja Crianza" }),
    ),
    { eligible: false, reason: "not_food" },
  );
});

test("brand and beverage wording is blocked even when misclassified as food", () => {
  assert.equal(
    looksLikeBrandedOrBeverageProduct("Coca-Cola Zero", "Refrescos"),
    true,
  );
  assert.equal(
    looksLikeBrandedOrBeverageProduct("Rioja Crianza", "Vinos tintos"),
    true,
  );
  assert.equal(
    looksLikeBrandedOrBeverageProduct("Lubina a la sal", "Pescados"),
    false,
  );

  assert.deepEqual(
    evaluateImportedProductImageEligibility(
      importedDish({ name: "Coca-Cola Zero", categoryName: "Refrescos" }),
    ),
    { eligible: false, reason: "branded_or_beverage" },
  );
});

test("legacy and manual images remain protected", () => {
  assert.deepEqual(
    evaluateImportedProductImageEligibility(
      importedDish({
        imageUrl: "https://example.test/legacy.webp",
        imagePath: "restaurants/r1/products/p1/legacy.webp",
      }),
    ),
    { eligible: false, reason: "protected_existing_image" },
  );

  assert.deepEqual(
    evaluateImportedProductImageEligibility(
      importedDish({
        imageUrl: "https://example.test/manual.webp",
        imagePath: "restaurants/r1/products/p1/manual.webp",
        imageEnrichment: buildManualProductImageEnrichment({
          reviewedAt: 123,
          reviewedBy: "owner-1",
        }),
      }),
    ),
    { eligible: false, reason: "protected_existing_image" },
  );
});

test("a pending automatic image can be regenerated before approval", () => {
  const result = evaluateImportedProductImageEligibility(
    importedDish({
      imageUrl: "https://example.test/ai.webp",
      imagePath: "restaurants/r1/products/p1/ai.webp",
      imageEnrichment: buildPendingAutomaticProductImageEnrichment({
        source: "ai_generated",
        confidence: 0.5,
        provider: "openai",
      }),
    }),
  );
  assert.equal(result.eligible, true);
});

test("invalid names are rejected before any provider call", () => {
  const result = evaluateImportedProductImageEligibility(
    importedDish({ name: " x " }),
  );
  assert.deepEqual(result, {
    eligible: false,
    reason: "invalid_product_name",
  });
});

test("prompt stays generic and explicitly bans branding and text", () => {
  const prompt = buildImportedProductImagePrompt({
    name: "Lubina a la sal",
    categoryName: "Pescados",
    description: "Con patata y verduras de temporada",
  });

  assert.match(prompt, /Lubina a la sal/);
  assert.match(prompt, /Pescados/);
  assert.match(prompt, /patata y verduras/);
  assert.match(prompt, /No text/);
  assert.match(prompt, /no logos/);
  assert.match(prompt, /no packaging/);
  assert.match(prompt, /Do not depict wine bottles/);
});
