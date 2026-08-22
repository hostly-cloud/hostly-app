import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import {
  handleSearchCatalogProductImagesRequest,
  handleSearchCatalogProductImagesRequestSafe,
} from "@/lib/server/product-images/handle-search-catalog-product-images-request";
import {
  handleAttachCatalogProductImageRequest,
  handleAttachCatalogProductImageRequestSafe,
} from "@/lib/server/product-images/handle-attach-catalog-product-image-request";

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

function request(path: string, body: unknown): Request {
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

const CANDIDATE = {
  provider: "open_food_facts" as const,
  externalReference: "5449000131805",
  productName: "Coca-Cola Zero",
  brand: "Coca-Cola",
  quantity: "330 ml",
  imageUrl:
    "https://images.openfoodfacts.org/images/products/544/900/013/1805/front_es.12.400.jpg",
  thumbnailUrl:
    "https://images.openfoodfacts.org/images/products/544/900/013/1805/front_es.12.200.jpg",
  sourceUrl: "https://world.openfoodfacts.org/product/5449000131805",
  confidence: 0.9,
  matchLevel: "strong" as const,
  warnings: [],
  license: "CC BY-SA 3.0" as const,
  attribution: "Open Food Facts contributors" as const,
};

test("catalog search rejects restaurantId supplied by the browser", async () => {
  let searched = false;
  const response = await handleSearchCatalogProductImagesRequest(
    request("/api/catalog/search-product-images", {
      productId: "product-1",
      query: "Coca-Cola",
      restaurantId: "attacker-tenant",
    }),
    {
      authenticate: async () => authContext(),
      searchCatalog: async () => {
        searched = true;
        return {
          query: "Coca-Cola",
          candidates: [],
          provider: "open_food_facts",
          attribution: "Open Food Facts contributors",
          license: "CC BY-SA 3.0",
        };
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal((await json(response)).error, "RESTAURANT_ID_NOT_ALLOWED");
  assert.equal(searched, false);
});

test("catalog search requires settings.manage", async () => {
  let searched = false;
  const response = await handleSearchCatalogProductImagesRequest(
    request("/api/catalog/search-product-images", {
      productId: "product-1",
      query: "Coca-Cola",
    }),
    {
      authenticate: async () => authContext({ role: "manager" }),
      searchCatalog: async () => {
        searched = true;
        throw new Error("should not run");
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal((await json(response)).error, "SETTINGS_MANAGE_REQUIRED");
  assert.equal(searched, false);
});

test("catalog search receives only the server tenant and requested product", async () => {
  let received:
    | { restaurantId: string; productId: string; query: string }
    | undefined;
  const response = await handleSearchCatalogProductImagesRequest(
    request("/api/catalog/search-product-images", {
      productId: " product-1 ",
      query: " Coca-Cola Zero 33 cl ",
    }),
    {
      authenticate: async () => authContext(),
      searchCatalog: async (params) => {
        received = {
          restaurantId: params.restaurantId,
          productId: params.productId,
          query: params.query,
        };
        return {
          query: params.query,
          candidates: [CANDIDATE],
          provider: "open_food_facts",
          attribution: "Open Food Facts contributors",
          license: "CC BY-SA 3.0",
        };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    restaurantId: "restaurant-server",
    productId: "product-1",
    query: "Coca-Cola Zero 33 cl",
  });
});

test("catalog attach refuses client-controlled image URLs", async () => {
  let attached = false;
  const response = await handleAttachCatalogProductImageRequest(
    request("/api/catalog/attach-product-image", {
      productId: "product-1",
      externalReference: "5449000131805",
      confirmSelection: true,
      imageUrl: "https://attacker.example/image.jpg",
    }),
    {
      authenticate: async () => authContext(),
      attachCatalog: async () => {
        attached = true;
        throw new Error("should not run");
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal(
    (await json(response)).error,
    "CATALOG_IMAGE_URL_NOT_ALLOWED_FROM_CLIENT",
  );
  assert.equal(attached, false);
});

test("catalog attach requires explicit human selection confirmation", async () => {
  let attached = false;
  const response = await handleAttachCatalogProductImageRequest(
    request("/api/catalog/attach-product-image", {
      productId: "product-1",
      externalReference: "5449000131805",
    }),
    {
      authenticate: async () => authContext(),
      attachCatalog: async () => {
        attached = true;
        throw new Error("should not run");
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal(
    (await json(response)).error,
    "CATALOG_SELECTION_CONFIRMATION_REQUIRED",
  );
  assert.equal(attached, false);
});

test("catalog attach requires settings.manage", async () => {
  let attached = false;
  const response = await handleAttachCatalogProductImageRequest(
    request("/api/catalog/attach-product-image", {
      productId: "product-1",
      externalReference: "5449000131805",
      confirmSelection: true,
    }),
    {
      authenticate: async () => authContext({ role: "waiter" }),
      attachCatalog: async () => {
        attached = true;
        throw new Error("should not run");
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal((await json(response)).error, "SETTINGS_MANAGE_REQUIRED");
  assert.equal(attached, false);
});

test("catalog attach receives authenticated user and server-resolved tenant", async () => {
  let received:
    | {
        restaurantId: string;
        productId: string;
        externalReference: string;
        userId: string;
      }
    | undefined;
  const response = await handleAttachCatalogProductImageRequest(
    request("/api/catalog/attach-product-image", {
      productId: " product-1 ",
      externalReference: " 5449000131805 ",
      confirmSelection: true,
    }),
    {
      authenticate: async () => authContext(),
      attachCatalog: async (params) => {
        received = {
          restaurantId: params.restaurantId,
          productId: params.productId,
          externalReference: params.externalReference,
          userId: params.userId,
        };
        return {
          productId: params.productId,
          imageUrl: "https://storage.example/catalog.jpg",
          imagePath:
            "restaurants/restaurant-server/products/product-1/catalog/catalog.jpg",
          candidate: CANDIDATE,
        };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    restaurantId: "restaurant-server",
    productId: "product-1",
    externalReference: "5449000131805",
    userId: "owner-1",
  });
});

test("structured catalog errors preserve status and code", async () => {
  const providerError = Object.assign(new Error("rate limited"), {
    code: "CATALOG_PROVIDER_RATE_LIMITED",
    httpStatus: 429,
  });
  const searchResponse = await handleSearchCatalogProductImagesRequestSafe(
    request("/api/catalog/search-product-images", {
      productId: "product-1",
      query: "Coca-Cola",
    }),
    {
      authenticate: async () => authContext(),
      searchCatalog: async () => {
        throw providerError;
      },
    },
  );
  assert.equal(searchResponse.status, 429);
  assert.equal(
    (await json(searchResponse)).error,
    "CATALOG_PROVIDER_RATE_LIMITED",
  );

  const attachError = Object.assign(new Error("protected"), {
    code: "PRODUCT_IMAGE_PROTECTED",
    httpStatus: 409,
  });
  const attachResponse = await handleAttachCatalogProductImageRequestSafe(
    request("/api/catalog/attach-product-image", {
      productId: "product-1",
      externalReference: "5449000131805",
      confirmSelection: true,
    }),
    {
      authenticate: async () => authContext(),
      attachCatalog: async () => {
        throw attachError;
      },
    },
  );
  assert.equal(attachResponse.status, 409);
  assert.equal((await json(attachResponse)).error, "PRODUCT_IMAGE_PROTECTED");
});
