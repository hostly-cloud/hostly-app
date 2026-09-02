import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  controlCatalogImageBulkJob,
  createCatalogImageBulkJob,
  processNextCatalogImageBulkItem,
  readCatalogImageBulkJob,
} from "@/lib/server/product-images/catalog-image-bulk";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";

const ULTRA_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "ultra" },
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
    store.set(path, { ...current, ...structuredCloneSafe(patch) });
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

  const db = {
    collection: (name: string) =>
      query({ path: name, filters: [] }),
    runTransaction: async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
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
  const state = await readCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
  });
  assert.equal(state.job.status, "completed");
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
  assert.equal(state.job.counters.failed, 0);
  assert.equal(state.job.counters.needsReview, 2);
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
  const usage = [...store.entries()].find(([path]) =>
    path.startsWith("restaurants/restaurant-a/catalogImageUsage/"),
  )?.[1];
  assert.equal(usage?.operation, "catalog_image_catalog_search_bulk");
  assert.equal(usage?.capability, "catalog.image.ai.bulk");
  assert.equal(usage?.result, "candidates");
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
  const paused = await controlCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    action: "pause",
  });
  assert.equal(paused.status, "paused");

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
  const cancelled = await controlCatalogImageBulkJob({
    db,
    restaurantId: "restaurant-a",
    jobId: created.jobId,
    action: "cancel",
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.counters.pending, 0);
  assert.equal(cancelled.counters.cancelled, 1);
});
