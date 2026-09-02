import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { reviewCatalogImageBulkSelection } from "@/lib/server/product-images/review-catalog-image-bulk-selection";

type Stored = Record<string, unknown>;

function memoryFirestore(initial: Record<string, Stored>) {
  const store = new Map(Object.entries(initial));
  function reference(path: string): Record<string, unknown> {
    return {
      path,
      collection: (name: string) => ({
        doc: (id: string) => reference(`${path}/${name}/${id}`),
      }),
      get: async () => {
        const data = store.get(path);
        return {
          exists: data != null,
          data: () => data,
        };
      },
      update: async (patch: Stored) => {
        store.set(path, { ...(store.get(path) ?? {}), ...patch });
      },
    };
  }
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => reference(`${name}/${id}`),
    }),
  } as unknown as Firestore;
  return { db, store };
}

function item(productId: string, overrides: Stored = {}): Stored {
  return {
    restaurantId: "restaurant-a",
    jobId: "bulk-job-123",
    productId,
    status: "needs_review",
    kind: "ai_generate",
    ...overrides,
  };
}

test("bulk review approves eligible items, preserves partial failures and is idempotent", async () => {
  const prefix = "restaurants/restaurant-a/catalogImageJobs/bulk-job-123";
  const { db, store } = memoryFirestore({
    [prefix]: { restaurantId: "restaurant-a", jobId: "bulk-job-123" },
    [`${prefix}/items/product-1`]: item("product-1"),
    [`${prefix}/items/product-2`]: item("product-2"),
  });
  const reviewed: string[] = [];
  const first = await reviewCatalogImageBulkSelection({
    db,
    restaurantId: "restaurant-a",
    jobId: "bulk-job-123",
    productIds: ["product-1", "product-1", "product-2"],
    userId: "owner-a",
    review: async (params) => {
      reviewed.push(params.productId);
      if (params.productId === "product-2") {
        throw Object.assign(new Error("failed"), { code: "PRODUCT_CHANGED" });
      }
      return {} as never;
    },
  });
  assert.deepEqual(reviewed, ["product-1", "product-2"]);
  assert.equal(first.requested, 2);
  assert.equal(first.approved, 1);
  assert.equal(first.failed, 1);
  assert.equal(store.get(`${prefix}/items/product-1`)?.reviewStatus, "approved");
  assert.equal(
    store.get(`${prefix}/items/product-2`)?.reviewFailureReason,
    "PRODUCT_CHANGED",
  );

  const second = await reviewCatalogImageBulkSelection({
    db,
    restaurantId: "restaurant-a",
    jobId: "bulk-job-123",
    productIds: ["product-1"],
    userId: "owner-a",
    review: async () => {
      throw new Error("must not run twice");
    },
  });
  assert.equal(second.alreadyApproved, 1);
  assert.equal(second.failed, 0);

});

test("bulk review refuses unselected catalog candidates, foreign metadata and products outside the job", async () => {
  const prefix = "restaurants/restaurant-a/catalogImageJobs/bulk-job-123";
  const { db } = memoryFirestore({
    [prefix]: { restaurantId: "restaurant-a", jobId: "bulk-job-123" },
    [`${prefix}/items/catalog-1`]: item("catalog-1", { kind: "catalog_search" }),
    [`${prefix}/items/foreign-1`]: item("foreign-1", {
      restaurantId: "restaurant-b",
    }),
  });
  let reviewed = false;
  const result = await reviewCatalogImageBulkSelection({
    db,
    restaurantId: "restaurant-a",
    jobId: "bulk-job-123",
    productIds: ["catalog-1", "foreign-1", "missing-1"],
    userId: "owner-a",
    review: async () => {
      reviewed = true;
      return {} as never;
    },
  });
  assert.equal(reviewed, false);
  assert.equal(result.failed, 3);
  assert.ok(result.results.every((entry) => entry.status === "ineligible"));
});

test("bulk review attaches only a catalog candidate persisted in the tenant job and then approves it", async () => {
  const prefix = "restaurants/restaurant-a/catalogImageJobs/bulk-job-123";
  const { db, store } = memoryFirestore({
    [prefix]: { restaurantId: "restaurant-a", jobId: "bulk-job-123" },
    [`${prefix}/items/catalog-1`]: item("catalog-1", {
      kind: "catalog_search",
      catalogCandidates: [
        { externalReference: "5449000054227" },
        { externalReference: "5449000131805" },
      ],
    }),
  });
  const attached: Array<Record<string, string>> = [];
  const reviewed: string[] = [];
  const first = await reviewCatalogImageBulkSelection({
    db,
    restaurantId: "restaurant-a",
    jobId: "bulk-job-123",
    productIds: [],
    catalogSelections: [
      { productId: "catalog-1", externalReference: "5449000054227" },
    ],
    userId: "owner-a",
    attachCatalog: async (params) => {
      attached.push({
        restaurantId: params.restaurantId,
        productId: params.productId,
        externalReference: params.externalReference,
      });
      return {
        productId: params.productId,
        imageUrl: "https://storage.test/catalog-1.webp",
        imagePath:
          "restaurants/restaurant-a/products/catalog-1/catalog/catalog-1.webp",
        candidate: {} as never,
      };
    },
    review: async (params) => {
      reviewed.push(params.productId);
      return {} as never;
    },
  });
  assert.deepEqual(attached, [
    {
      restaurantId: "restaurant-a",
      productId: "catalog-1",
      externalReference: "5449000054227",
    },
  ]);
  assert.deepEqual(reviewed, ["catalog-1"]);
  assert.equal(first.approved, 1);
  assert.equal(first.failed, 0);
  assert.equal(
    store.get(`${prefix}/items/catalog-1`)?.selectedCatalogReference,
    "5449000054227",
  );
  assert.equal(
    store.get(`${prefix}/items/catalog-1`)?.imageUrl,
    "https://storage.test/catalog-1.webp",
  );
  assert.equal(
    store.get(`${prefix}/items/catalog-1`)?.reviewStatus,
    "approved",
  );

  const second = await reviewCatalogImageBulkSelection({
    db,
    restaurantId: "restaurant-a",
    jobId: "bulk-job-123",
    productIds: [],
    catalogSelections: [
      { productId: "catalog-1", externalReference: "5449000054227" },
    ],
    userId: "owner-a",
    attachCatalog: async () => {
      throw new Error("must not attach twice");
    },
    review: async () => {
      throw new Error("must not review twice");
    },
  });
  assert.equal(second.alreadyApproved, 1);
  assert.equal(second.failed, 0);

  const idempotentDirectApproval = await reviewCatalogImageBulkSelection({
    db,
    restaurantId: "restaurant-a",
    jobId: "bulk-job-123",
    productIds: ["catalog-1"],
    userId: "owner-a",
    review: async () => {
      throw new Error("must not review an approved catalog item twice");
    },
  });
  assert.equal(idempotentDirectApproval.alreadyApproved, 1);
  assert.equal(idempotentDirectApproval.failed, 0);
});

test("bulk catalog review rejects forged references and preserves tenant isolation", async () => {
  const prefix = "restaurants/restaurant-a/catalogImageJobs/bulk-job-123";
  const { db } = memoryFirestore({
    [prefix]: { restaurantId: "restaurant-a", jobId: "bulk-job-123" },
    [`${prefix}/items/catalog-1`]: item("catalog-1", {
      kind: "catalog_search",
      catalogCandidates: [{ externalReference: "5449000054227" }],
    }),
    [`${prefix}/items/foreign-1`]: item("foreign-1", {
      kind: "catalog_search",
      restaurantId: "restaurant-b",
      catalogCandidates: [{ externalReference: "5449000054227" }],
    }),
  });
  let attached = false;
  const result = await reviewCatalogImageBulkSelection({
    db,
    restaurantId: "restaurant-a",
    jobId: "bulk-job-123",
    productIds: [],
    catalogSelections: [
      { productId: "catalog-1", externalReference: "0000000000000" },
      { productId: "foreign-1", externalReference: "5449000054227" },
    ],
    userId: "owner-a",
    attachCatalog: async () => {
      attached = true;
      return {} as never;
    },
  });
  assert.equal(attached, false);
  assert.equal(result.failed, 2);
  assert.deepEqual(
    result.results.map((entry) => entry.error),
    [
      "CATALOG_IMAGE_BULK_CANDIDATE_NOT_FOUND",
      "CATALOG_IMAGE_BULK_ITEM_NOT_APPROVABLE",
    ],
  );
});

test("a catalog attach followed by an approval failure remains recoverable without attaching again", async () => {
  const prefix = "restaurants/restaurant-a/catalogImageJobs/bulk-job-123";
  const { db, store } = memoryFirestore({
    [prefix]: { restaurantId: "restaurant-a", jobId: "bulk-job-123" },
    [`${prefix}/items/catalog-1`]: item("catalog-1", {
      kind: "catalog_search",
      catalogCandidates: [{ externalReference: "5449000054227" }],
    }),
  });
  const first = await reviewCatalogImageBulkSelection({
    db,
    restaurantId: "restaurant-a",
    jobId: "bulk-job-123",
    productIds: [],
    catalogSelections: [
      { productId: "catalog-1", externalReference: "5449000054227" },
    ],
    userId: "owner-a",
    attachCatalog: async (params) => ({
      productId: params.productId,
      imageUrl: "https://storage.test/catalog-1.webp",
      imagePath:
        "restaurants/restaurant-a/products/catalog-1/catalog/catalog-1.webp",
      candidate: {} as never,
    }),
    review: async () => {
      throw Object.assign(new Error("review failed"), {
        code: "PRODUCT_CHANGED",
      });
    },
  });
  assert.equal(first.failed, 1);
  assert.equal(
    store.get(`${prefix}/items/catalog-1`)?.reviewStatus,
    "pending",
  );
  assert.equal(
    store.get(`${prefix}/items/catalog-1`)?.selectedCatalogReference,
    "5449000054227",
  );

  let reviewed = false;
  const recovered = await reviewCatalogImageBulkSelection({
    db,
    restaurantId: "restaurant-a",
    jobId: "bulk-job-123",
    productIds: ["catalog-1"],
    userId: "owner-a",
    attachCatalog: async () => {
      throw new Error("must not attach again");
    },
    review: async () => {
      reviewed = true;
      return {} as never;
    },
  });
  assert.equal(reviewed, true);
  assert.equal(recovered.approved, 1);
  assert.equal(
    store.get(`${prefix}/items/catalog-1`)?.reviewStatus,
    "approved",
  );
});
