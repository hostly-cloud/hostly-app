import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  approveProductImageEnrichment,
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
  creditBalance: null,
  creditPeriod: null,
  creditCosts: { aiSingle: null, aiBulk: null, catalogSearch: null },
};

const ULTRA_ACCESS: CatalogImageAccess = {
  effectivePlan: "ultra",
  source: "subscription",
  capabilities: [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
  ],
  meteringMode: "usage_recorded",
  creditBalance: null,
  creditPeriod: null,
  creditCosts: { aiSingle: null, aiBulk: null, catalogSearch: null },
};

function fakeGenerationDb(params: {
  productData: Record<string, unknown>;
  restaurantData?: Record<string, unknown>;
  usageData?: Record<string, unknown>;
}) {
  const reads: string[] = [];
  const creates: Array<{ path: string; data: Record<string, unknown> }> = [];
  const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
  const restaurantPath = "restaurants/restaurant-1";
  const productPath = `${restaurantPath}/products/product-1`;
  const usagePrefix = `${restaurantPath}/catalogImageUsage/`;
  const documents = new Map<string, Record<string, unknown>>([
    [
      restaurantPath,
      params.restaurantData ?? { subscription: { plan: "pro" } },
    ],
    [productPath, { ...params.productData }],
    ...(params.usageData
      ? ([[`${usagePrefix}request-fixed-1`, { ...params.usageData }]] as Array<
          [string, Record<string, unknown>]
        >)
      : []),
  ]);

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
          const data = documents.get(reference.path);
          return {
            exists: data != null,
            data: () => data,
          };
        },
        create: (
          reference: { path: string },
          data: Record<string, unknown>,
        ) => {
          creates.push({ path: reference.path, data });
          documents.set(reference.path, { ...data });
        },
        update: (
          reference: { path: string },
          data: Record<string, unknown>,
        ) => {
          updates.push({ path: reference.path, data });
          const current = documents.get(reference.path) ?? {};
          const next = { ...current };
          for (const [key, value] of Object.entries(data)) {
            if (key === "subscription.catalogImages.creditBalance") {
              const subscription = {
                ...((next.subscription as Record<string, unknown>) ?? {}),
              };
              const catalogImages = {
                ...((subscription.catalogImages as Record<string, unknown>) ?? {}),
              };
              const increment =
                value &&
                typeof value === "object" &&
                "operand" in value &&
                typeof value.operand === "number"
                  ? value.operand
                  : null;
              const currentBalance =
                typeof catalogImages.creditBalance === "number"
                  ? catalogImages.creditBalance
                  : 0;
              catalogImages.creditBalance =
                increment == null ? value : currentBalance + increment;
              subscription.catalogImages = catalogImages;
              next.subscription = subscription;
            } else {
              next[key] = value;
            }
          }
          documents.set(reference.path, next);
        },
      }),
  };

  return {
    db: db as unknown as Firestore,
    reads,
    creates,
    updates,
    documents,
  };
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

test("a legacy dish without tipoVenta uses the same safe inference as Productos", () => {
  const result = evaluateImportedProductImageEligibility(
    importedDish({
      importedFromMenuDraftId: undefined,
      tipoVenta: undefined,
      name: "Penne Arrabiata",
      categoryName: "Pasta",
    }),
  );

  assert.deepEqual(result, {
    eligible: true,
    name: "Penne Arrabiata",
    categoryName: "Pasta",
  });
});

test("legacy beverages without tipoVenta remain excluded from AI", () => {
  assert.deepEqual(
    evaluateImportedProductImageEligibility(
      importedDish({
        tipoVenta: undefined,
        name: "Fanta Naranja",
        categoryName: "Refrescos",
      }),
    ),
    { eligible: false, reason: "not_food" },
  );
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

test("an approved AI image requires an explicit replacement confirmation", () => {
  const approvedAi = approveProductImageEnrichment(
    buildPendingAutomaticProductImageEnrichment({ source: "ai_generated" }),
    { reviewedAt: 123, reviewedBy: "owner-1" },
  );
  const product = importedDish({
    imageUrl: "https://example.test/approved-ai.webp",
    imagePath: "restaurants/r1/products/p1/ai/approved-ai.webp",
    imageEnrichment: approvedAi,
  });

  assert.deepEqual(evaluateImportedProductImageEligibility(product), {
    eligible: false,
    reason: "protected_existing_image",
  });
  assert.equal(
    evaluateImportedProductImageEligibility(product, undefined, {
      allowApprovedAiReplacement: true,
    }).eligible,
    true,
  );
});

test("replacement confirmation never unlocks manual or catalog images", () => {
  const options = { allowApprovedAiReplacement: true };
  const manual = importedDish({
    imageUrl: "https://example.test/manual.webp",
    imageEnrichment: buildManualProductImageEnrichment(),
  });
  const catalog = importedDish({
    imageUrl: "https://example.test/catalog.webp",
    imageEnrichment: approveProductImageEnrichment(
      buildPendingAutomaticProductImageEnrichment({ source: "catalog_exact" }),
      { reviewedAt: 123, reviewedBy: "owner-1" },
    ),
  });

  assert.deepEqual(
    evaluateImportedProductImageEligibility(manual, undefined, options),
    { eligible: false, reason: "protected_existing_image" },
  );
  assert.deepEqual(
    evaluateImportedProductImageEligibility(catalog, undefined, options),
    { eligible: false, reason: "protected_existing_image" },
  );
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
    "restaurants/restaurant-1",
    "restaurants/restaurant-1/products/product-1",
    "restaurants/restaurant-1/catalogImageUsage/request-fixed-1",
  ]);
  assert.equal(fake.creates.length, 0);
  assert.equal(fake.updates.length, 0);
});

test("an explicit insufficient balance is blocked and recorded before the provider", async () => {
  const fake = fakeGenerationDb({
    productData: importedDish(),
    restaurantData: {
      subscription: {
        plan: "pro",
        catalogImages: {
          meteringMode: "credit_balance",
          creditBalance: 1,
          creditCosts: { aiSingle: 2 },
        },
      },
    },
  });

  await assert.rejects(
    generateImportedProductImage({
      db: fake.db,
      restaurantId: "restaurant-1",
      productId: "product-1",
      userId: "owner-1",
      idempotencyKey: "request-credit-blocked-1",
      access: PRO_ACCESS,
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CATALOG_IMAGE_CREDITS_EXHAUSTED",
  );

  assert.equal(
    fake.updates.some((update) => update.path === "restaurants/restaurant-1"),
    false,
  );
  assert.equal(fake.creates.length, 1);
  assert.equal(fake.creates[0]?.data.status, "failed");
  assert.equal(fake.creates[0]?.data.result, "blocked");
  assert.equal(fake.creates[0]?.data.creditStatus, "blocked");
  assert.equal(fake.creates[0]?.data.creditCost, 2);
  assert.equal(fake.creates[0]?.data.creditBalanceBefore, 1);
});

test("a successful generation consumes one atomic configured credit reservation", async () => {
  const fake = fakeGenerationDb({
    productData: importedDish(),
    restaurantData: {
      subscription: {
        plan: "pro",
        catalogImages: {
          meteringMode: "credit_balance",
          creditBalance: 5,
          creditCosts: { aiSingle: 2 },
        },
      },
    },
  });
  let providerCalls = 0;
  const request = {
    db: fake.db,
    restaurantId: "restaurant-1",
    productId: "product-1",
    userId: "owner-1",
    idempotencyKey: "request-credit-success-1",
    access: PRO_ACCESS,
  };

  const result = await generateImportedProductImage(request, {
    generateImage: async () => {
      providerCalls += 1;
      return {
        bytes: Buffer.from([1, 2, 3]),
        model: "test-model",
        mediaType: "image/webp",
        costUsd: 0.01,
      };
    },
    saveImage: async () => ({
      imagePath:
        "restaurants/restaurant-1/products/product-1/ai/generated.webp",
      imageUrl: "https://example.test/generated.webp",
    }),
  });

  assert.equal(result.outcome, "generated");
  assert.equal(providerCalls, 1);
  const restaurant = fake.documents.get("restaurants/restaurant-1");
  const subscription = restaurant?.subscription as Record<string, unknown>;
  const catalogImages = subscription.catalogImages as Record<string, unknown>;
  assert.equal(catalogImages.creditBalance, 3);
  const usage = fake.documents.get(
    "restaurants/restaurant-1/catalogImageUsage/request-credit-success-1",
  );
  assert.equal(usage?.creditStatus, "consumed");
  assert.equal(usage?.creditCost, 2);
  assert.equal(usage?.creditBalanceBefore, 5);
  assert.equal(usage?.creditBalanceAfter, 3);

  const duplicate = await generateImportedProductImage(request, {
    generateImage: async () => {
      providerCalls += 1;
      throw new Error("must not run");
    },
  });
  assert.equal(duplicate.outcome, "skipped");
  assert.equal(duplicate.reason, "duplicate_request");
  assert.equal(providerCalls, 1);
  assert.equal(catalogImages.creditBalance, 3);
});

test("a generated file is discarded when its credit reservation expired in flight", async () => {
  const fake = fakeGenerationDb({
    productData: importedDish(),
    restaurantData: {
      subscription: {
        plan: "pro",
        catalogImages: {
          meteringMode: "credit_balance",
          creditBalance: 5,
          creditCosts: { aiSingle: 2 },
        },
      },
    },
  });
  let deletedPath = "";
  const result = await generateImportedProductImage(
    {
      db: fake.db,
      restaurantId: "restaurant-1",
      productId: "product-1",
      userId: "owner-1",
      idempotencyKey: "request-credit-expired-in-flight",
      access: PRO_ACCESS,
    },
    {
      generateImage: async () => ({
        bytes: Buffer.from([1, 2, 3]),
        model: "test-model",
        mediaType: "image/webp",
      }),
      saveImage: async () => {
        const usage = fake.documents.get(
          "restaurants/restaurant-1/catalogImageUsage/request-credit-expired-in-flight",
        )!;
        usage.creditStatus = "released";
        usage.status = "failed";
        usage.failureReason = "CREDIT_RESERVATION_EXPIRED";
        const restaurant = fake.documents.get("restaurants/restaurant-1")!;
        const subscription = restaurant.subscription as Record<string, unknown>;
        const catalogImages = subscription.catalogImages as Record<string, unknown>;
        catalogImages.creditBalance = 5;
        return {
          imagePath:
            "restaurants/restaurant-1/products/product-1/ai/generated.webp",
          imageUrl: "https://example.test/generated.webp",
        };
      },
      deleteImage: async (_restaurantId, _productId, imagePath) => {
        deletedPath = imagePath ?? "";
      },
    },
  );

  assert.equal(result.outcome, "skipped");
  assert.equal(result.reason, "credit_reservation_expired");
  assert.equal(
    deletedPath,
    "restaurants/restaurant-1/products/product-1/ai/generated.webp",
  );
  const product = fake.documents.get(
    "restaurants/restaurant-1/products/product-1",
  );
  assert.equal(product?.imageUrl, undefined);
});

test("a provider failure releases a configured credit reservation", async () => {
  const fake = fakeGenerationDb({
    productData: importedDish(),
    restaurantData: {
      subscription: {
        plan: "pro",
        catalogImages: {
          meteringMode: "credit_balance",
          creditBalance: 5,
          creditCosts: { aiSingle: 2 },
        },
      },
    },
  });

  await assert.rejects(
    generateImportedProductImage(
      {
        db: fake.db,
        restaurantId: "restaurant-1",
        productId: "product-1",
        userId: "owner-1",
        idempotencyKey: "request-credit-failure-1",
        access: PRO_ACCESS,
      },
      {
        generateImage: async () => {
          throw new Error("provider unavailable");
        },
      },
    ),
    /provider unavailable/,
  );

  const restaurant = fake.documents.get("restaurants/restaurant-1");
  const subscription = restaurant?.subscription as Record<string, unknown>;
  const catalogImages = subscription.catalogImages as Record<string, unknown>;
  assert.equal(catalogImages.creditBalance, 5);
  const usage = fake.documents.get(
    "restaurants/restaurant-1/catalogImageUsage/request-credit-failure-1",
  );
  assert.equal(usage?.creditStatus, "released");
  assert.equal(usage?.status, "failed");
  assert.equal(usage?.failureReason, "IMAGE_GENERATION_FAILED");
});

test("an ineligible branded item records a tenant-scoped skipped usage", async () => {
  const fake = fakeGenerationDb({
    productData: importedDish({
      name: "Coca-Cola Zero",
      categoryName: "Refrescos",
    }),
    restaurantData: {
      subscription: {
        plan: "pro",
        catalogImages: {
          meteringMode: "credit_balance",
          creditBalance: 5,
          creditCosts: { aiSingle: 2 },
        },
      },
    },
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

test("bulk generation usage records the bulk capability and durable job id", async () => {
  const fake = fakeGenerationDb({
    productData: importedDish({
      name: "Coca-Cola Zero",
      categoryName: "Refrescos",
    }),
    restaurantData: { subscription: { plan: "ultra" } },
  });

  await generateImportedProductImage({
    db: fake.db,
    restaurantId: "restaurant-1",
    productId: "product-1",
    userId: "owner-1",
    idempotencyKey: "bulk-request-brand-1",
    access: ULTRA_ACCESS,
    usageOperation: "catalog_image_ai_bulk",
    usageCapability: "catalog.image.ai.bulk",
    jobId: "bulk-job-1",
  });

  assert.equal(fake.creates.length, 1);
  assert.equal(fake.creates[0]?.data.operation, "catalog_image_ai_bulk");
  assert.equal(fake.creates[0]?.data.capability, "catalog.image.ai.bulk");
  assert.equal(fake.creates[0]?.data.jobId, "bulk-job-1");
  assert.equal(fake.creates[0]?.data.effectivePlan, "ultra");
});
