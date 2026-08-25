import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import {
  handleGetProductCommercialIdentityRequest,
  handleUpdateProductCommercialIdentityRequest,
} from "@/lib/server/product-images/handle-product-commercial-identity-request";
import type { ProductCommercialIdentity } from "@/lib/productos/product-commercial-identity-contract";

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

function identity(
  patch: Partial<ProductCommercialIdentity> = {},
): ProductCommercialIdentity {
  return {
    productId: "p1",
    brand: "",
    quantity: "",
    barcode: "",
    wineProducer: "",
    wineAppellation: "",
    wineVintage: "",
    ...patch,
  };
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/catalog/product-identity", {
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

test("commercial identity GET rejects browser tenant", async () => {
  let called = false;
  const response = await handleGetProductCommercialIdentityRequest(
    new Request(
      "http://localhost/api/catalog/product-identity?productId=p1&restaurantId=attacker",
      { headers: { authorization: "Bearer test-token" } },
    ),
    {
      authenticate: async () => authContext(),
      readIdentity: async () => {
        called = true;
        return identity();
      },
    },
  );
  assert.equal(response.status, 400);
  assert.equal((await json(response)).error, "RESTAURANT_ID_NOT_ALLOWED");
  assert.equal(called, false);
});

test("commercial identity requires settings.manage", async () => {
  const response = await handleGetProductCommercialIdentityRequest(
    new Request("http://localhost/api/catalog/product-identity?productId=p1"),
    {
      authenticate: async () => authContext({ role: "manager" }),
      readIdentity: async () => identity(),
    },
  );
  assert.equal(response.status, 403);
  assert.equal((await json(response)).error, "SETTINGS_MANAGE_REQUIRED");
});

test("commercial identity GET receives server-resolved tenant only", async () => {
  let received: { restaurantId: string; productId: string } | null = null;
  const response = await handleGetProductCommercialIdentityRequest(
    new Request("http://localhost/api/catalog/product-identity?productId=product-1"),
    {
      authenticate: async () => authContext(),
      readIdentity: async (params) => {
        received = {
          restaurantId: params.restaurantId,
          productId: params.productId,
        };
        return identity({
          productId: params.productId,
          brand: "Vega Sicilia",
          quantity: "75 cl",
          barcode: "8410869450199",
          wineProducer: "Tempos Vega Sicilia",
          wineAppellation: "Ribera del Duero",
          wineVintage: "2019",
        });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    restaurantId: "restaurant-server",
    productId: "product-1",
  });
});

test("commercial identity POST rejects browser tenant before write", async () => {
  let called = false;
  const response = await handleUpdateProductCommercialIdentityRequest(
    postRequest({
      productId: "product-1",
      brand: "Coca-Cola",
      quantity: "33 cl",
      barcode: "5449000131805",
      restaurantId: "attacker",
    }),
    {
      authenticate: async () => authContext(),
      updateIdentity: async () => {
        called = true;
        return identity({
          productId: "product-1",
          brand: "Coca-Cola",
          quantity: "33 cl",
          barcode: "5449000131805",
        });
      },
    },
  );
  assert.equal(response.status, 400);
  assert.equal((await json(response)).error, "RESTAURANT_ID_NOT_ALLOWED");
  assert.equal(called, false);
});

test("commercial identity POST normalizes wine input and passes authenticated user", async () => {
  let received:
    | {
        restaurantId: string;
        userId: string;
        productId: string;
        barcode: string;
        wineProducer: string;
        wineAppellation: string;
        wineVintage: string;
      }
    | null = null;
  const response = await handleUpdateProductCommercialIdentityRequest(
    postRequest({
      productId: " product-1 ",
      brand: " Vega Sicilia ",
      quantity: " 75 cl ",
      barcode: "8 410-8694 50199",
      wineProducer: " Tempos Vega Sicilia ",
      wineAppellation: " Ribera del Duero ",
      wineVintage: " 2019 ",
    }),
    {
      authenticate: async () => authContext(),
      updateIdentity: async (params) => {
        received = {
          restaurantId: params.restaurantId,
          userId: params.userId,
          productId: params.input.productId,
          barcode: params.input.barcode,
          wineProducer: params.input.wineProducer,
          wineAppellation: params.input.wineAppellation,
          wineVintage: params.input.wineVintage,
        };
        return params.input;
      },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    restaurantId: "restaurant-server",
    userId: "owner-1",
    productId: "product-1",
    barcode: "8410869450199",
    wineProducer: "Tempos Vega Sicilia",
    wineAppellation: "Ribera del Duero",
    wineVintage: "2019",
  });
});
