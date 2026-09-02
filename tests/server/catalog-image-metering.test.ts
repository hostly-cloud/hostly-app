import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  finalizeCatalogImageOperation,
  reserveCatalogImageOperation,
} from "@/lib/server/product-images/meter-catalog-image-operation";

type Stored = Record<string, unknown>;

function meteringDb(balance: number) {
  const restaurantPath = "restaurants/restaurant-a";
  const otherPath = "restaurants/restaurant-b";
  const store = new Map<string, Stored>([
    [
      restaurantPath,
      {
        subscription: {
          plan: "pro",
          catalogImages: {
            meteringMode: "credit_balance",
            creditBalance: balance,
            creditCosts: { catalogSearch: 2 },
          },
        },
      },
    ],
    [
      otherPath,
      {
        subscription: {
          plan: "pro",
          catalogImages: {
            meteringMode: "credit_balance",
            creditBalance: 99,
            creditCosts: { catalogSearch: 2 },
          },
        },
      },
    ],
  ]);
  const ref = (path: string): Record<string, unknown> => ({
    path,
    collection: (name: string) => ({
      doc: (id: string) => ref(`${path}/${name}/${id}`),
    }),
  });
  const snapshot = (path: string) => {
    const data = store.get(path);
    return { exists: data != null, data: () => data };
  };
  const update = (path: string, patch: Stored) => {
    const current = store.get(path) ?? {};
    const next = { ...current };
    for (const [key, value] of Object.entries(patch)) {
      if (key === "subscription.catalogImages.creditBalance") {
        const subscription = {
          ...((next.subscription as Stored) ?? {}),
        };
        const catalogImages = {
          ...((subscription.catalogImages as Stored) ?? {}),
        };
        const increment =
          value &&
          typeof value === "object" &&
          "operand" in value &&
          typeof value.operand === "number"
            ? value.operand
            : null;
        const currentBalance = Number(catalogImages.creditBalance ?? 0);
        catalogImages.creditBalance =
          increment == null ? value : currentBalance + increment;
        subscription.catalogImages = catalogImages;
        next.subscription = subscription;
      } else {
        next[key] = value;
      }
    }
    store.set(path, next);
  };
  const transaction = {
    get: async (reference: { path: string }) => snapshot(reference.path),
    create: (reference: { path: string }, data: Stored) => {
      assert.equal(store.has(reference.path), false);
      store.set(reference.path, { ...data });
    },
    update: (reference: { path: string }, data: Stored) =>
      update(reference.path, data),
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
    }),
    runTransaction: async (
      callback: (value: typeof transaction) => Promise<unknown>,
    ) => callback(transaction),
  } as unknown as Firestore;
  const balanceAt = (path = restaurantPath) => {
    const restaurant = store.get(path);
    const subscription = restaurant?.subscription as Stored;
    const catalogImages = subscription.catalogImages as Stored;
    return catalogImages.creditBalance;
  };
  return { db, store, balanceAt, otherPath };
}

const operation = {
  restaurantId: "restaurant-a",
  productId: "product-a",
  userId: "owner-a",
  capability: "catalog.image.catalogSearch" as const,
  operation: "catalog_image_catalog_search_single",
  provider: "open_food_facts",
};

test("metering reserves and consumes credits inside the authenticated tenant", async () => {
  const fake = meteringDb(5);
  const idempotencyKey = "catalog-meter-success-1";
  await reserveCatalogImageOperation({
    db: fake.db,
    ...operation,
    idempotencyKey,
  });
  assert.equal(fake.balanceAt(), 3);
  assert.equal(fake.balanceAt(fake.otherPath), 99);

  await finalizeCatalogImageOperation({
    db: fake.db,
    restaurantId: operation.restaurantId,
    idempotencyKey,
    result: "candidates",
    succeeded: true,
    metadata: { candidateCount: 1 },
  });
  assert.equal(fake.balanceAt(), 3);
  const usage = fake.store.get(
    `restaurants/restaurant-a/catalogImageUsage/${idempotencyKey}`,
  );
  assert.equal(usage?.creditStatus, "consumed");
  assert.equal(usage?.creditCost, 2);
  assert.equal(usage?.candidateCount, 1);
});

test("metering releases a reservation after a failed provider operation", async () => {
  const fake = meteringDb(5);
  const idempotencyKey = "catalog-meter-failure-1";
  await reserveCatalogImageOperation({
    db: fake.db,
    ...operation,
    idempotencyKey,
  });
  await finalizeCatalogImageOperation({
    db: fake.db,
    restaurantId: operation.restaurantId,
    idempotencyKey,
    result: "failed",
    succeeded: false,
    failureReason: "CATALOG_PROVIDER_TIMEOUT",
  });

  assert.equal(fake.balanceAt(), 5);
  const usage = fake.store.get(
    `restaurants/restaurant-a/catalogImageUsage/${idempotencyKey}`,
  );
  assert.equal(usage?.creditStatus, "released");
  assert.equal(usage?.failureReason, "CATALOG_PROVIDER_TIMEOUT");
});

test("metering blocks insufficient credit without touching another tenant", async () => {
  const fake = meteringDb(1);
  const idempotencyKey = "catalog-meter-blocked-1";
  await assert.rejects(
    reserveCatalogImageOperation({
      db: fake.db,
      ...operation,
      idempotencyKey,
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CATALOG_IMAGE_CREDITS_EXHAUSTED",
  );

  assert.equal(fake.balanceAt(), 1);
  assert.equal(fake.balanceAt(fake.otherPath), 99);
  const usage = fake.store.get(
    `restaurants/restaurant-a/catalogImageUsage/${idempotencyKey}`,
  );
  assert.equal(usage?.creditStatus, "blocked");
  assert.equal(usage?.result, "blocked");
});
