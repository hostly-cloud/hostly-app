import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import {
  getFirestore as getAdminFirestore,
  type Firestore,
} from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type {
  CatalogImageBulkItemStatus,
  CatalogImageBulkJobCounters,
  CatalogImageBulkJobStatus,
} from "@/lib/productos/catalog-image-bulk-contract";
import {
  controlCatalogImageBulkJob,
  processNextCatalogImageBulkItem,
  readCatalogImageBulkJob,
} from "@/lib/server/product-images/catalog-image-bulk";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";

const PROJECT_ID = "demo-hostly-catalog-image-controls";
const RESTAURANT_A = "restaurant-control-a";
const RESTAURANT_B = "restaurant-control-b";
const ULTRA_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "ultra" },
});

let testEnv: RulesTestEnvironment;
let adminApp: App;
let adminDb: Firestore;

type ItemSeed = {
  productId: string;
  status: CatalogImageBulkItemStatus;
  attempts?: number;
};

function counters(
  values: Partial<CatalogImageBulkJobCounters>,
): CatalogImageBulkJobCounters {
  return {
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    needsReview: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    ...values,
  };
}

function jobRef(restaurantId: string, jobId: string) {
  return adminDb
    .collection("restaurants")
    .doc(restaurantId)
    .collection("catalogImageJobs")
    .doc(jobId);
}

async function seedJob(params: {
  restaurantId?: string;
  jobId: string;
  status: CatalogImageBulkJobStatus;
  queueRevision: number;
  counters: CatalogImageBulkJobCounters;
  items: ItemSeed[];
  controlOperation?: {
    action: "retry_failed" | "cancel";
    itemCount: number;
    startedAt: number;
  };
}) {
  const restaurantId = params.restaurantId ?? RESTAURANT_A;
  const ref = jobRef(restaurantId, params.jobId);
  const now = Date.now();
  await ref.set({
    schemaVersion: 1,
    restaurantId,
    jobId: params.jobId,
    status: params.status,
    queueRevision: params.queueRevision,
    createdAt: now,
    updatedAt: now,
    createdBy: "owner-control-a",
    summary: {
      totalProducts: params.counters.total,
      withoutApprovedImage: params.counters.total,
      aiGenerable: params.counters.total,
      catalogSearchable: 0,
      manualReview: 0,
      pendingReview: 0,
      alreadyProcessing: 0,
      existingImage: 0,
    },
    estimate: {
      aiGenerationRequests: params.counters.total,
      catalogSearchRequests: 0,
      credits: null,
      costUsd: null,
      mode: "usage_recorded",
      note: "Prueba de integración",
    },
    counters: params.counters,
    ...(params.controlOperation
      ? { controlOperation: params.controlOperation }
      : {}),
  });
  const batch = adminDb.batch();
  params.items.forEach((item, index) => {
    batch.set(ref.collection("items").doc(item.productId), {
      schemaVersion: 1,
      restaurantId,
      jobId: params.jobId,
      productId: item.productId,
      productName: `Producto ${index + 1}`,
      kind: "ai_generate",
      status: item.status,
      attempts: item.attempts ?? 0,
      createdAt: now + index,
      updatedAt: now + index,
    });
  });
  await batch.commit();
}

async function storedJob(restaurantId: string, jobId: string) {
  const snapshot = await jobRef(restaurantId, jobId).get();
  assert.equal(snapshot.exists, true);
  return snapshot.data() as Record<string, unknown>;
}

describe("catalog image bulk controls with Firestore Emulator", () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
    adminApp = initializeApp({ projectId: PROJECT_ID }, "catalog-image-controls-admin");
    adminDb = getAdminFirestore(adminApp);
    adminDb.settings({ ignoreUndefinedProperties: true });
  });

  after(async () => {
    await testEnv.cleanup();
    await deleteApp(adminApp);
  });

  test("concurrent retries apply one counter transition and one queue revision", async () => {
    const jobId = "bulk-emulator-retry-1";
    await seedJob({
      jobId,
      status: "completed",
      queueRevision: 7,
      counters: counters({ total: 2, failed: 2 }),
      items: [
        { productId: "retry-dish-1", status: "failed", attempts: 1 },
        { productId: "retry-dish-2", status: "failed", attempts: 1 },
      ],
    });

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        controlCatalogImageBulkJob({
          db: adminDb,
          restaurantId: RESTAURANT_A,
          jobId,
          action: "retry_failed",
        }),
      ),
    );

    assert.equal(results.every((job) => job.status === "queued"), true);
    const state = await readCatalogImageBulkJob({
      db: adminDb,
      restaurantId: RESTAURANT_A,
      jobId,
    });
    assert.equal(state.job.queueRevision, 8);
    assert.equal(state.job.counters.pending, 2);
    assert.equal(state.job.counters.failed, 0);
    assert.deepEqual(state.items.map((item) => item.status), ["pending", "pending"]);
    assert.equal((await storedJob(RESTAURANT_A, jobId)).controlOperation, undefined);
  });

  test("concurrent cancellation is idempotent and isolated by restaurant", async () => {
    const jobId = "bulk-emulator-cancel-1";
    await Promise.all([
      seedJob({
        restaurantId: RESTAURANT_A,
        jobId,
        status: "queued",
        queueRevision: 4,
        counters: counters({ total: 3, pending: 3 }),
        items: [
          { productId: "cancel-dish-1", status: "pending" },
          { productId: "cancel-dish-2", status: "pending" },
          { productId: "cancel-dish-3", status: "pending" },
        ],
      }),
      seedJob({
        restaurantId: RESTAURANT_B,
        jobId,
        status: "queued",
        queueRevision: 9,
        counters: counters({ total: 1, pending: 1 }),
        items: [{ productId: "foreign-dish-1", status: "pending" }],
      }),
    ]);

    await Promise.all(
      Array.from({ length: 12 }, () =>
        controlCatalogImageBulkJob({
          db: adminDb,
          restaurantId: RESTAURANT_A,
          jobId,
          action: "cancel",
        }),
      ),
    );

    const [stateA, stateB] = await Promise.all([
      readCatalogImageBulkJob({
        db: adminDb,
        restaurantId: RESTAURANT_A,
        jobId,
      }),
      readCatalogImageBulkJob({
        db: adminDb,
        restaurantId: RESTAURANT_B,
        jobId,
      }),
    ]);
    assert.equal(stateA.job.status, "cancelled");
    assert.equal(stateA.job.queueRevision, 4);
    assert.equal(stateA.job.counters.pending, 0);
    assert.equal(stateA.job.counters.cancelled, 3);
    assert.deepEqual(stateA.items.map((item) => item.status), [
      "cancelled",
      "cancelled",
      "cancelled",
    ]);
    assert.equal(stateB.job.status, "queued");
    assert.equal(stateB.job.queueRevision, 9);
    assert.equal(stateB.job.counters.pending, 1);
    assert.equal(stateB.items[0]?.status, "pending");
  });

  test("cancel and retry cannot overtake a real active worker lease", async () => {
    const jobId = "bulk-emulator-processing-1";
    await seedJob({
      jobId,
      status: "queued",
      queueRevision: 2,
      counters: counters({ total: 2, pending: 1, failed: 1 }),
      items: [
        { productId: "processing-dish", status: "pending" },
        { productId: "failed-dish", status: "failed", attempts: 1 },
      ],
    });
    let signalStarted = () => {};
    let releaseGeneration = () => {};
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    const worker = processNextCatalogImageBulkItem({
      db: adminDb,
      restaurantId: RESTAURANT_A,
      jobId,
      userId: "owner-control-a",
      access: ULTRA_ACCESS,
      generate: async (params) => {
        signalStarted();
        await blocked;
        return {
          outcome: "generated",
          productId: params.productId,
          imageUrl: "https://example.test/processing.webp",
          imagePath: `restaurants/${RESTAURANT_A}/products/${params.productId}/ai/processing.webp`,
          model: "test-model",
        };
      },
    });
    await started;

    try {
      for (const action of ["cancel", "retry_failed"] as const) {
        await assert.rejects(
          controlCatalogImageBulkJob({
            db: adminDb,
            restaurantId: RESTAURANT_A,
            jobId,
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
    } finally {
      releaseGeneration();
    }
    await worker;

    const state = await readCatalogImageBulkJob({
      db: adminDb,
      restaurantId: RESTAURANT_A,
      jobId,
    });
    assert.equal(state.job.status, "completed");
    assert.equal(state.job.counters.processing, 0);
    assert.equal(state.job.counters.failed, 1);
    assert.equal(state.job.counters.needsReview, 1);
  });

  test("an interrupted retry and cancellation finish from their persisted barriers", async () => {
    const retryJobId = "bulk-emulator-retry-recovery";
    const cancelJobId = "bulk-emulator-cancel-recovery";
    await Promise.all([
      seedJob({
        jobId: retryJobId,
        status: "paused",
        queueRevision: 5,
        counters: counters({ total: 1, failed: 1 }),
        items: [{ productId: "retry-recovered", status: "pending", attempts: 1 }],
        controlOperation: {
          action: "retry_failed",
          itemCount: 1,
          startedAt: Date.now(),
        },
      }),
      seedJob({
        jobId: cancelJobId,
        status: "paused",
        queueRevision: 6,
        counters: counters({ total: 1, pending: 1 }),
        items: [{ productId: "cancel-recovered", status: "cancelled" }],
        controlOperation: {
          action: "cancel",
          itemCount: 1,
          startedAt: Date.now(),
        },
      }),
    ]);

    const [retried, cancelled] = await Promise.all([
      controlCatalogImageBulkJob({
        db: adminDb,
        restaurantId: RESTAURANT_A,
        jobId: retryJobId,
        action: "retry_failed",
      }),
      controlCatalogImageBulkJob({
        db: adminDb,
        restaurantId: RESTAURANT_A,
        jobId: cancelJobId,
        action: "cancel",
      }),
    ]);

    assert.equal(retried.status, "queued");
    assert.equal(retried.queueRevision, 6);
    assert.equal(retried.counters.pending, 1);
    assert.equal(retried.counters.failed, 0);
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.queueRevision, 6);
    assert.equal(cancelled.counters.pending, 0);
    assert.equal(cancelled.counters.cancelled, 1);
  });

  test("simultaneous worker and cancel races always end in one consistent terminal state", async () => {
    const jobIds = Array.from(
      { length: 8 },
      (_, index) => `bulk-emulator-worker-cancel-${index}`,
    );
    await Promise.all(
      jobIds.map((jobId, index) =>
        seedJob({
          jobId,
          status: "queued",
          queueRevision: index + 1,
          counters: counters({ total: 1, pending: 1 }),
          items: [{ productId: `race-dish-${index}`, status: "pending" }],
        }),
      ),
    );

    await Promise.all(
      jobIds.map(async (jobId, index) => {
        const outcomes = await Promise.allSettled([
          processNextCatalogImageBulkItem({
            db: adminDb,
            restaurantId: RESTAURANT_A,
            jobId,
            userId: "owner-control-a",
            access: ULTRA_ACCESS,
            generate: async (params) => ({
              outcome: "generated",
              productId: params.productId,
              imageUrl: `https://example.test/race-${index}.webp`,
              imagePath: `restaurants/${RESTAURANT_A}/products/${params.productId}/ai/race.webp`,
              model: "test-model",
            }),
          }),
          controlCatalogImageBulkJob({
            db: adminDb,
            restaurantId: RESTAURANT_A,
            jobId,
            action: "cancel",
          }),
        ]);
        assert.equal(outcomes[0]?.status, "fulfilled");
        const state = await readCatalogImageBulkJob({
          db: adminDb,
          restaurantId: RESTAURANT_A,
          jobId,
        });
        assert.equal(state.job.counters.pending, 0);
        assert.equal(state.job.counters.processing, 0);
        assert.equal(
          state.job.counters.needsReview + state.job.counters.cancelled,
          1,
        );
        assert.equal(["completed", "cancelled"].includes(state.job.status), true);
        assert.equal(
          state.items[0]?.status,
          state.job.status === "cancelled" ? "cancelled" : "needs_review",
        );
      }),
    );
  });
});
