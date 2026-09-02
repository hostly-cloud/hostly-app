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
  handleReviewCatalogImageBulkSelectionRequest,
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
const EXPIRED_METERED_ULTRA_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: {
    plan: "ultra",
    catalogImages: {
      meteringMode: "credit_balance",
      creditBalance: 10,
      creditCosts: { aiBulk: 1, catalogSearch: 1 },
      creditPeriod: { id: "expired", startsAt: 1, endsAt: 2, allocation: 10 },
    },
  },
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
    queueRevision: 1,
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

test("bulk creation does not start when the configured credit period is inactive", async () => {
  let created = false;
  const response = await handleCreateCatalogImageBulkJobRequest(
    request("/api/catalog/product-image-bulk/jobs", {
      idempotencyKey: "bulk-expired-period",
      confirmBulkGeneration: true,
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => EXPIRED_METERED_ULTRA_ACCESS,
      createJob: async () => {
        created = true;
        return job();
      },
    },
  );
  assert.equal(response.status, 402);
  assert.equal(
    (await json(response)).error,
    "CATALOG_IMAGE_CREDIT_PERIOD_INACTIVE",
  );
  assert.equal(created, false);
});

test("bulk creation rejects client restaurantId and uses the authenticated tenant", async () => {
  let receivedRestaurantId = "";
  let enqueuedRestaurantId = "";
  let enqueuedRevision = -1;
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
      enqueueJob: async (params) => {
        enqueuedRestaurantId = params.restaurantId;
        enqueuedRevision = params.revision;
      },
    },
  );
  assert.equal(accepted.status, 200);
  assert.equal(receivedRestaurantId, "restaurant-server");
  assert.equal(enqueuedRestaurantId, "restaurant-server");
  assert.equal(enqueuedRevision, 1);
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
  let retryRevision = -1;
  let controlOperationId = "";
  let recoveryOperationId = "";
  let recoveryTenant = "";
  const controlEvents: string[] = [];
  const controlled = await handleControlCatalogImageBulkJobRequest(
    request("/api/catalog/product-image-bulk/jobs/bulk-job-123/control", {
      action: "retry_failed",
    }),
    "bulk-job-123",
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
      controlJob: async (params) => {
        controlEvents.push("control");
        actionReceived = params.action;
        controlOperationId = params.operationId ?? "";
        return job({ queueRevision: 2 });
      },
      enqueueControlRecovery: async (params) => {
        controlEvents.push("recovery");
        recoveryOperationId = params.operationId;
        recoveryTenant = params.restaurantId;
      },
      enqueueJob: async (params) => {
        controlEvents.push("process");
        retryRevision = params.revision;
      },
    },
  );
  assert.equal(controlled.status, 200);
  assert.equal(actionReceived, "retry_failed");
  assert.equal(retryRevision, 2);
  assert.equal(recoveryTenant, "restaurant-server");
  assert.match(recoveryOperationId, /^[a-f0-9-]{36}$/);
  assert.equal(controlOperationId, recoveryOperationId);
  assert.deepEqual(controlEvents, ["recovery", "control", "process"]);
});

test("durable recovery must be queued before retry or cancel can persist a barrier", async () => {
  for (const action of ["retry_failed", "cancel"] as const) {
    let controlled = false;
    await assert.rejects(
      handleControlCatalogImageBulkJobRequest(
        request("/api/catalog/product-image-bulk/jobs/bulk-job-123/control", {
          action,
        }),
        "bulk-job-123",
        {
          authenticate: async () => authContext(),
          resolveAccess: async () => ULTRA_ACCESS,
          enqueueControlRecovery: async (params) => {
            assert.equal(params.restaurantId, "restaurant-server");
            throw new Error("QUEUE_UNAVAILABLE");
          },
          controlJob: async () => {
            controlled = true;
            return job();
          },
        },
      ),
      /QUEUE_UNAVAILABLE/,
    );
    assert.equal(controlled, false);
  }
});

test("bulk approval is Ultra-only, explicitly confirmed and tenant-scoped", async () => {
  const blocked = await handleReviewCatalogImageBulkSelectionRequest(
    request("/api/catalog/product-image-bulk/jobs/bulk-job-123/review", {
      productIds: ["product-1"],
      confirmApproval: true,
    }),
    "bulk-job-123",
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => PRO_ACCESS,
    },
  );
  assert.equal(blocked.status, 403);

  const unconfirmed = await handleReviewCatalogImageBulkSelectionRequest(
    request("/api/catalog/product-image-bulk/jobs/bulk-job-123/review", {
      productIds: ["product-1"],
    }),
    "bulk-job-123",
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
    },
  );
  assert.equal(unconfirmed.status, 400);
  assert.equal(
    (await json(unconfirmed)).error,
    "BULK_IMAGE_APPROVAL_CONFIRMATION_REQUIRED",
  );

  let received:
    | { restaurantId: string; userId: string; productIds: string[] }
    | undefined;
  const accepted = await handleReviewCatalogImageBulkSelectionRequest(
    request("/api/catalog/product-image-bulk/jobs/bulk-job-123/review", {
      productIds: ["product-1", "product-2"],
      confirmApproval: true,
    }),
    "bulk-job-123",
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
      reviewSelection: async (params) => {
        received = {
          restaurantId: params.restaurantId,
          userId: params.userId,
          productIds: params.productIds,
        };
        return {
          requested: 2,
          approved: 2,
          alreadyApproved: 0,
          failed: 0,
          results: [],
        };
      },
    },
  );
  assert.equal(accepted.status, 200);
  assert.deepEqual(received, {
    restaurantId: "restaurant-server",
    userId: "owner-1",
    productIds: ["product-1", "product-2"],
  });

  const crossTenant = await handleReviewCatalogImageBulkSelectionRequest(
    request("/api/catalog/product-image-bulk/jobs/bulk-job-123/review", {
      productIds: ["product-1"],
      confirmApproval: true,
      restaurantId: "attacker-tenant",
    }),
    "bulk-job-123",
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
    },
  );
  assert.equal(crossTenant.status, 400);
  assert.equal((await json(crossTenant)).error, "RESTAURANT_ID_NOT_ALLOWED");
});

test("bulk catalog approval forwards only server-validated references and rejects client URLs", async () => {
  let received:
    | {
        restaurantId: string;
        productIds: string[];
        catalogSelections: Array<{
          productId: string;
          externalReference: string;
        }>;
      }
    | undefined;
  const accepted = await handleReviewCatalogImageBulkSelectionRequest(
    request("/api/catalog/product-image-bulk/jobs/bulk-job-123/review", {
      productIds: [],
      catalogSelections: [
        { productId: "brand-1", externalReference: "5449000054227" },
      ],
      confirmApproval: true,
    }),
    "bulk-job-123",
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
      reviewSelection: async (params) => {
        received = {
          restaurantId: params.restaurantId,
          productIds: params.productIds,
          catalogSelections: params.catalogSelections ?? [],
        };
        return {
          requested: 1,
          approved: 1,
          alreadyApproved: 0,
          failed: 0,
          results: [],
        };
      },
    },
  );
  assert.equal(accepted.status, 200);
  assert.deepEqual(received, {
    restaurantId: "restaurant-server",
    productIds: [],
    catalogSelections: [
      { productId: "brand-1", externalReference: "5449000054227" },
    ],
  });

  const clientUrl = await handleReviewCatalogImageBulkSelectionRequest(
    request("/api/catalog/product-image-bulk/jobs/bulk-job-123/review", {
      productIds: [],
      catalogSelections: [
        {
          productId: "brand-1",
          externalReference: "5449000054227",
          imageUrl: "https://attacker.test/fake.webp",
        },
      ],
      confirmApproval: true,
    }),
    "bulk-job-123",
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
    },
  );
  assert.equal(clientUrl.status, 400);
  assert.equal(
    (await json(clientUrl)).error,
    "CATALOG_IMAGE_BULK_CLIENT_REFERENCE_NOT_ALLOWED",
  );

  const bulkWithoutCatalogSearch = {
    ...ULTRA_ACCESS,
    capabilities: ["catalog.image.ai.bulk"] as typeof ULTRA_ACCESS.capabilities,
  };
  const missingCapability = await handleReviewCatalogImageBulkSelectionRequest(
    request("/api/catalog/product-image-bulk/jobs/bulk-job-123/review", {
      productIds: [],
      catalogSelections: [
        { productId: "brand-1", externalReference: "5449000054227" },
      ],
      confirmApproval: true,
    }),
    "bulk-job-123",
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => bulkWithoutCatalogSearch,
    },
  );
  assert.equal(missingCapability.status, 403);
  assert.equal(
    (await json(missingCapability)).error,
    "CATALOG_IMAGE_SEARCH_PLAN_REQUIRED",
  );
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
