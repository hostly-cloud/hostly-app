import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";
import {
  handleGenerateImportedProductImageRequest,
  handleGenerateImportedProductImageRequestSafe,
} from "@/lib/server/product-images/handle-generate-imported-product-image-request";
import { GenerateImportedProductImageError } from "@/lib/server/product-images/generate-imported-product-image";

const PRO_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "pro" },
});
const BASIC_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "basic" },
});
const ULTRA_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "ultra" },
});
const METERED_PRO_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: {
    plan: "pro",
    catalogImages: {
      meteringMode: "credit_balance",
      creditBalance: 8,
      creditCosts: { aiSingle: 1, catalogSearch: 1 },
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

function request(body: unknown): Request {
  return new Request("http://localhost/api/catalog/generate-product-image", {
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

test("restaurantId from the client is rejected", async () => {
  let generated = false;
  const response = await handleGenerateImportedProductImageRequest(
    request({
      productId: "product-1",
      confirmGeneration: true,
      restaurantId: "attacker-tenant",
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => PRO_ACCESS,
      generate: async () => {
        generated = true;
        return {
          outcome: "skipped",
          productId: "product-1",
          reason: "not_food",
        };
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal((await json(response)).error, "RESTAURANT_ID_NOT_ALLOWED");
  assert.equal(generated, false);
});

test("explicit confirmation is required before a paid provider call", async () => {
  let generated = false;
  const response = await handleGenerateImportedProductImageRequest(
    request({
      productId: "product-1",
      idempotencyKey: "request-confirmation",
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => PRO_ACCESS,
      generate: async () => {
        generated = true;
        return {
          outcome: "skipped",
          productId: "product-1",
          reason: "not_food",
        };
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal(
    (await json(response)).error,
    "GENERATION_CONFIRMATION_REQUIRED",
  );
  assert.equal(generated, false);
});

test("only roles with settings.manage can generate images", async () => {
  let generated = false;
  const response = await handleGenerateImportedProductImageRequest(
    request({ productId: "product-1", confirmGeneration: true }),
    {
      authenticate: async () =>
        authContext({ role: "manager", canManageUsers: false }),
      generate: async () => {
        generated = true;
        return {
          outcome: "skipped",
          productId: "product-1",
          reason: "not_food",
        };
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal((await json(response)).error, "SETTINGS_MANAGE_REQUIRED");
  assert.equal(generated, false);
});

test("the Basic plan is blocked before an individual generation", async () => {
  let generated = false;
  const response = await handleGenerateImportedProductImageRequest(
    request({
      productId: "product-1",
      idempotencyKey: "request-basic-plan",
      confirmGeneration: true,
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => BASIC_ACCESS,
      generate: async () => {
        generated = true;
        return {
          outcome: "skipped",
          productId: "product-1",
          reason: "not_food",
        };
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(
    (await json(response)).error,
    "CATALOG_IMAGE_AI_SINGLE_PLAN_REQUIRED",
  );
  assert.equal(generated, false);
});

test("the Ultra plan can use the individual generation endpoint", async () => {
  let generated = false;
  const response = await handleGenerateImportedProductImageRequest(
    request({
      productId: "product-1",
      idempotencyKey: "request-ultra-plan",
      confirmGeneration: true,
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => ULTRA_ACCESS,
      generate: async () => {
        generated = true;
        return {
          outcome: "skipped",
          productId: "product-1",
          reason: "not_food",
        };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(generated, true);
});

test("metered generation reconciles expired reservations before the provider", async () => {
  const calls: string[] = [];
  const response = await handleGenerateImportedProductImageRequest(
    request({
      productId: "product-1",
      idempotencyKey: "request-metered-reconcile",
      confirmGeneration: true,
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => METERED_PRO_ACCESS,
      reconcileExpiredReservations: async (params) => {
        calls.push(`reconcile:${params.restaurantId}:${params.actorId}`);
        return { scanned: 1, released: 1, creditsReleased: 1, skipped: 0 };
      },
      generate: async () => {
        calls.push("generate");
        return {
          outcome: "skipped",
          productId: "product-1",
          reason: "not_food",
        };
      },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["reconcile:restaurant-server:owner-1", "generate"]);
});

test("generator receives the server-resolved tenant and authenticated user", async () => {
  let received:
    | {
        restaurantId: string;
        productId: string;
      userId: string;
      idempotencyKey: string;
      description?: string;
      allowApprovedAiReplacement?: boolean;
      }
    | undefined;

  const response = await handleGenerateImportedProductImageRequest(
    request({
      productId: " product-1 ",
      idempotencyKey: "request-generation-success",
      confirmGeneration: true,
      confirmReplaceApprovedImage: true,
      description: "  Lubina con patata y verduras  ",
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => PRO_ACCESS,
      generate: async (params) => {
        received = {
          restaurantId: params.restaurantId,
          productId: params.productId,
          userId: params.userId,
          idempotencyKey: params.idempotencyKey,
          description: params.description,
          allowApprovedAiReplacement:
            params.allowApprovedAiReplacement,
        };
        return {
          outcome: "generated",
          productId: params.productId,
          imageUrl: "https://example.test/generated.webp",
          imagePath:
            "restaurants/restaurant-server/products/product-1/ai/generated.webp",
          model: "gpt-image-2-2026-04-21",
        };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    restaurantId: "restaurant-server",
    productId: "product-1",
    userId: "owner-1",
    idempotencyKey: "request-generation-success",
    description: "Lubina con patata y verduras",
    allowApprovedAiReplacement: true,
  });
  const body = await json(response);
  assert.equal(body.ok, true);
  assert.equal(
    (body.result as Record<string, unknown>).outcome,
    "generated",
  );
});

test("an idempotency key is required before calling the provider", async () => {
  let generated = false;
  const response = await handleGenerateImportedProductImageRequest(
    request({ productId: "product-1", confirmGeneration: true }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => PRO_ACCESS,
      generate: async () => {
        generated = true;
        return {
          outcome: "skipped",
          productId: "product-1",
          reason: "not_food",
        };
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal((await json(response)).error, "INVALID_IMAGE_IDEMPOTENCY_KEY");
  assert.equal(generated, false);
});

test("structured provider errors preserve their code and status", async () => {
  const response = await handleGenerateImportedProductImageRequestSafe(
    request({
      productId: "product-1",
      idempotencyKey: "request-provider-error",
      confirmGeneration: true,
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => PRO_ACCESS,
      generate: async () => {
        throw new GenerateImportedProductImageError(
          "IMAGE_GENERATION_NOT_CONFIGURED",
          "AI Gateway no está disponible para este proyecto",
          503,
        );
      },
    },
  );

  assert.equal(response.status, 503);
  const body = await json(response);
  assert.equal(body.error, "IMAGE_GENERATION_NOT_CONFIGURED");
  assert.equal(body.details, "AI Gateway no está disponible para este proyecto");
});

test("invalid description types are rejected before generation", async () => {
  let generated = false;
  const response = await handleGenerateImportedProductImageRequest(
    request({
      productId: "product-1",
      idempotencyKey: "request-invalid-description",
      confirmGeneration: true,
      description: { unsafe: true },
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => PRO_ACCESS,
      generate: async () => {
        generated = true;
        return {
          outcome: "skipped",
          productId: "product-1",
          reason: "not_food",
        };
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal((await json(response)).error, "INVALID_PRODUCT_DESCRIPTION");
  assert.equal(generated, false);
});

test("invalid approved-image replacement confirmation is rejected", async () => {
  let generated = false;
  const response = await handleGenerateImportedProductImageRequest(
    request({
      productId: "product-1",
      idempotencyKey: "request-invalid-replacement",
      confirmGeneration: true,
      confirmReplaceApprovedImage: "yes",
    }),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => PRO_ACCESS,
      generate: async () => {
        generated = true;
        return {
          outcome: "skipped",
          productId: "product-1",
          reason: "protected_existing_image",
        };
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal(
    (await json(response)).error,
    "INVALID_IMAGE_REPLACEMENT_CONFIRMATION",
  );
  assert.equal(generated, false);
});
