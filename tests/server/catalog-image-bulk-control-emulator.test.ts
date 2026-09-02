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
import { CATALOG_IMAGE_BULK_QUEUE_RETRY_EXHAUSTED } from "@/lib/productos/catalog-image-bulk-contract";
import { HOSTLY_CATALOG_IMAGE_BULK_POLICY } from "@/lib/productos/catalog-image-plan";
import {
  controlCatalogImageBulkJob,
  processNextCatalogImageBulkItem,
  quarantineCatalogImageBulkJob,
  readCatalogImageBulkJob,
  reconcileCatalogImageBulkControlOperation,
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
    operationId?: string;
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

  test("exhausted queue delivery pauses one tenant idempotently and resume clears the visible reason", async () => {
    const jobId = "bulk-emulator-quarantine-1";
    await Promise.all([
      seedJob({
        restaurantId: RESTAURANT_A,
        jobId,
        status: "running",
        queueRevision: 6,
        counters: counters({ total: 2, pending: 2 }),
        items: [
          { productId: "quarantine-dish-1", status: "pending" },
          { productId: "quarantine-dish-2", status: "pending" },
        ],
      }),
      seedJob({
        restaurantId: RESTAURANT_B,
        jobId,
        status: "queued",
        queueRevision: 11,
        counters: counters({ total: 1, pending: 1 }),
        items: [{ productId: "foreign-quarantine-dish", status: "pending" }],
      }),
    ]);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        quarantineCatalogImageBulkJob({
          db: adminDb,
          restaurantId: RESTAURANT_A,
          jobId,
          deliveryCount: 12,
        }),
      ),
    );
    assert.equal(results.filter((result) => result.quarantined).length, 1);

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
    assert.equal(stateA.job.status, "paused");
    assert.equal(
      stateA.job.failureReason,
      CATALOG_IMAGE_BULK_QUEUE_RETRY_EXHAUSTED,
    );
    assert.equal(stateA.job.queueRevision, 6);
    assert.equal(stateA.job.counters.pending, 2);
    assert.equal(stateB.job.status, "queued");
    assert.equal(stateB.job.queueRevision, 11);
    assert.equal(stateB.job.failureReason, null);

    const resumed = await controlCatalogImageBulkJob({
      db: adminDb,
      restaurantId: RESTAURANT_A,
      jobId,
      action: "resume",
    });
    assert.equal(resumed.status, "queued");
    assert.equal(resumed.queueRevision, 7);
    assert.equal(resumed.failureReason, null);
    const stored = await storedJob(RESTAURANT_A, jobId);
    assert.equal(stored.queueDeliveryCount, 12);
    assert.equal(typeof stored.queueQuarantinedAt, "number");
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

  test("an expired retry control recovers automatically and remains tenant-isolated", async () => {
    const jobId = "bulk-emulator-auto-retry";
    const operationId = "control-auto-retry-123";
    const startedAt = 10_000;
    await Promise.all([
      seedJob({
        restaurantId: RESTAURANT_A,
        jobId,
        status: "paused",
        queueRevision: 11,
        counters: counters({ total: 2, failed: 2 }),
        items: [
          { productId: "auto-retry-1", status: "pending", attempts: 1 },
          { productId: "auto-retry-2", status: "failed", attempts: 1 },
        ],
        controlOperation: {
          action: "retry_failed",
          itemCount: 2,
          startedAt,
          operationId,
        },
      }),
      seedJob({
        restaurantId: RESTAURANT_B,
        jobId,
        status: "paused",
        queueRevision: 19,
        counters: counters({ total: 1, failed: 1 }),
        items: [
          { productId: "foreign-auto-retry", status: "failed", attempts: 1 },
        ],
        controlOperation: {
          action: "retry_failed",
          itemCount: 1,
          startedAt,
          operationId: "foreign-control-operation-123",
        },
      }),
    ]);

    const recovery = await reconcileCatalogImageBulkControlOperation({
      db: adminDb,
      restaurantId: RESTAURANT_A,
      jobId,
      operationId,
      now:
        startedAt +
        HOSTLY_CATALOG_IMAGE_BULK_POLICY.controlRecoveryDelayMs,
    });

    assert.equal(recovery.status, "reconciled");
    assert.equal(recovery.job.status, "queued");
    assert.equal(recovery.job.queueRevision, 12);
    assert.equal(recovery.job.counters.pending, 2);
    assert.equal(recovery.job.counters.failed, 0);
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
    assert.deepEqual(stateA.items.map((item) => item.status), ["pending", "pending"]);
    assert.equal((await storedJob(RESTAURANT_A, jobId)).controlOperation, undefined);
    assert.equal(stateB.job.status, "paused");
    assert.equal(stateB.job.queueRevision, 19);
    assert.equal(stateB.items[0]?.status, "failed");
    assert.ok((await storedJob(RESTAURANT_B, jobId)).controlOperation);
  });

  test("fresh and superseded recovery messages cannot take over a control", async () => {
    const jobId = "bulk-emulator-auto-fresh";
    const operationId = "control-auto-fresh-123";
    const startedAt = 20_000;
    await seedJob({
      jobId,
      status: "paused",
      queueRevision: 3,
      counters: counters({ total: 1, failed: 1 }),
      items: [{ productId: "fresh-retry", status: "pending", attempts: 1 }],
      controlOperation: {
        action: "retry_failed",
        itemCount: 1,
        startedAt,
        operationId,
      },
    });

    const superseded = await reconcileCatalogImageBulkControlOperation({
      db: adminDb,
      restaurantId: RESTAURANT_A,
      jobId,
      operationId: "obsolete-control-operation-123",
      now:
        startedAt +
        HOSTLY_CATALOG_IMAGE_BULK_POLICY.controlRecoveryDelayMs,
    });
    const fresh = await reconcileCatalogImageBulkControlOperation({
      db: adminDb,
      restaurantId: RESTAURANT_A,
      jobId,
      operationId,
      now:
        startedAt +
        HOSTLY_CATALOG_IMAGE_BULK_POLICY.controlRecoveryDelayMs -
        1,
    });

    assert.equal(superseded.status, "superseded");
    assert.equal(fresh.status, "pending");
    assert.equal(fresh.retryAfterMs, 1);
    const stored = await storedJob(RESTAURANT_A, jobId);
    assert.equal(stored.status, "paused");
    assert.equal(stored.queueRevision, 3);
    assert.deepEqual(stored.controlOperation, {
      action: "retry_failed",
      itemCount: 1,
      startedAt,
      operationId,
    });
  });

  test("concurrent automatic cancellation recovery applies counters once", async () => {
    const jobId = "bulk-emulator-auto-cancel";
    const operationId = "control-auto-cancel-123";
    const startedAt = 30_000;
    await seedJob({
      jobId,
      status: "paused",
      queueRevision: 7,
      counters: counters({ total: 3, pending: 3 }),
      items: [
        { productId: "auto-cancel-1", status: "cancelled" },
        { productId: "auto-cancel-2", status: "pending" },
        { productId: "auto-cancel-3", status: "pending" },
      ],
      controlOperation: {
        action: "cancel",
        itemCount: 3,
        startedAt,
        operationId,
      },
    });

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        reconcileCatalogImageBulkControlOperation({
          db: adminDb,
          restaurantId: RESTAURANT_A,
          jobId,
          operationId,
          now:
            startedAt +
            HOSTLY_CATALOG_IMAGE_BULK_POLICY.controlRecoveryDelayMs,
        }),
      ),
    );

    assert.equal(
      results.filter((result) => result.status === "reconciled").length,
      1,
    );
    const state = await readCatalogImageBulkJob({
      db: adminDb,
      restaurantId: RESTAURANT_A,
      jobId,
    });
    assert.equal(state.job.status, "cancelled");
    assert.equal(state.job.queueRevision, 7);
    assert.equal(state.job.counters.pending, 0);
    assert.equal(state.job.counters.cancelled, 3);
    assert.deepEqual(state.items.map((item) => item.status), [
      "cancelled",
      "cancelled",
      "cancelled",
    ]);
    assert.equal((await storedJob(RESTAURANT_A, jobId)).controlOperation, undefined);
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
