import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  buildManualProductImageEnrichment,
  buildPendingAutomaticProductImageEnrichment,
} from "@/lib/carta/product-image-enrichment";
import type { CatalogImageAccess } from "@/lib/productos/catalog-image-plan";
import {
  buildImportedProductImagePrompt,
  evaluateImportedProductImageEligibility,
  generateImportedProductImage,
  looksLikeBrandedOrBeverageProduct,
} from "@/lib/server/product-images/generate-imported-product-image";

const PRO_ACCESS: CatalogImageAccess = {
  effectivePlan: "pro",
  source: "subscription",
  capabilities: [
    "catalog.image.ai.single",
    "catalog.image.catalogSearch",
  ],
  meteringMode: "usage_recorded",
};

function fakeGenerationDb(params: {
  productData: Record<string, unknown>;
  usageData?: Record<string, unknown>;
}) {
  const reads: string[] = [];
  const creates: Array<{ path: string; data: Record<string, unknown> }> = [];
  const updates: Array<{ path: string; data: Record<string, unknown> }> = [];

  const node = (path: string): Record<string, unknown> => ({
    path,
    collection: (name: string) => node(`${path}/${name}`),
    doc: (id: string) => node(`${path}/${id}`),
  });

  const db = {
    collection: (name: string) => node(name),
    runTransaction: async (
      callback: (transaction: Record<string, unknown>) => Promise<unknown>,
    ) =>
      callback({
        get: async (reference: { path: string }) => {
          reads.push(reference.path);
          const data = reference.path.includes("/catalogImageUsage/")
            ? params.usageData
            : params.productData;
          return {
            exists: data != null,
            data: () => data,
          };
        },
        create: (
          reference: { path: string },
          data: Record<string, unknown>,
        ) => creates.push({ path: reference.path, data }),
        update: (
          reference: { path: string },
          data: Record<string, unknown>,
        ) => updates.push({ path: reference.path, data }),
      }),
  };

  return { db: db as unknown as Firestore, reads, creates, updates };
}

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

test("a repeated idempotency key never starts a second provider operation", async () => {
  const fake = fakeGenerationDb({
    productData: importedDish(),
    usageData: {
      idempotencyKey: "request-fixed-1",
      status: "processing",
    },
  });

  const result = await generateImportedProductImage({
    db: fake.db,
    restaurantId: "restaurant-1",
    productId: "product-1",
    userId: "owner-1",
    idempotencyKey: "request-fixed-1",
    access: PRO_ACCESS,
  });

  assert.deepEqual(result, {
    outcome: "skipped",
    productId: "product-1",
    reason: "duplicate_request",
    idempotencyKey: "request-fixed-1",
  });
  assert.deepEqual(fake.reads, [
    "restaurants/restaurant-1/products/product-1",
    "restaurants/restaurant-1/catalogImageUsage/request-fixed-1",
  ]);
  assert.equal(fake.creates.length, 0);
  assert.equal(fake.updates.length, 0);
});

test("an ineligible branded item records a tenant-scoped skipped usage", async () => {
  const fake = fakeGenerationDb({
    productData: importedDish({
      name: "Coca-Cola Zero",
      categoryName: "Refrescos",
    }),
  });

  const result = await generateImportedProductImage({
    db: fake.db,
    restaurantId: "restaurant-1",
    productId: "product-1",
    userId: "owner-1",
    idempotencyKey: "request-brand-1",
    access: PRO_ACCESS,
  });

  assert.equal(result.outcome, "skipped");
  assert.equal(result.reason, "branded_or_beverage");
  assert.equal(fake.updates.length, 0);
  assert.equal(fake.creates.length, 1);
  assert.equal(
    fake.creates[0]?.path,
    "restaurants/restaurant-1/catalogImageUsage/request-brand-1",
  );
  assert.deepEqual(
    {
      restaurantId: fake.creates[0]?.data.restaurantId,
      productId: fake.creates[0]?.data.productId,
      userId: fake.creates[0]?.data.userId,
      idempotencyKey: fake.creates[0]?.data.idempotencyKey,
      capability: fake.creates[0]?.data.capability,
      effectivePlan: fake.creates[0]?.data.effectivePlan,
      status: fake.creates[0]?.data.status,
      failureReason: fake.creates[0]?.data.failureReason,
    },
    {
      restaurantId: "restaurant-1",
      productId: "product-1",
      userId: "owner-1",
      idempotencyKey: "request-brand-1",
      capability: "catalog.image.ai.single",
      effectivePlan: "pro",
      status: "skipped",
      failureReason: "branded_or_beverage",
    },
  );
});
