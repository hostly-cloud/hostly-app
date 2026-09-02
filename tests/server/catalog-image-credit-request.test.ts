import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import type { CatalogImageCreditAccountSummary } from "@/lib/productos/catalog-image-credit-contract";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import {
  handleCatalogImageCreditReconciliationRequest,
  handleCatalogImageCreditSummaryRequest,
} from "@/lib/server/product-images/handle-catalog-image-credit-request";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";

const SUMMARY: CatalogImageCreditAccountSummary = {
  access: resolveCatalogImageAccessFromRestaurant({
    subscription: {
      plan: "pro",
      catalogImages: {
        meteringMode: "credit_balance",
        creditBalance: 8,
        creditCosts: { aiSingle: 1, catalogSearch: 1 },
        creditPeriod: { id: "2026-09", startsAt: 1, endsAt: 999, allocation: 10 },
      },
    },
  }),
  period: { id: "2026-09", startsAt: 1, endsAt: 999, allocation: 10 },
  usage: {
    operations: 2,
    succeeded: 2,
    failed: 0,
    blocked: 0,
    consumedCredits: 2,
    reservedCredits: 0,
    releasedCredits: 0,
  },
  recentUsage: [],
};

function auth(overrides: Partial<AuthenticatedRestaurantContext> = {}) {
  return {
    uid: "owner-a",
    email: "owner@example.test",
    emailVerified: true,
    restaurantId: "restaurant-server",
    role: "owner",
    canManageUsers: true,
    db: {} as Firestore,
    ...overrides,
  } satisfies AuthenticatedRestaurantContext;
}

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test("credit summaries require settings.manage and use the authenticated tenant", async () => {
  let readTenant = "";
  const forbidden = await handleCatalogImageCreditSummaryRequest(
    new Request("http://localhost/api/catalog/product-image-credits"),
    {
      authenticate: async () => auth({ role: "manager" }),
      readSummary: async () => {
        throw new Error("should not run");
      },
    },
  );
  assert.equal(forbidden.status, 403);

  const response = await handleCatalogImageCreditSummaryRequest(
    new Request("http://localhost/api/catalog/product-image-credits"),
    {
      authenticate: async () => auth(),
      readSummary: async (params) => {
        readTenant = params.restaurantId;
        return SUMMARY;
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(readTenant, "restaurant-server");
  assert.deepEqual((await body(response)).summary, SUMMARY);
});

test("reconciliation rejects client tenants and requires explicit confirmation", async () => {
  let reconciled = false;
  const dependencies = {
    authenticate: async () => auth(),
    reconcile: async () => {
      reconciled = true;
      return { scanned: 0, released: 0, creditsReleased: 0, skipped: 0 };
    },
    readSummary: async () => SUMMARY,
  };
  const clientTenant = await handleCatalogImageCreditReconciliationRequest(
    new Request("http://localhost/api/catalog/product-image-credits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "reconcile_expired",
        confirmReconciliation: true,
        restaurantId: "restaurant-attacker",
      }),
    }),
    dependencies,
  );
  assert.equal(clientTenant.status, 400);
  assert.equal((await body(clientTenant)).error, "RESTAURANT_ID_NOT_ALLOWED");

  const unconfirmed = await handleCatalogImageCreditReconciliationRequest(
    new Request("http://localhost/api/catalog/product-image-credits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reconcile_expired" }),
    }),
    dependencies,
  );
  assert.equal(unconfirmed.status, 400);
  assert.equal(reconciled, false);
});

test("confirmed reconciliation remains tenant-scoped and returns the refreshed account", async () => {
  let received: { restaurantId: string; actorId: string } | undefined;
  const response = await handleCatalogImageCreditReconciliationRequest(
    new Request("http://localhost/api/catalog/product-image-credits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "reconcile_expired",
        confirmReconciliation: true,
      }),
    }),
    {
      authenticate: async () => auth(),
      reconcile: async (params) => {
        received = { restaurantId: params.restaurantId, actorId: params.actorId };
        return { scanned: 1, released: 1, creditsReleased: 2, skipped: 0 };
      },
      readSummary: async () => SUMMARY,
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    restaurantId: "restaurant-server",
    actorId: "owner-a",
  });
  const json = await body(response);
  assert.deepEqual(json.result, {
    scanned: 1,
    released: 1,
    creditsReleased: 2,
    skipped: 0,
  });
});
