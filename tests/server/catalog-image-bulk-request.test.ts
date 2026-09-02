import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import type { CatalogImageBulkJob } from "@/lib/productos/catalog-image-bulk-contract";
import {
  handleCatalogImageBulkPreflightRequest,
  handleControlCatalogImageBulkJobRequest,
  handleCreateCatalogImageBulkJobRequest,
  handleProcessCatalogImageBulkJobRequest,
} from "@/lib/server/product-images/handle-catalog-image-bulk-request";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";

const BASIC_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "basic" },
});
const PRO_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "pro" },
});
const ULTRA_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "ultra" },
});

function authContext(
  overrides: Partial<AuthenticatedRestaurantContext> = {},
): AuthenticatedRestaurantContext {
  return {
    uid: "owner-1",
    email: "owner@example.test",
    emailVerified: true,
    restaurantId: "restaurant-server",
    role: "owner",
    canManageUsers: true,
    db: {} as Firestore,
    ...overrides,
  };
}

function request(path: string, body: unknown = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function job(overrides: Partial<CatalogImageBulkJob> = {}): CatalogImageBulkJob {
  return {
    jobId: "bulk-job-123",
    status: "queued",
    createdAt: 1,
    updatedAt: 1,
    createdBy: "owner-1",
    summary: {
      totalProducts: 1,
      withoutApprovedImage: 1,
      aiGenerable: 1,
      catalogSearchable: 0,
      manualReview: 0,
      pendingReview: 0,
      alreadyProcessing: 0,
      existingImage: 0,
    },
    estimate: {
      aiGenerationRequests: 1,
      catalogSearchRequests: 0,
      credits: null,
      costUsd: null,
      mode: "usage_recorded",
      note: "Uso registrado",
    },
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
    activeProductId: null,
    failureReason: null,
    ...overrides,
  };
}

for (const [label, access] of [
  ["Basic", BASIC_ACCESS],
  ["Pro", PRO_ACCESS],
] as const) {
  test(`${label} is blocked from bulk preflight on the server`, async () => {
    let analyzed = false;
    const response = await handleCatalogImageBulkPreflightRequest(
      request("/api/catalog/product-image-bulk/preflight"),
      {
        authenticate: async () => authContext(),
        resolveAccess: async () => access,
        analyze: async () => {
          analyzed = true;
          throw new Error("should not run");
        },
      },
    );
    assert.equal(response.status, 403);
    assert.equal(
      (await json(response)).error,
      "CATALOG_IMAGE_AI_BULK_PLAN_REQUIRED",
    );
    assert.equal(analyzed, false);
  });
}

test("Ultra can run bulk preflight", async () => {
  const response = await handleCatalogImageBulkPreflightRequest(
    request("/api/catalog/product-image-bulk/preflight"),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
      analyze: async (params) => ({
        access: params.access,
        summary: job().summary,
        estimate: job().estimate,
        classified: [],
      }),
    },
  );
  assert.equal(response.status, 200);
  assert.equal((await json(response)).ok, true);
});

test("bulk creation requires explicit confirmation before any job is written", async () => {
  let created = false;
  const response = await handleCreateCatalogImageBulkJobRequest(
    request("/api/catalog/product-image-bulk/jobs", {
      idempotencyKey: "bulk-job-123",
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
      createJob: async () => {
        created = true;
        return job();
      },
    },
  );
  assert.equal(response.status, 400);
  assert.equal(
    (await json(response)).error,
    "BULK_GENERATION_CONFIRMATION_REQUIRED",
  );
  assert.equal(created, false);
});

test("bulk creation rejects client restaurantId and uses the authenticated tenant", async () => {
  let receivedRestaurantId = "";
  const rejected = await handleCreateCatalogImageBulkJobRequest(
    request("/api/catalog/product-image-bulk/jobs", {
      idempotencyKey: "bulk-job-123",
      confirmBulkGeneration: true,
      restaurantId: "attacker-tenant",
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
      createJob: async () => job(),
    },
  );
  assert.equal(rejected.status, 400);
  assert.equal((await json(rejected)).error, "RESTAURANT_ID_NOT_ALLOWED");

  const accepted = await handleCreateCatalogImageBulkJobRequest(
    request("/api/catalog/product-image-bulk/jobs", {
      idempotencyKey: "bulk-job-123",
      confirmBulkGeneration: true,
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
      createJob: async (params) => {
        receivedRestaurantId = params.restaurantId;
        return job();
      },
    },
  );
  assert.equal(accepted.status, 200);
  assert.equal(receivedRestaurantId, "restaurant-server");
});

test("processing and retry controls remain Ultra-only and tenant-scoped", async () => {
  let processedTenant = "";
  const blocked = await handleProcessCatalogImageBulkJobRequest(
    request("/api/catalog/product-image-bulk/jobs/bulk-job-123/process"),
    "bulk-job-123",
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => PRO_ACCESS,
      processNext: async () => ({ processed: false, job: job() }),
    },
  );
  assert.equal(blocked.status, 403);

  const processed = await handleProcessCatalogImageBulkJobRequest(
    request("/api/catalog/product-image-bulk/jobs/bulk-job-123/process"),
    "bulk-job-123",
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
      processNext: async (params) => {
        processedTenant = params.restaurantId;
        return { processed: true, job: job({ status: "completed" }) };
      },
    },
  );
  assert.equal(processed.status, 200);
  assert.equal(processedTenant, "restaurant-server");

  let actionReceived = "";
  const controlled = await handleControlCatalogImageBulkJobRequest(
    request("/api/catalog/product-image-bulk/jobs/bulk-job-123/control", {
      action: "retry_failed",
    }),
    "bulk-job-123",
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
      controlJob: async (params) => {
        actionReceived = params.action;
        return job();
      },
    },
  );
  assert.equal(controlled.status, 200);
  assert.equal(actionReceived, "retry_failed");
});

test("only settings.manage can inspect or mutate bulk jobs", async () => {
  let created = false;
  const response = await handleCreateCatalogImageBulkJobRequest(
    request("/api/catalog/product-image-bulk/jobs", {
      idempotencyKey: "bulk-job-123",
      confirmBulkGeneration: true,
    }),
    {
      authenticate: async () => authContext({ role: "manager" }),
      resolveAccess: async () => ULTRA_ACCESS,
      createJob: async () => {
        created = true;
        return job();
      },
    },
  );
  assert.equal(response.status, 403);
  assert.equal((await json(response)).error, "SETTINGS_MANAGE_REQUIRED");
  assert.equal(created, false);
});
