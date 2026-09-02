import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  adjustCatalogImageCreditBalance,
  CatalogImageCreditAdminError,
  startCatalogImageCreditPeriod,
} from "@/lib/server/product-images/administer-catalog-image-credits";
import { reconcileExpiredCatalogImageCreditReservations } from "@/lib/server/product-images/reconcile-catalog-image-credits";
import { readCatalogImageCreditSummary } from "@/lib/server/product-images/read-catalog-image-credit-summary";

type Stored = Record<string, unknown>;

function memoryFirestore(initial: Record<string, Stored>) {
  const store = new Map(
    Object.entries(initial).map(([path, value]) => [path, structuredClone(value)]),
  );

  function applyUpdate(path: string, patch: Stored) {
    const next = { ...(store.get(path) ?? {}) };
    for (const [field, value] of Object.entries(patch)) {
      if (field.startsWith("subscription.catalogImages.")) {
        const subscription = { ...((next.subscription as Stored) ?? {}) };
        const catalogImages = { ...((subscription.catalogImages as Stored) ?? {}) };
        const leaf = field.slice("subscription.catalogImages.".length);
        const increment =
          value && typeof value === "object" && "operand" in value &&
          typeof value.operand === "number"
            ? value.operand
            : null;
        catalogImages[leaf] = increment == null
          ? structuredCloneSafe(value)
          : Number(catalogImages[leaf] ?? 0) + increment;
        subscription.catalogImages = catalogImages;
        next.subscription = subscription;
      } else {
        next[field] = structuredCloneSafe(value);
      }
    }
    store.set(path, next);
  }

  function snapshot(path: string) {
    const data = store.get(path);
    return {
      id: path.split("/").at(-1) ?? path,
      ref: reference(path),
      exists: data != null,
      data: () => (data ? structuredClone(data) : undefined),
    };
  }

  function directDocuments(path: string) {
    const prefix = `${path}/`;
    return [...store.keys()]
      .filter((candidate) =>
        candidate.startsWith(prefix) &&
        !candidate.slice(prefix.length).includes("/"),
      )
      .map(snapshot);
  }

  function collection(path: string): Record<string, unknown> {
    return {
      doc: (id: string) => reference(`${path}/${id}`),
      orderBy: (field: string, direction: "asc" | "desc") => ({
        limit: (limit: number) => ({
          get: async () => {
            const docs = directDocuments(path)
              .sort((left, right) => {
                const leftValue = Number((left.data() as Stored)[field] ?? 0);
                const rightValue = Number((right.data() as Stored)[field] ?? 0);
                return direction === "desc"
                  ? rightValue - leftValue
                  : leftValue - rightValue;
              })
              .slice(0, limit);
            return { docs, size: docs.length, empty: docs.length === 0 };
          },
        }),
      }),
      where: (field: string, operator: string, value: unknown) => ({
        limit: (limit: number) => ({
          get: async () => {
            const docs = directDocuments(path)
              .filter((document) => {
                const data = document.data() as Stored;
                return operator === "<=" &&
                  typeof data[field] === "number" &&
                  typeof value === "number" &&
                  data[field] <= value;
              })
              .slice(0, limit);
            return { docs, size: docs.length, empty: docs.length === 0 };
          },
        }),
      }),
    };
  }

  function reference(path: string): Record<string, unknown> {
    return {
      path,
      id: path.split("/").at(-1) ?? path,
      collection: (name: string) => collection(`${path}/${name}`),
      get: async () => snapshot(path),
    };
  }

  const transaction = {
    get: async (ref: { path: string }) => snapshot(ref.path),
    create: (ref: { path: string }, data: Stored) => {
      if (store.has(ref.path)) throw new Error(`already exists: ${ref.path}`);
      store.set(ref.path, structuredCloneSafe(data));
    },
    update: (ref: { path: string }, data: Stored) => applyUpdate(ref.path, data),
  };
  const db = {
    collection: (name: string) => collection(name),
    runTransaction: async (
      callback: (tx: typeof transaction) => Promise<unknown>,
    ) => callback(transaction),
  } as unknown as Firestore;
  return { db, store };
}

function structuredCloneSafe<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

function restaurant(balance: number, period?: Stored): Stored {
  return {
    subscription: {
      plan: "ultra",
      catalogImages: {
        meteringMode: "credit_balance",
        creditBalance: balance,
        creditCosts: { aiSingle: 1, aiBulk: 2, catalogSearch: 1 },
        ...(period ? { creditPeriod: period } : {}),
      },
    },
  };
}

function balance(store: Map<string, Stored>, restaurantId: string): number {
  const subscription = store.get(`restaurants/${restaurantId}`)?.subscription as Stored;
  const catalogImages = subscription.catalogImages as Stored;
  return Number(catalogImages.creditBalance);
}

test("a credit period is opened atomically and the operation is idempotent", async () => {
  const fake = memoryFirestore({
    "restaurants/restaurant-a": restaurant(3),
    "restaurants/restaurant-b": restaurant(80),
  });
  const params = {
    db: fake.db,
    restaurantId: "restaurant-a",
    idempotencyKey: "period-2026-09-a",
    operatorId: "hostly-operator",
    reason: "Inicio del periodo contratado",
    period: { id: "2026-09", startsAt: 100, endsAt: 1_000, allocation: 20 },
    now: 200,
  };
  const first = await startCatalogImageCreditPeriod(params);
  const duplicate = await startCatalogImageCreditPeriod(params);

  assert.deepEqual(first, {
    duplicate: false,
    balanceBefore: 3,
    balanceAfter: 20,
    periodId: "2026-09",
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(balance(fake.store, "restaurant-a"), 20);
  assert.equal(balance(fake.store, "restaurant-b"), 80);
  const ledger = fake.store.get(
    "restaurants/restaurant-a/catalogImageCreditLedger/period-2026-09-a",
  );
  assert.equal(ledger?.delta, 17);
  assert.equal(ledger?.operatorId, "hostly-operator");
  await assert.rejects(
    startCatalogImageCreditPeriod({
      ...params,
      period: { ...params.period, allocation: 21 },
    }),
    (error: unknown) =>
      error instanceof CatalogImageCreditAdminError &&
      error.code === "CREDIT_IDEMPOTENCY_KEY_CONFLICT",
  );
});

test("an active period cannot be silently replaced", async () => {
  const fake = memoryFirestore({
    "restaurants/restaurant-a": restaurant(8, {
      id: "2026-09",
      startsAt: 100,
      endsAt: 1_000,
      allocation: 10,
    }),
  });
  await assert.rejects(
    startCatalogImageCreditPeriod({
      db: fake.db,
      restaurantId: "restaurant-a",
      idempotencyKey: "period-2026-10-a",
      operatorId: "hostly-operator",
      reason: "Cambio de periodo",
      period: { id: "2026-10", startsAt: 150, endsAt: 1_200, allocation: 15 },
      now: 200,
    }),
    (error: unknown) =>
      error instanceof CatalogImageCreditAdminError &&
      error.code === "ACTIVE_CREDIT_PERIOD_REPLACEMENT_REQUIRED",
  );
  assert.equal(balance(fake.store, "restaurant-a"), 8);

  await assert.rejects(
    startCatalogImageCreditPeriod({
      db: fake.db,
      restaurantId: "restaurant-a",
      idempotencyKey: "period-2026-09-repeated",
      operatorId: "hostly-operator",
      reason: "Reinicio accidental",
      period: { id: "2026-09", startsAt: 100, endsAt: 1_000, allocation: 10 },
      replaceActivePeriod: true,
      now: 200,
    }),
    (error: unknown) =>
      error instanceof CatalogImageCreditAdminError &&
      error.code === "CREDIT_PERIOD_ALREADY_EXISTS",
  );
  assert.equal(balance(fake.store, "restaurant-a"), 8);
});

test("balance adjustments require the current period and never overdraw", async () => {
  const fake = memoryFirestore({
    "restaurants/restaurant-a": restaurant(8, {
      id: "2026-09",
      startsAt: 100,
      endsAt: 1_000,
      allocation: 10,
    }),
  });
  await assert.rejects(
    adjustCatalogImageCreditBalance({
      db: fake.db,
      restaurantId: "restaurant-a",
      idempotencyKey: "adjust-wrong-period",
      operatorId: "hostly-operator",
      reason: "Corrección",
      delta: 2,
      expectedPeriodId: "2026-08",
      now: 200,
    }),
    (error: unknown) =>
      error instanceof CatalogImageCreditAdminError &&
      error.code === "CREDIT_PERIOD_MISMATCH",
  );
  await assert.rejects(
    adjustCatalogImageCreditBalance({
      db: fake.db,
      restaurantId: "restaurant-a",
      idempotencyKey: "adjust-overdraw",
      operatorId: "hostly-operator",
      reason: "Corrección",
      delta: -9,
      expectedPeriodId: "2026-09",
      now: 200,
    }),
    (error: unknown) =>
      error instanceof CatalogImageCreditAdminError &&
      error.code === "CREDIT_BALANCE_WOULD_BE_NEGATIVE",
  );
  const applied = await adjustCatalogImageCreditBalance({
    db: fake.db,
    restaurantId: "restaurant-a",
    idempotencyKey: "adjust-topup",
    operatorId: "hostly-operator",
    reason: "Bonificación comercial",
    delta: 2,
    expectedPeriodId: "2026-09",
    now: 200,
  });
  assert.equal(applied.balanceAfter, 10);
  assert.equal(balance(fake.store, "restaurant-a"), 10);
});

test("only expired reservations from the same tenant are released once", async () => {
  const fake = memoryFirestore({
    "restaurants/restaurant-a": restaurant(3, {
      id: "2026-09",
      startsAt: 100,
      endsAt: 1_000,
      allocation: 10,
    }),
    "restaurants/restaurant-a/catalogImageUsage/expired": {
      restaurantId: "restaurant-a",
      status: "processing",
      creditStatus: "reserved",
      creditCost: 2,
      creditPeriodId: "2026-09",
      creditLeaseExpiresAt: 150,
    },
    "restaurants/restaurant-a/catalogImageUsage/fresh": {
      restaurantId: "restaurant-a",
      status: "processing",
      creditStatus: "reserved",
      creditCost: 4,
      creditPeriodId: "2026-09",
      creditLeaseExpiresAt: 300,
    },
    "restaurants/restaurant-b": restaurant(50),
    "restaurants/restaurant-b/catalogImageUsage/foreign": {
      restaurantId: "restaurant-b",
      status: "processing",
      creditStatus: "reserved",
      creditCost: 30,
      creditLeaseExpiresAt: 100,
    },
  });
  const first = await reconcileExpiredCatalogImageCreditReservations({
    db: fake.db,
    restaurantId: "restaurant-a",
    actorId: "owner-a",
    now: 200,
  });
  const second = await reconcileExpiredCatalogImageCreditReservations({
    db: fake.db,
    restaurantId: "restaurant-a",
    actorId: "owner-a",
    now: 200,
  });

  assert.deepEqual(first, { scanned: 1, released: 1, creditsReleased: 2, skipped: 0 });
  assert.deepEqual(second, { scanned: 1, released: 0, creditsReleased: 0, skipped: 1 });
  assert.equal(balance(fake.store, "restaurant-a"), 5);
  assert.equal(balance(fake.store, "restaurant-b"), 50);
  assert.equal(
    fake.store.get("restaurants/restaurant-a/catalogImageUsage/expired")?.creditStatus,
    "released",
  );
  assert.equal(
    fake.store.get("restaurants/restaurant-a/catalogImageUsage/fresh")?.creditStatus,
    "reserved",
  );
});

test("the account summary counts only the authenticated tenant and current period", async () => {
  const fake = memoryFirestore({
    "restaurants/restaurant-a": restaurant(7, {
      id: "2026-09",
      startsAt: 100,
      endsAt: 1_000,
      allocation: 10,
    }),
    "restaurants/restaurant-a/catalogImageUsage/current-consumed": {
      restaurantId: "restaurant-a",
      creditPeriodId: "2026-09",
      operation: "catalog_image_ai_single",
      productId: "dish-1",
      status: "succeeded",
      result: "generated",
      creditStatus: "consumed",
      creditCost: 2,
      createdAt: 300,
    },
    "restaurants/restaurant-a/catalogImageUsage/current-reserved": {
      restaurantId: "restaurant-a",
      creditPeriodId: "2026-09",
      operation: "catalog_image_catalog_search_single",
      productId: "brand-1",
      status: "processing",
      creditStatus: "reserved",
      creditCost: 1,
      createdAt: 250,
    },
    "restaurants/restaurant-a/catalogImageUsage/old-period": {
      restaurantId: "restaurant-a",
      creditPeriodId: "2026-08",
      status: "succeeded",
      creditStatus: "consumed",
      creditCost: 40,
      createdAt: 200,
    },
    "restaurants/restaurant-a/catalogImageUsage/forged-tenant": {
      restaurantId: "restaurant-b",
      creditPeriodId: "2026-09",
      status: "succeeded",
      creditStatus: "consumed",
      creditCost: 50,
      createdAt: 400,
    },
  });
  const summary = await readCatalogImageCreditSummary({
    db: fake.db,
    restaurantId: "restaurant-a",
  });
  assert.equal(summary.access.creditBalance, 7);
  assert.equal(summary.period?.id, "2026-09");
  assert.deepEqual(summary.usage, {
    operations: 2,
    succeeded: 1,
    failed: 0,
    blocked: 0,
    consumedCredits: 2,
    reservedCredits: 1,
    releasedCredits: 0,
  });
  assert.deepEqual(
    summary.recentUsage.map((item) => item.id),
    ["current-consumed", "current-reserved"],
  );
});
