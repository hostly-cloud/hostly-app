import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import type { ProductImageReviewResolvedState } from "@/lib/productos/product-image-review-contract";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import {
  handleProductImageStateRequest,
} from "@/lib/server/product-images/handle-product-image-state-request";
import {
  handleReviewProductImageRequest,
  handleReviewProductImageRequestSafe,
} from "@/lib/server/product-images/handle-review-product-image-request";
import { ReviewProductImageError } from "@/lib/server/product-images/review-product-image";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";

const PRO_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "pro" },
});
const BASIC_ACCESS = resolveCatalogImageAccessFromRestaurant({
  subscription: { plan: "basic" },
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

function resolvedState(): ProductImageReviewResolvedState {
  return {
    resolution: "resolved",
    productId: "product-1",
    productName: "Lubina a la sal",
    imageUrl: "https://example.test/generated.webp",
    hasImage: true,
    source: "ai_generated",
    reviewStatus: "pending",
    locked: false,
    confidence: 0.65,
    provider: "openai",
    importedFromMenu: true,
    generationInProgress: false,
    canGenerate: true,
    canApprove: true,
    canReject: true,
    canSearchCatalog: true,
    catalogProvenance: null,
    generationReason: null,
  };
}

function reviewRequest(body: unknown): Request {
  return new Request("http://localhost/api/catalog/review-product-image", {
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

test("image state rejects restaurantId supplied by the browser", async () => {
  let resolved = false;
  const response = await handleProductImageStateRequest(
    new Request(
      "http://localhost/api/catalog/product-image-state?productId=product-1&restaurantId=attacker",
      { headers: { authorization: "Bearer test-token" } },
    ),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => PRO_ACCESS,
      resolveStateById: async () => {
        resolved = true;
        return { resolution: "not_found" };
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal((await json(response)).error, "RESTAURANT_ID_NOT_ALLOWED");
  assert.equal(resolved, false);
});

test("image state is limited to settings.manage", async () => {
  const response = await handleProductImageStateRequest(
    new Request("http://localhost/api/catalog/product-image-state?productId=product-1", {
      headers: { authorization: "Bearer test-token" },
    }),
    {
      authenticate: async () => authContext({ role: "manager" }),
      resolveStateById: async () => resolvedState(),
    },
  );

  assert.equal(response.status, 403);
  assert.equal((await json(response)).error, "SETTINGS_MANAGE_REQUIRED");
});

test("image state prefers product id and receives only the server tenant", async () => {
  let byNameCalled = false;
  let received: { restaurantId: string; productId: string } | undefined;
  const response = await handleProductImageStateRequest(
    new Request(
      "http://localhost/api/catalog/product-image-state?productId=product-1&name=Duplicado",
      { headers: { authorization: "Bearer test-token" } },
    ),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => PRO_ACCESS,
      resolveStateById: async (params) => {
        received = {
          restaurantId: params.restaurantId,
          productId: params.productId,
        };
        return resolvedState();
      },
      resolveState: async () => {
        byNameCalled = true;
        return { resolution: "ambiguous" };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    restaurantId: "restaurant-server",
    productId: "product-1",
  });
  assert.equal(byNameCalled, false);
});

test("image state keeps name fallback for legacy callers", async () => {
  let received: { restaurantId: string; productName: string } | undefined;
  const response = await handleProductImageStateRequest(
    new Request(
      "http://localhost/api/catalog/product-image-state?name=Lubina%20a%20la%20sal",
      { headers: { authorization: "Bearer test-token" } },
    ),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => PRO_ACCESS,
      resolveState: async (params) => {
        received = {
          restaurantId: params.restaurantId,
          productName: params.productName,
        };
        return resolvedState();
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    restaurantId: "restaurant-server",
    productName: "Lubina a la sal",
  });
});

test("image state removes automatic actions for the Basic plan", async () => {
  const response = await handleProductImageStateRequest(
    new Request(
      "http://localhost/api/catalog/product-image-state?productId=product-1",
      { headers: { authorization: "Bearer test-token" } },
    ),
    {
      authenticate: async () => authContext(),
      resolveAccess: async () => BASIC_ACCESS,
      resolveStateById: async () => resolvedState(),
    },
  );

  assert.equal(response.status, 200);
  const body = await json(response);
  const state = body.state as ProductImageReviewResolvedState;
  assert.equal(state.canGenerate, false);
  assert.equal(state.canSearchCatalog, false);
  assert.deepEqual(body.access, BASIC_ACCESS);
});

test("review rejects browser tenant and invalid actions", async () => {
  let reviewed = false;
  const withTenant = await handleReviewProductImageRequest(
    reviewRequest({
      productId: "product-1",
      action: "approve",
      restaurantId: "attacker",
    }),
    {
      authenticate: async () => authContext(),
      review: async () => {
        reviewed = true;
        return resolvedState();
      },
    },
  );
  assert.equal(withTenant.status, 400);
  assert.equal((await json(withTenant)).error, "RESTAURANT_ID_NOT_ALLOWED");

  const invalidAction = await handleReviewProductImageRequest(
    reviewRequest({ productId: "product-1", action: "unlock" }),
    {
      authenticate: async () => authContext(),
      review: async () => {
        reviewed = true;
        return resolvedState();
      },
    },
  );
  assert.equal(invalidAction.status, 400);
  assert.equal((await json(invalidAction)).error, "INVALID_IMAGE_REVIEW_ACTION");
  assert.equal(reviewed, false);
});

test("review requires settings.manage", async () => {
  const response = await handleReviewProductImageRequest(
    reviewRequest({ productId: "product-1", action: "approve" }),
    {
      authenticate: async () => authContext({ role: "manager" }),
      review: async () => resolvedState(),
    },
  );
  assert.equal(response.status, 403);
  assert.equal((await json(response)).error, "SETTINGS_MANAGE_REQUIRED");
});

test("review receives the authenticated user and server-resolved tenant", async () => {
  let received:
    | {
        restaurantId: string;
        productId: string;
        userId: string;
        action: string;
      }
    | undefined;
  const response = await handleReviewProductImageRequest(
    reviewRequest({ productId: " product-1 ", action: "reject" }),
    {
      authenticate: async () => authContext(),
      review: async (params) => {
        received = {
          restaurantId: params.restaurantId,
          productId: params.productId,
          userId: params.userId,
          action: params.action,
        };
        return { ...resolvedState(), reviewStatus: "rejected" };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    restaurantId: "restaurant-server",
    productId: "product-1",
    userId: "owner-1",
    action: "reject",
  });
});

test("structured review errors preserve status and code", async () => {
  const response = await handleReviewProductImageRequestSafe(
    reviewRequest({ productId: "product-1", action: "approve" }),
    {
      authenticate: async () => authContext(),
      review: async () => {
        throw new ReviewProductImageError(
          "PRODUCT_IMAGE_PROTECTED",
          "La imagen está protegida",
          409,
        );
      },
    },
  );

  assert.equal(response.status, 409);
  const body = await json(response);
  assert.equal(body.error, "PRODUCT_IMAGE_PROTECTED");
  assert.equal(body.details, "La imagen está protegida");
});
