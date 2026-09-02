import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import type { CatalogImageBulkJob } from "@/lib/productos/catalog-image-bulk-contract";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";
import {
  CatalogImageBulkQueueMessageError,
  CatalogImageBulkQueueRetryError,
  catalogImageBulkQueueRetryDecision,
  processCatalogImageBulkQueueMessage,
} from "@/lib/server/product-images/catalog-image-bulk-queue";

const ULTRA_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "ultra" },
});
const PRO_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "pro" },
});
const db = {} as Firestore;

function job(overrides: Partial<CatalogImageBulkJob> = {}): CatalogImageBulkJob {
  return {
    jobId: "bulk-job-123",
    status: "queued",
    queueRevision: 1,
    createdAt: 1,
    updatedAt: 20,
    createdBy: "owner-from-job",
    summary: {
      totalProducts: 2,
      withoutApprovedImage: 2,
      aiGenerable: 2,
      catalogSearchable: 0,
      manualReview: 0,
      pendingReview: 0,
      alreadyProcessing: 0,
      existingImage: 0,
    },
    estimate: {
      aiGenerationRequests: 2,
      catalogSearchRequests: 0,
      credits: null,
      costUsd: null,
      mode: "usage_recorded",
      note: "Uso registrado",
    },
    counters: {
      total: 2,
      pending: 2,
      processing: 0,
      completed: 0,
      needsReview: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
    },
    activeProductId: null,
    failureReason: null,
    ...overrides,
  };
}

test("queue worker resolves current Ultra access, uses the stored creator and chains one item", async () => {
  let processedUser = "";
  let enqueued:
    | { restaurantId: string; jobId: string; revision: number }
    | undefined;
  const result = await processCatalogImageBulkQueueMessage(
    { restaurantId: "restaurant-a", jobId: "bulk-job-123" },
    {
      db,
      readJob: async () => ({ job: job(), items: [] }),
      resolveAccess: async () => ULTRA_ACCESS,
      processNext: async (params) => {
        processedUser = params.userId;
        return {
          processed: true,
          job: job({
            status: "running",
            updatedAt: 42,
            queueRevision: 7,
            counters: { ...job().counters, pending: 1, needsReview: 1 },
          }),
        };
      },
      enqueue: async (params) => {
        enqueued = params;
      },
    },
  );
  assert.equal(processedUser, "owner-from-job");
  assert.deepEqual(enqueued, {
    restaurantId: "restaurant-a",
    jobId: "bulk-job-123",
    revision: 7,
  });
  assert.deepEqual(result, { processed: true, requeued: true, status: "running" });
});

test("queue worker pauses a job after an Ultra downgrade without processing", async () => {
  let processed = false;
  let controlledTenant = "";
  const result = await processCatalogImageBulkQueueMessage(
    { restaurantId: "restaurant-a", jobId: "bulk-job-123" },
    {
      db,
      readJob: async () => ({ job: job(), items: [] }),
      resolveAccess: async () => PRO_ACCESS,
      processNext: async () => {
        processed = true;
        return { processed: true, job: job() };
      },
      controlJob: async (params) => {
        controlledTenant = params.restaurantId;
        return job({ status: "paused" });
      },
    },
  );
  assert.equal(processed, false);
  assert.equal(controlledTenant, "restaurant-a");
  assert.deepEqual(result, { processed: false, requeued: false, status: "paused" });
});

test("queue worker retries instead of acknowledging active leased work", async () => {
  let enqueued = false;
  await assert.rejects(
    processCatalogImageBulkQueueMessage(
      { restaurantId: "restaurant-a", jobId: "bulk-job-123" },
      {
        db,
        readJob: async () => ({ job: job(), items: [] }),
        resolveAccess: async () => ULTRA_ACCESS,
        processNext: async () => ({
          processed: false,
          job: job({
            status: "running",
            counters: {
              ...job().counters,
              pending: 1,
              processing: 1,
            },
          }),
        }),
        enqueue: async () => {
          enqueued = true;
        },
      },
    ),
    CatalogImageBulkQueueRetryError,
  );
  assert.equal(enqueued, false);
});

test("queue retry policy acknowledges malformed messages and backs off recoverable failures", () => {
  assert.deepEqual(
    catalogImageBulkQueueRetryDecision(
      new CatalogImageBulkQueueMessageError("INVALID_MESSAGE"),
      1,
    ),
    { acknowledge: true },
  );
  assert.deepEqual(
    catalogImageBulkQueueRetryDecision(
      new CatalogImageBulkQueueRetryError("bulk-job-123"),
      1,
    ),
    { afterSeconds: 5 },
  );
  assert.deepEqual(
    catalogImageBulkQueueRetryDecision(new Error("FIRESTORE_UNAVAILABLE"), 20),
    { afterSeconds: 60 },
  );
});

test("queue worker ignores terminal jobs and rejects unsafe message ids", async () => {
  let resolved = false;
  const terminal = await processCatalogImageBulkQueueMessage(
    { restaurantId: "restaurant-a", jobId: "bulk-job-123" },
    {
      db,
      readJob: async () => ({ job: job({ status: "completed" }), items: [] }),
      resolveAccess: async () => {
        resolved = true;
        return ULTRA_ACCESS;
      },
    },
  );
  assert.equal(resolved, false);
  assert.deepEqual(terminal, {
    processed: false,
    requeued: false,
    status: "completed",
  });
  await assert.rejects(
    processCatalogImageBulkQueueMessage(
      { restaurantId: "../restaurant-b", jobId: "bulk-job-123" },
      { db },
    ),
    /INVALID_CATALOG_IMAGE_BULK_QUEUE_RESTAURANT_ID/,
  );
});
