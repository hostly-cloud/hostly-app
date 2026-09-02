import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  buildManualProductImageEnrichment,
  buildPendingAutomaticProductImageEnrichment,
} from "@/lib/carta/product-image-enrichment";
import {
  analyzeCatalogImageBulk,
  classifyCatalogImageBulkProduct,
} from "@/lib/server/product-images/catalog-image-bulk";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";

const ULTRA_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "ultra" },
});

function dish(overrides: Record<string, unknown> = {}) {
  return {
    name: "Croquetas caseras",
    categoryName: "Entrantes",
    tipoVenta: "plato",
    productFamilyType: "food",
    ...overrides,
  };
}

test("bulk classification sends generic dishes to AI", () => {
  assert.deepEqual(classifyCatalogImageBulkProduct("dish-1", dish(), 1_000), {
    productId: "dish-1",
    productName: "Croquetas caseras",
    kind: "ai_generate",
    status: "pending",
  });
});

test("bulk classification sends brands, beverages, barcode products and wines to real catalog search", () => {
  for (const data of [
    dish({ name: "Coca-Cola Zero", categoryName: "Refrescos" }),
    dish({ name: "Agua con gas", tipoVenta: "bebida" }),
    dish({ name: "Conserva premium", barcode: "8410000000000" }),
    dish({ name: "Reserva de la casa", wineProducer: "Bodega Ejemplo" }),
  ]) {
    assert.equal(
      classifyCatalogImageBulkProduct("brand-1", data, 1_000).kind,
      "catalog_search",
    );
  }
});

test("ambiguous products require human review instead of a fabricated image", () => {
  assert.deepEqual(
    classifyCatalogImageBulkProduct(
      "ambiguous-1",
      { name: "Servicio especial", categoryName: "Otros", tipoVenta: "otro" },
      1_000,
    ),
    {
      productId: "ambiguous-1",
      productName: "Servicio especial",
      kind: "manual_review",
      status: "needs_review",
    },
  );
});

test("approved, manual and legacy images are skipped while pending automatic images remain reviewable", () => {
  for (const imageData of [
    { imageUrl: "https://example.test/legacy.webp" },
    {
      imageUrl: "https://example.test/manual.webp",
      imageEnrichment: buildManualProductImageEnrichment(),
    },
    {
      imageUrl: "https://example.test/approved.webp",
      imageEnrichment: {
        ...buildPendingAutomaticProductImageEnrichment({ source: "ai_generated" }),
        reviewStatus: "approved",
        locked: true,
      },
    },
  ]) {
    assert.equal(
      classifyCatalogImageBulkProduct("covered-1", dish(imageData), 1_000).kind,
      "existing_image",
    );
  }

  assert.deepEqual(
    classifyCatalogImageBulkProduct(
      "pending-1",
      dish({
        imageUrl: "https://example.test/pending.webp",
        imageEnrichment: buildPendingAutomaticProductImageEnrichment({
          source: "ai_generated",
        }),
      }),
      1_000,
    ),
    {
      productId: "pending-1",
      productName: "Croquetas caseras",
      kind: "pending_review",
      status: "needs_review",
    },
  );

  assert.equal(
    classifyCatalogImageBulkProduct(
      "rejected-1",
      dish({
        imageUrl: "https://example.test/rejected.webp",
        imageEnrichment: {
          ...buildPendingAutomaticProductImageEnrichment({
            source: "ai_generated",
          }),
          reviewStatus: "rejected",
        },
      }),
      1_000,
    ).kind,
    "ai_generate",
  );
});

test("an active per-product lock prevents duplicate bulk work", () => {
  assert.equal(
    classifyCatalogImageBulkProduct(
      "locked-1",
      dish({
        imageGenerationInProgress: {
          requestId: "existing-request",
          startedAt: 900,
        },
      }),
      1_000,
    ).kind,
    "already_processing",
  );
});

test("preflight reads only the server-scoped restaurant product collection", async () => {
  const reads: string[] = [];
  const docs = [
    { id: "dish-1", data: () => dish() },
    {
      id: "brand-1",
      data: () => dish({ name: "Fanta Naranja", categoryName: "Refrescos" }),
    },
    {
      id: "covered-1",
      data: () => dish({ imageUrl: "https://example.test/image.webp" }),
    },
  ];
  const node = (path: string): Record<string, unknown> => ({
    collection: (name: string) => node(`${path}/${name}`),
    doc: (id: string) => node(`${path}/${id}`),
    get: async () => {
      reads.push(path);
      return { docs };
    },
  });
  const db = {
    collection: (name: string) => node(name),
  } as unknown as Firestore;

  const result = await analyzeCatalogImageBulk({
    db,
    restaurantId: "restaurant-server",
    access: ULTRA_ACCESS,
  });

  assert.deepEqual(reads, ["restaurants/restaurant-server/products"]);
  assert.equal(result.summary.totalProducts, 3);
  assert.equal(result.summary.withoutApprovedImage, 2);
  assert.equal(result.summary.aiGenerable, 1);
  assert.equal(result.summary.catalogSearchable, 1);
  assert.equal(result.summary.existingImage, 1);
  assert.equal(result.estimate.credits, null);
  assert.equal(result.estimate.costUsd, null);
});
