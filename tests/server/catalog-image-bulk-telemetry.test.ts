import assert from "node:assert/strict";
import test from "node:test";
import type { MessageMetadata } from "@vercel/queue";
import {
  CatalogImageBulkQueueMessageError,
  CatalogImageBulkQueueRetryError,
} from "@/lib/server/product-images/catalog-image-bulk-queue";
import {
  handleCatalogImageBulkQueueDelivery,
  type CatalogImageBulkQueueLogEntry,
} from "@/lib/server/product-images/catalog-image-bulk-telemetry";

function metadata(overrides: Partial<MessageMetadata> = {}): MessageMetadata {
  return {
    messageId: "message-123",
    deliveryCount: 2,
    createdAt: new Date(1_000),
    expiresAt: new Date(101_000),
    topicName: "catalog-image-bulk",
    consumerGroup: "catalog-image-bulk-consumer",
    region: "cdg1",
    ...overrides,
  };
}

function recorder() {
  const entries: CatalogImageBulkQueueLogEntry[] = [];
  return {
    entries,
    writeLog: (
      _level: CatalogImageBulkQueueLogEntry["level"],
      entry: CatalogImageBulkQueueLogEntry,
    ) => entries.push(entry),
  };
}

test("queue telemetry correlates a successful control recovery without catalog content", async () => {
  const recorded = recorder();
  const times = [11_000, 11_025];
  const result = await handleCatalogImageBulkQueueDelivery(
    {
      kind: "control_recovery",
      restaurantId: "restaurant-a",
      jobId: "bulk-job-123",
      operationId: "secret-operation-token",
      productName: "Never log this product",
      imageUrl: "https://private.example/image.jpg",
    },
    metadata(),
    {
      now: () => times.shift() ?? 11_025,
      writeLog: recorded.writeLog,
      processMessage: async () => ({
        processed: false,
        requeued: true,
        status: "queued",
        recoveryStatus: "reconciled",
      }),
    },
  );

  assert.equal(result.recoveryStatus, "reconciled");
  assert.deepEqual(
    recorded.entries.map((entry) => entry.event),
    ["delivery_started", "delivery_completed"],
  );
  assert.deepEqual(recorded.entries[1], {
    timestamp: "1970-01-01T00:00:11.025Z",
    level: "info",
    service: "catalog-image-bulk-queue",
    event: "delivery_completed",
    messageId: "message-123",
    deliveryCount: 2,
    topic: "catalog-image-bulk",
    consumerGroup: "catalog-image-bulk-consumer",
    region: "cdg1",
    messageAgeMs: 10_025,
    expiresInMs: 89_975,
    restaurantId: "restaurant-a",
    jobId: "bulk-job-123",
    kind: "control_recovery",
    durationMs: 25,
    processed: false,
    requeued: true,
    jobStatus: "queued",
    recoveryStatus: "reconciled",
  });
  const serialized = JSON.stringify(recorded.entries);
  assert.doesNotMatch(serialized, /secret-operation-token/);
  assert.doesNotMatch(serialized, /Never log this product/);
  assert.doesNotMatch(serialized, /private\.example/);
});

test("queue telemetry marks recoverable failures and preserves the original error", async () => {
  const recorded = recorder();
  const error = new CatalogImageBulkQueueRetryError("bulk-job-123");
  await assert.rejects(
    handleCatalogImageBulkQueueDelivery(
      { restaurantId: "restaurant-a", jobId: "bulk-job-123" },
      metadata(),
      {
        now: () => 11_000,
        writeLog: recorded.writeLog,
        processMessage: async () => {
          throw error;
        },
      },
    ),
    (actual) => actual === error,
  );
  assert.equal(recorded.entries[1].event, "delivery_retry_scheduled");
  assert.equal(recorded.entries[1].level, "error");
  assert.equal(recorded.entries[1].errorCode, error.code);
  assert.equal(recorded.entries[1].retryAfterSeconds, 10);
  assert.equal(recorded.entries[1].acknowledged, false);
});

test("queue telemetry emits a permanent discard without reflecting unsafe ids", async () => {
  const recorded = recorder();
  const error = new CatalogImageBulkQueueMessageError("INVALID_MESSAGE");
  await assert.rejects(
    handleCatalogImageBulkQueueDelivery(
      {
        restaurantId: "../restaurant-b",
        jobId: "bulk/job",
        arbitrary: "attacker controlled payload",
      },
      metadata({ deliveryCount: 1 }),
      {
        now: () => 11_000,
        writeLog: recorded.writeLog,
        processMessage: async () => {
          throw error;
        },
      },
    ),
    (actual) => actual === error,
  );
  assert.deepEqual(recorded.entries[1], {
    timestamp: "1970-01-01T00:00:11.000Z",
    level: "warning",
    service: "catalog-image-bulk-queue",
    event: "delivery_discarded",
    messageId: "message-123",
    deliveryCount: 1,
    topic: "catalog-image-bulk",
    consumerGroup: "catalog-image-bulk-consumer",
    region: "cdg1",
    messageAgeMs: 10_000,
    expiresInMs: 90_000,
    kind: "process",
    durationMs: 0,
    errorCode: error.code,
    acknowledged: true,
  });
  assert.doesNotMatch(JSON.stringify(recorded.entries), /attacker controlled/);
});

test("queue telemetry raises a final expiry signal before retention is exhausted", async () => {
  const recorded = recorder();
  await assert.rejects(
    handleCatalogImageBulkQueueDelivery(
      { restaurantId: "restaurant-a", jobId: "bulk-job-123" },
      metadata({ deliveryCount: 20, expiresAt: new Date(65_000) }),
      {
        now: () => 11_000,
        writeLog: recorded.writeLog,
        processMessage: async () => {
          throw new Error("FIRESTORE_UNAVAILABLE");
        },
      },
    ),
    /FIRESTORE_UNAVAILABLE/,
  );
  assert.equal(recorded.entries[1].event, "delivery_expiring");
  assert.equal(recorded.entries[1].retryAfterSeconds, 60);
  assert.equal(recorded.entries[1].expiresInMs, 54_000);
});

test("queue telemetry failures never change business processing", async () => {
  const result = await handleCatalogImageBulkQueueDelivery(
    { restaurantId: "restaurant-a", jobId: "bulk-job-123" },
    metadata(),
    {
      now: () => 11_000,
      writeLog: () => {
        throw new Error("LOG_SINK_FAILED");
      },
      processMessage: async () => ({
        processed: true,
        requeued: false,
        status: "completed",
      }),
    },
  );
  assert.equal(result.status, "completed");
});
