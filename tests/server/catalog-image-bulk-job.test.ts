import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { HOSTLY_CATALOG_IMAGE_BULK_POLICY } from "@/lib/productos/catalog-image-plan";
import {
  controlCatalogImageBulkJob,
  createCatalogImageBulkJob,
  processNextCatalogImageBulkItem,
  readCatalogImageBulkJob,
  reconcileCatalogImageBulkControlOperation,
} from "@/lib/server/product-images/catalog-image-bulk";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";

const ULTRA_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "ultra" },
});

const METERED_ULTRA_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: {
    plan: "ultra",
    catalogImages: {
      meteringMode: "credit_balance",
      creditBalance: 3,
      creditCosts: { aiBulk: 2, catalogSearch: 2 },
    },
  },
});

type Stored = Record<string, unknown>;
type QueryState = {
  path: string;
  filters: Array<{ field: string; value: unknown }>;
  order?: { field: string; direction: "asc" | "desc" };
  limit?: number;
};

function memoryFirestore(initial: Record<string, Stored>) {
  const store = new Map<string, Stored>(
    Object.entries(initial).map(([path, data]) => [path, structuredClone(data)]),
  );

  const directDocs = (path: string) => {
    const prefix = `${path}/`;
    return [...store.entries()]
      .filter(([candidate]) => {
        if (!candidate.startsWith(prefix)) return false;
        return !candidate.slice(prefix.length).includes("/");
      })
      .map(([candidate, data]) => snapshot(candidate, data));
  };

  const runQuery = (query: QueryState) => {
    let docs = directDocs(query.path).filter((doc) =>
      query.filters.every((filter) => doc.get(filter.field) === filter.value),
    );
    if (query.order) {
      const { field, direction } = query.order;
      docs = docs.sort((left, right) => {
        const a = left.get(field);
        const b = right.get(field);
        const compared = typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a ?? "").localeCompare(String(b ?? ""));
        return direction === "desc" ? -compared : compared;
      });
    }
    if (query.limit != null) docs = docs.slice(0, query.limit);
    return { docs, empty: docs.length === 0, size: docs.length };
  };

  const applyUpdate = (path: string, patch: Stored) => {
    const current = store.get(path) ?? {};
    const next = { ...current };
    for (const [key, value] of Object.entries(patch)) {
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
        next[key] = structuredCloneSafe(value);
      }
    }
    store.set(path, next);
  };

  function snapshot(path: string, data?: Stored) {
    const id = path.split("/").at(-1) ?? path;
    const ref = reference(path);
    return {
      id,
      ref,
      exists: data != null,
      data: () => (data == null ? undefined : structuredClone(data)),
      get: (field: string) => data?.[field],
    };
  }

  function query(state: QueryState): Record<string, unknown> {
    return {
      __query: state,
      where: (field: string, operator: string, value: unknown) => {
        assert.equal(operator, "==");
        return query({
          ...state,
          filters: [...state.filters, { field, value }],
        });
      },
      orderBy: (field: string, direction: "asc" | "desc" = "asc") =>
        query({ ...state, order: { field, direction } }),
      limit: (value: number) => query({ ...state, limit: value }),
      get: async () => runQuery(state),
      doc: (id: string) => reference(`${state.path}/${id}`),
    };
  }

  function reference(path: string): Record<string, unknown> {
    return {
      path,
      id: path.split("/").at(-1) ?? path,
      collection: (name: string) =>
        query({ path: `${path}/${name}`, filters: [] }),
      get: async () => snapshot(path, store.get(path)),
      set: async (data: Stored) => store.set(path, structuredCloneSafe(data)),
      update: async (data: Stored) => applyUpdate(path, data),
    };
  }

  const transaction = {
    get: async (target: Record<string, unknown>) => {
      const state = target.__query as QueryState | undefined;
      if (state) return runQuery(state);
      const path = String(target.path);
      return snapshot(path, store.get(path));
    },
    create: (ref: Record<string, unknown>, data: Stored) => {
      const path = String(ref.path);
      if (store.has(path)) throw new Error(`already exists: ${path}`);
      store.set(path, structuredCloneSafe(data));
    },
    set: (ref: Record<string, unknown>, data: Stored) =>
      store.set(String(ref.path), structuredCloneSafe(data)),
    update: (ref: Record<string, unknown>, data: Stored) =>
      applyUpdate(String(ref.path), data),
  };

  let transactionTail = Promise.resolve();
  const runSerializedTransaction = async (
    callback: (tx: typeof transaction) => Promise<unknown>,
  ) => {
    const previous = transactionTail;
    let release = () => {};
    transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await callback(transaction);
    } finally {
      release();
    }
  };

  const db = {
    collection: (name: string) =>
      query({ path: name, filters: [] }),
    runTransaction: runSerializedTransaction,
    batch: () => {
      const writes: Array<() => void> = [];
      return {
        set: (ref: Record<string, unknown>, data: Stored) =>
          writes.push(() => store.set(String(ref.path), structuredCloneSafe(data))),
        update: (ref: Record<string, unknown>, data: Stored) =>
          writes.push(() => applyUpdate(String(ref.path), data)),
        commit: async () => {
          writes.forEach((write) => write());
        },
      };
    },
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

function dish(name: string): Stored {
  return {
    name,
    categoryName: "Entrantes",
    tipoVenta: "plato",
    productFamilyType: "food",
  };
}

test("job creation is tenant-scoped and idempotent", async () => {
  const { db, store } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
    "restaurants/restaurant-a/products/brand-1": {
      ...dish("Coca-Cola Zero"),
      categoryName: "Refrescos",
    },
    "restaurants/restaurant-b/products/foreign-1": dish("Producto ajeno"),
  });

  const first = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-idempotent-1",
    access: ULTRA_ACCESS,
  });
  const second = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-idempotent-1",
    access: ULTRA_ACCESS,
  });

  assert.equal(first.jobId, second.jobId);
  assert.equal(first.counters.total, 2);
  assert.equal(
    [...store.keys()].filter((path) =>
      path.startsWith(
        "restaurants/restaurant-a/catalogImageJobs/bulk-idempotent-1/items/",
      ),
    ).length,
    2,
  );
  assert.equal(
    [...store.keys()].some((path) => path.includes("foreign-1")),
    true,
  );
  assert.equal(
    [...store.keys()].some((path) =>
      path.includes("catalogImageJobs") && path.includes("foreign-1"),
    ),
    false,
  );
});

test("different request keys reuse the single active job for the tenant", async () => {
  const { db, store } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
  });

  const [first, duplicateConfirmation] = await Promise.all([
    createCatalogImageBulkJob({
      db,
      restaurantId: "restaurant-a",
      userId: "owner-a",
      idempotencyKey: "bulk-active-first",
      access: ULTRA_ACCESS,
    }),
    createCatalogImageBulkJob({
      db,
      restaurantId: "restaurant-a",
      userId: "owner-a",
      idempotencyKey: "bulk-active-second",
      access: ULTRA_ACCESS,
    }),
  ]);

  assert.equal(first.status, "queued");
  assert.equal(duplicateConfirmation.jobId, first.jobId);
  assert.equal(
    [...store.keys()].filter((path) =>
      /^restaurants\/restaurant-a\/catalogImageJobs\/bulk-active-[^/]+$/.test(
        path,
      ),
    ).length,
    1,
  );
  assert.equal(
    store.has(
      "restaurants/restaurant-a/catalogImageJobs/bulk-active-second",
    ),
    false,
  );
  assert.equal(
    store.get(
      "restaurants/restaurant-a/catalogImageJobControls/active",
    )?.activeJobId,
    first.jobId,
  );
});

test("a terminal job allows a new active job for the same tenant", async () => {
  const { db, store } = memoryFirestore({
    "restaurants/restaurant-a/products/approved-1": {
      ...dish("Croquetas"),
      imageUrl: "https://example.test/approved.webp",
      imageEnrichment: {
        source: "manual_upload",
        reviewStatus: "approved",
        locked: true,
      },
    },
  });

  const completed = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-terminal-first",
    access: ULTRA_ACCESS,
  });
  assert.equal(completed.status, "completed");
  store.set(
    "restaurants/restaurant-a/products/dish-2",
    dish("Pasta fresca"),
  );

  const next = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-terminal-second",
    access: ULTRA_ACCESS,
  });

  assert.equal(next.jobId, "bulk-terminal-second");
  assert.equal(next.status, "queued");
  assert.equal(
    store.get(
      "restaurants/restaurant-a/catalogImageJobControls/active",
    )?.activeJobId,
    next.jobId,
  );
});

test("active job coordination remains isolated between restaurants", async () => {
  const { db, store } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
    "restaurants/restaurant-b/products/dish-1": dish("Ensalada"),
  });

  const [restaurantA, restaurantB] = await Promise.all([
    createCatalogImageBulkJob({
      db,
      restaurantId: "restaurant-a",
      userId: "owner-a",
      idempotencyKey: "bulk-tenant-a",
      access: ULTRA_ACCESS,
    }),
    createCatalogImageBulkJob({
      db,
      restaurantId: "restaurant-b",
      userId: "owner-b",
      idempotencyKey: "bulk-tenant-b",
      access: ULTRA_ACCESS,
    }),
  ]);

  assert.equal(restaurantA.jobId, "bulk-tenant-a");
  assert.equal(restaurantB.jobId, "bulk-tenant-b");
  assert.equal(
    store.get(
      "restaurants/restaurant-a/catalogImageJobControls/active",
    )?.activeJobId,
    restaurantA.jobId,
  );
  assert.equal(
    store.get(
      "restaurants/restaurant-b/catalogImageJobControls/active",
    )?.activeJobId,
    restaurantB.jobId,
  );
});

test("a legacy active job is adopted before creating a replacement", async () => {
  const { db, store } = memoryFirestore({
    "restaurants/restaurant-a/catalogImageJobs/bulk-legacy-paused": {
      schemaVersion: 1,
      restaurantId: "restaurant-a",
      jobId: "bulk-legacy-paused",
      status: "paused",
      createdAt: 1,
      updatedAt: 2,
      createdBy: "owner-a",
      counters: {
        total: 1,
        pending: 1,
        processing: 0,
        completed: 0,
        needsReview: 0,
        failed: 0,
        skipped: 0,
        cancelled: 0,
      },
    },
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
  });

  const adopted = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-new-request",
    access: ULTRA_ACCESS,
  });

  assert.equal(adopted.jobId, "bulk-legacy-paused");
  assert.equal(adopted.status, "paused");
  assert.equal(adopted.queueRevision, 0);
  assert.equal(
    store.has("restaurants/restaurant-a/catalogImageJobs/bulk-new-request"),
    false,
  );
  assert.equal(
    store.get(
      "restaurants/restaurant-a/catalogImageJobControls/active",
    )?.activeJobId,
    adopted.jobId,
  );
});

test("an expired legacy preparation is recovered under its original job id", async () => {
  const { db, store } = memoryFirestore({
    "restaurants/restaurant-a/catalogImageJobs/bulk-legacy-stale": {
      schemaVersion: 1,
      restaurantId: "restaurant-a",
      jobId: "bulk-legacy-stale",
      status: "preparing",
      createdAt: 1,
      updatedAt: 1,
      createdBy: "owner-a",
      counters: {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        needsReview: 0,
        failed: 0,
        skipped: 0,
        cancelled: 0,
      },
    },
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
  });

  const recovered = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-recovery",
    idempotencyKey: "bulk-new-after-stale",
    access: ULTRA_ACCESS,
  });

  assert.equal(recovered.jobId, "bulk-legacy-stale");
  assert.equal(recovered.status, "queued");
  assert.equal(recovered.queueRevision, 1);
  assert.equal(
    store.has(
      "restaurants/restaurant-a/catalogImageJobs/bulk-new-after-stale",
    ),
    false,
  );
  assert.equal(
    store.get(
      "restaurants/restaurant-a/catalogImageJobs/bulk-legacy-stale",
    )?.recoveredBy,
    "owner-recovery",
  );
});

test("an interrupted preparing job is safely rebuilt with the same idempotency key", async () => {
  const { db } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
    "restaurants/restaurant-a/catalogImageJobs/bulk-recover-1": {
      schemaVersion: 1,
      restaurantId: "restaurant-a",
      jobId: "bulk-recover-1",
      status: "preparing",
      createdAt: 1,
      updatedAt: 1,
      createdBy: "owner-a",
      counters: {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        needsReview: 0,
        failed: 0,
        skipped: 0,
        cancelled: 0,
      },
    },
  });

  const recovered = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-recover-1",
    access: ULTRA_ACCESS,
  });
  assert.equal(recovered.status, "queued");
  assert.equal(recovered.counters.pending, 1);
  const state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: recovered.jobId,
  });
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].productId, "dish-1");
});

test("an active preparation lease prevents a replay from rebuilding the job", async () => {
  const now = Date.now();
  const { db } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
    "restaurants/restaurant-a/catalogImageJobs/bulk-preparing-live": {
      schemaVersion: 1,
      restaurantId: "restaurant-a",
      jobId: "bulk-preparing-live",
      status: "preparing",
      createdAt: now,
      updatedAt: now,
      preparationLeaseExpiresAt:
        now + HOSTLY_CATALOG_IMAGE_BULK_POLICY.preparationLeaseMs,
      createdBy: "owner-a",
      counters: {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        needsReview: 0,
        failed: 0,
        skipped: 0,
        cancelled: 0,
      },
    },
  });

  const replayed = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-preparing-live",
    access: ULTRA_ACCESS,
  });

  assert.equal(replayed.status, "preparing");
  assert.equal(replayed.counters.pending, 0);
  const state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: replayed.jobId,
  });
  assert.equal(state.items.length, 0);
});

test("an existing pending image is persisted in the review gallery", async () => {
  const { db } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": {
      ...dish("Croquetas"),
      imageUrl: "https://example.test/pending-croquetas.webp",
      imagePath:
        "restaurants/restaurant-a/products/dish-1/ai/pending-croquetas.webp",
      imageEnrichment: {
        source: "ai_generated",
        reviewStatus: "pending",
        locked: false,
      },
    },
  });
  const created = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-pending-1",
    access: ULTRA_ACCESS,
  });
  assert.equal(created.queueRevision, 1);
  const state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
  });
  assert.equal(state.job.status, "completed");
  assert.equal(state.job.queueRevision, 1);
  assert.equal(state.items[0].kind, "pending_review");
  assert.equal(
    state.items[0].imageUrl,
    "https://example.test/pending-croquetas.webp",
  );
});

test("partial failures persist, can be retried, and never publish automatically", async () => {
  const { db } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
    "restaurants/restaurant-a/products/dish-2": dish("Pasta fresca"),
  });
  const created = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-partial-1",
    access: ULTRA_ACCESS,
  });
  assert.equal(created.queueRevision, 1);

  await processNextCatalogImageBulkItem({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    userId: "owner-a",
    access: ULTRA_ACCESS,
    generate: async (params) => {
      if (params.productId === "dish-1") {
        const error = new Error("provider failed") as Error & { code: string };
        error.code = "IMAGE_PROVIDER_FAILED";
        throw error;
      }
      return {
        outcome: "generated",
        productId: params.productId,
        imageUrl: "https://example.test/pending.webp",
        imagePath: `restaurants/restaurant-a/products/${params.productId}/ai/pending.webp`,
        model: "test-model",
      };
    },
  });
  await processNextCatalogImageBulkItem({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    userId: "owner-a",
    access: ULTRA_ACCESS,
    generate: async (params) => ({
      outcome: "generated",
      productId: params.productId,
      imageUrl: "https://example.test/pending.webp",
      imagePath: `restaurants/restaurant-a/products/${params.productId}/ai/pending.webp`,
      model: "test-model",
    }),
  });

  let state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
  });
  assert.equal(state.job.status, "completed");
  assert.equal(state.job.queueRevision, 3);
  assert.equal(state.job.counters.failed, 1);
  assert.equal(state.job.counters.needsReview, 1);
  assert.equal(state.items.find((item) => item.productId === "dish-2")?.status, "needs_review");

  await controlCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    action: "retry_failed",
  });
  state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
  });
  assert.equal(state.job.status, "queued");
  assert.equal(state.job.queueRevision, 4);
  assert.equal(state.job.counters.failed, 0);
  assert.equal(state.job.counters.pending, 1);

  await processNextCatalogImageBulkItem({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    userId: "owner-a",
    access: ULTRA_ACCESS,
    generate: async (params) => ({
      outcome: "generated",
      productId: params.productId,
      imageUrl: "https://example.test/retried.webp",
      imagePath: `restaurants/restaurant-a/products/${params.productId}/ai/retried.webp`,
      model: "test-model",
    }),
  });
  state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
  });
  assert.equal(state.job.status, "completed");
  assert.equal(state.job.queueRevision, 5);
  assert.equal(state.job.counters.failed, 0);
  assert.equal(state.job.counters.needsReview, 2);
});

test("concurrent failed retries reset counters and queue revision only once", async () => {
  const { db } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
  });
  const created = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-retry-race-1",
    access: ULTRA_ACCESS,
  });
  await processNextCatalogImageBulkItem({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    userId: "owner-a",
    access: ULTRA_ACCESS,
    generate: async () => {
      throw new Error("provider failed");
    },
  });

  const before = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
  });
  await Promise.all([
    controlCatalogImageBulkJob({
      db,
      restaurantId: "restaurant-a",
      jobId: created.jobId,
      action: "retry_failed",
    }),
    controlCatalogImageBulkJob({
      db,
      restaurantId: "restaurant-a",
      jobId: created.jobId,
      action: "retry_failed",
    }),
  ]);

  const state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
  });
  assert.equal(state.job.status, "queued");
  assert.equal(state.job.queueRevision, before.job.queueRevision + 1);
  assert.equal(state.job.counters.pending, 1);
  assert.equal(state.job.counters.failed, 0);
  assert.equal(state.items[0].status, "pending");
});

test("a retry resumes safely after item writes completed but counters did not", async () => {
  const { db, store } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
  });
  const created = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-retry-recovery-1",
    access: ULTRA_ACCESS,
  });
  const jobPath = `restaurants/restaurant-a/catalogImageJobs/${created.jobId}`;
  const itemPath = `${jobPath}/items/dish-1`;
  const job = store.get(jobPath);
  const item = store.get(itemPath);
  assert.ok(job);
  assert.ok(item);
  store.set(jobPath, {
    ...job,
    status: "paused",
    counters: { ...created.counters, pending: 0, failed: 1 },
    controlOperation: {
      action: "retry_failed",
      itemCount: 1,
      startedAt: Date.now(),
    },
  });
  store.set(itemPath, { ...item, status: "pending", failureReason: undefined });

  const recovered = await controlCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    action: "retry_failed",
  });

  assert.equal(recovered.status, "queued");
  assert.equal(recovered.queueRevision, created.queueRevision + 1);
  assert.equal(recovered.counters.pending, 1);
  assert.equal(recovered.counters.failed, 0);
});

test("an exact expired control token recovers automatically but a fresh token waits", async () => {
  const { db, store } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
  });
  const created = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-auto-control-recovery-1",
    access: ULTRA_ACCESS,
  });
  const jobPath = `restaurants/restaurant-a/catalogImageJobs/${created.jobId}`;
  const itemPath = `${jobPath}/items/dish-1`;
  const storedJob = store.get(jobPath);
  const storedItem = store.get(itemPath);
  assert.ok(storedJob);
  assert.ok(storedItem);
  const startedAt = 50_000;
  const operationId = "control-auto-retry-123";
  store.set(jobPath, {
    ...storedJob,
    status: "paused",
    counters: { ...created.counters, pending: 0, failed: 1 },
    controlOperation: {
      action: "retry_failed",
      itemCount: 1,
      startedAt,
      operationId,
    },
  });
  store.set(itemPath, { ...storedItem, status: "pending" });

  const fresh = await reconcileCatalogImageBulkControlOperation({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    operationId,
    now:
      startedAt +
      HOSTLY_CATALOG_IMAGE_BULK_POLICY.controlRecoveryDelayMs -
      1,
  });
  assert.equal(fresh.status, "pending");
  assert.equal(fresh.retryAfterMs, 1);

  const recovered = await reconcileCatalogImageBulkControlOperation({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    operationId,
    now:
      startedAt +
      HOSTLY_CATALOG_IMAGE_BULK_POLICY.controlRecoveryDelayMs,
  });
  assert.equal(recovered.status, "reconciled");
  assert.equal(recovered.job.status, "queued");
  assert.equal(recovered.job.queueRevision, created.queueRevision + 1);
  assert.equal(recovered.job.counters.pending, 1);
  assert.equal(recovered.job.counters.failed, 0);

  const obsolete = await reconcileCatalogImageBulkControlOperation({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    operationId,
    now:
      startedAt +
      HOSTLY_CATALOG_IMAGE_BULK_POLICY.controlRecoveryDelayMs,
  });
  assert.equal(obsolete.status, "superseded");
});

test("concurrent cancellation is idempotent and can finish an interrupted control", async () => {
  const { db, store } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
    "restaurants/restaurant-a/products/dish-2": dish("Pasta fresca"),
  });
  const created = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-cancel-race-1",
    access: ULTRA_ACCESS,
  });
  await Promise.all([
    controlCatalogImageBulkJob({
      db,
      restaurantId: "restaurant-a",
      jobId: created.jobId,
      action: "cancel",
    }),
    controlCatalogImageBulkJob({
      db,
      restaurantId: "restaurant-a",
      jobId: created.jobId,
      action: "cancel",
    }),
  ]);
  let state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
  });
  assert.equal(state.job.status, "cancelled");
  assert.equal(state.job.counters.pending, 0);
  assert.equal(state.job.counters.cancelled, 2);
  assert.deepEqual(state.items.map((item) => item.status), ["cancelled", "cancelled"]);

  const recoveryCreated = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-cancel-recovery-1",
    access: ULTRA_ACCESS,
  });
  const jobPath = `restaurants/restaurant-a/catalogImageJobs/${recoveryCreated.jobId}`;
  const job = store.get(jobPath);
  assert.ok(job);
  store.set(jobPath, {
    ...job,
    status: "paused",
    controlOperation: {
      action: "cancel",
      itemCount: 2,
      startedAt: Date.now(),
    },
  });
  for (const productId of ["dish-1", "dish-2"]) {
    const itemPath = `${jobPath}/items/${productId}`;
    const item = store.get(itemPath);
    assert.ok(item);
    store.set(itemPath, { ...item, status: "cancelled" });
  }
  const recovered = await controlCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: recoveryCreated.jobId,
    action: "cancel",
  });
  assert.equal(recovered.status, "cancelled");
  assert.equal(recovered.counters.pending, 0);
  assert.equal(recovered.counters.cancelled, 2);

  state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: recoveryCreated.jobId,
  });
  assert.deepEqual(state.items.map((item) => item.status), ["cancelled", "cancelled"]);
});

test("cancel and retry controls cannot overtake an item already processing", async () => {
  const { db } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
    "restaurants/restaurant-a/products/dish-2": dish("Pasta fresca"),
  });
  const created = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-processing-race-1",
    access: ULTRA_ACCESS,
  });
  await processNextCatalogImageBulkItem({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    userId: "owner-a",
    access: ULTRA_ACCESS,
    generate: async () => {
      throw new Error("first item failed");
    },
  });

  let releaseGeneration = () => {};
  let markProcessing = () => {};
  const processingStarted = new Promise<void>((resolve) => {
    markProcessing = resolve;
  });
  const generationBlocked = new Promise<void>((resolve) => {
    releaseGeneration = resolve;
  });
  const processing = processNextCatalogImageBulkItem({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    userId: "owner-a",
    access: ULTRA_ACCESS,
    generate: async (params) => {
      markProcessing();
      await generationBlocked;
      return {
        outcome: "generated",
        productId: params.productId,
        imageUrl: "https://example.test/second.webp",
        imagePath: `restaurants/restaurant-a/products/${params.productId}/ai/second.webp`,
        model: "test-model",
      };
    },
  });
  await processingStarted;

  for (const action of ["cancel", "retry_failed"] as const) {
    await assert.rejects(
      controlCatalogImageBulkJob({
        db,
        restaurantId: "restaurant-a",
        jobId: created.jobId,
        action,
      }),
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "CATALOG_IMAGE_BULK_ITEM_PROCESSING",
        ),
    );
  }

  releaseGeneration();
  await processing;
  const state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
  });
  assert.equal(state.job.status, "completed");
  assert.equal(state.job.counters.processing, 0);
  assert.equal(state.job.counters.failed, 1);
  assert.equal(state.job.counters.needsReview, 1);
});

test("catalog search results are recorded as reviewable usage, not attached blindly", async () => {
  const { db, store } = memoryFirestore({
    "restaurants/restaurant-a/products/brand-1": {
      ...dish("Fanta Naranja"),
      categoryName: "Refrescos",
      barcode: "5449000054227",
    },
  });
  const created = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-catalog-1",
    access: ULTRA_ACCESS,
  });
  assert.equal(created.queueRevision, 1);
  await processNextCatalogImageBulkItem({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    userId: "owner-a",
    access: ULTRA_ACCESS,
    search: async () => ({
      query: "5449000054227",
      candidates: [
        {
          provider: "open_food_facts",
          externalReference: "5449000054227",
          productName: "Fanta Orange",
          brand: "Fanta",
          quantity: "330 ml",
          imageUrl:
            "https://images.openfoodfacts.org/images/products/544/900/005/4227/front_es.1.400.jpg",
          thumbnailUrl:
            "https://images.openfoodfacts.org/images/products/544/900/005/4227/front_es.1.200.jpg",
          sourceUrl: "https://world.openfoodfacts.org/product/5449000054227",
          confidence: 1,
          matchLevel: "strong",
          warnings: [],
          license: "CC BY-SA 3.0",
          attribution: "Open Food Facts contributors",
        },
      ],
      provider: "open_food_facts",
      attribution: "Open Food Facts contributors",
      license: "CC BY-SA 3.0",
    }),
  });

  const state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
  });
  assert.equal(state.items[0].status, "needs_review");
  assert.equal(state.items[0].candidateCount, 1);
  assert.match(state.items[0].imageUrl ?? "", /images\.openfoodfacts\.org/);
  assert.equal(state.items[0].catalogCandidates[0]?.externalReference, "5449000054227");
  assert.equal(
    state.items[0].catalogCandidates[0]?.sourceUrl,
    "https://world.openfoodfacts.org/product/5449000054227",
  );
  assert.equal(
    state.items[0].catalogCandidates[0]?.attribution,
    "Open Food Facts contributors",
  );
  const usage = [...store.entries()].find(([path]) =>
    path.startsWith("restaurants/restaurant-a/catalogImageUsage/"),
  )?.[1];
  assert.equal(usage?.operation, "catalog_image_catalog_search_bulk");
  assert.equal(usage?.capability, "catalog.image.catalogSearch");
  assert.equal(usage?.result, "candidates");
});

test("bulk catalog search consumes the configured tenant credit atomically", async () => {
  const restaurant = {
    subscription: {
      plan: "ultra",
      catalogImages: {
        meteringMode: "credit_balance",
        creditBalance: 3,
        creditCosts: { aiBulk: 2, catalogSearch: 2 },
      },
    },
  };
  const { db, store } = memoryFirestore({
    "restaurants/restaurant-a": restaurant,
    "restaurants/restaurant-a/products/brand-1": {
      ...dish("Fanta Naranja"),
      categoryName: "Refrescos",
      barcode: "5449000054227",
    },
  });
  const created = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-credit-catalog-1",
    access: METERED_ULTRA_ACCESS,
  });
  assert.equal(created.estimate.mode, "credit_balance");
  assert.equal(created.estimate.credits, 2);

  await processNextCatalogImageBulkItem({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    userId: "owner-a",
    access: METERED_ULTRA_ACCESS,
    search: async () => ({
      query: "5449000054227",
      candidates: [],
      provider: "open_food_facts",
      attribution: "Open Food Facts contributors",
      license: "CC BY-SA 3.0",
    }),
  });

  const storedRestaurant = store.get("restaurants/restaurant-a");
  const subscription = storedRestaurant?.subscription as Record<string, unknown>;
  const catalogImages = subscription.catalogImages as Record<string, unknown>;
  assert.equal(catalogImages.creditBalance, 1);
  const usage = [...store.entries()].find(([path]) =>
    path.startsWith("restaurants/restaurant-a/catalogImageUsage/"),
  )?.[1];
  assert.equal(usage?.creditStatus, "consumed");
  assert.equal(usage?.creditCost, 2);
  assert.equal(usage?.creditBalanceBefore, 3);
  assert.equal(usage?.creditBalanceAfter, 1);
});

test("bulk catalog search stops before the provider when credits are insufficient", async () => {
  const restaurant = {
    subscription: {
      plan: "ultra",
      catalogImages: {
        meteringMode: "credit_balance",
        creditBalance: 1,
        creditCosts: { aiBulk: 2, catalogSearch: 2 },
      },
    },
  };
  const access = resolveCatalogImageAccessFromRestaurant(restaurant);
  const { db, store } = memoryFirestore({
    "restaurants/restaurant-a": restaurant,
    "restaurants/restaurant-a/products/brand-1": {
      ...dish("Fanta Naranja"),
      categoryName: "Refrescos",
      barcode: "5449000054227",
    },
  });
  const created = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-credit-blocked-1",
    access,
  });
  let providerCalls = 0;

  await processNextCatalogImageBulkItem({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    userId: "owner-a",
    access,
    search: async () => {
      providerCalls += 1;
      throw new Error("must not run");
    },
  });

  assert.equal(providerCalls, 0);
  const state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
  });
  assert.equal(state.items[0].status, "failed");
  assert.equal(
    state.items[0].failureReason,
    "CATALOG_IMAGE_CREDITS_EXHAUSTED",
  );
  const usage = [...store.entries()].find(([path]) =>
    path.startsWith("restaurants/restaurant-a/catalogImageUsage/"),
  )?.[1];
  assert.equal(usage?.creditStatus, "blocked");
  const storedRestaurant = store.get("restaurants/restaurant-a");
  const subscription = storedRestaurant?.subscription as Record<string, unknown>;
  const catalogImages = subscription.catalogImages as Record<string, unknown>;
  assert.equal(catalogImages.creditBalance, 1);
});

test("jobs can pause, resume and cancel without losing persisted pending work", async () => {
  const { db } = memoryFirestore({
    "restaurants/restaurant-a/products/dish-1": dish("Croquetas"),
  });
  const created = await createCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    userId: "owner-a",
    idempotencyKey: "bulk-control-1",
    access: ULTRA_ACCESS,
  });
  assert.equal(created.queueRevision, 1);
  const paused = await controlCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    action: "pause",
  });
  assert.equal(paused.status, "paused");
  assert.equal(paused.queueRevision, 1);

  const whilePaused = await processNextCatalogImageBulkItem({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    userId: "owner-a",
    access: ULTRA_ACCESS,
    generate: async () => {
      throw new Error("must not run while paused");
    },
  });
  assert.equal(whilePaused.processed, false);
  assert.equal(whilePaused.job.counters.pending, 1);

  const resumed = await controlCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    action: "resume",
  });
  assert.equal(resumed.status, "queued");
  assert.equal(resumed.queueRevision, 2);
  const cancelled = await controlCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    action: "cancel",
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.queueRevision, 2);
  assert.equal(cancelled.counters.pending, 0);
  assert.equal(cancelled.counters.cancelled, 1);
});
