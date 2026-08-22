import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import {
  handleGenerateImportedProductImageRequest,
  handleGenerateImportedProductImageRequestSafe,
} from "@/lib/server/product-images/handle-generate-imported-product-image-request";
import { GenerateImportedProductImageError } from "@/lib/server/product-images/generate-imported-product-image";

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
    request({ productId: "product-1" }),
    {
      authenticate: async () => authContext(),
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

test("generator receives the server-resolved tenant and authenticated user", async () => {
  let received:
    | {
        restaurantId: string;
        productId: string;
        userId: string;
      }
    | undefined;

  const response = await handleGenerateImportedProductImageRequest(
    request({ productId: " product-1 ", confirmGeneration: true }),
    {
      authenticate: async () => authContext(),
      generate: async (params) => {
        received = {
          restaurantId: params.restaurantId,
          productId: params.productId,
          userId: params.userId,
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
  });
  const body = await json(response);
  assert.equal(body.ok, true);
  assert.equal(
    (body.result as Record<string, unknown>).outcome,
    "generated",
  );
});

test("structured provider errors preserve their code and status", async () => {
  const response = await handleGenerateImportedProductImageRequestSafe(
    request({ productId: "product-1", confirmGeneration: true }),
    {
      authenticate: async () => authContext(),
      generate: async () => {
        throw new GenerateImportedProductImageError(
          "IMAGE_GENERATION_NOT_CONFIGURED",
          "OPENAI_API_KEY no configurada",
          503,
        );
      },
    },
  );

  assert.equal(response.status, 503);
  const body = await json(response);
  assert.equal(body.error, "IMAGE_GENERATION_NOT_CONFIGURED");
  assert.equal(body.details, "OPENAI_API_KEY no configurada");
});
