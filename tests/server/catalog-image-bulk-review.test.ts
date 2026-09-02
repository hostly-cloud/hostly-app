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

test("bulk review refuses catalog candidates, foreign metadata and products outside the job", async () => {
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
