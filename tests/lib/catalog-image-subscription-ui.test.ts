import assert from "node:assert/strict";
import test from "node:test";
import { resolveCatalogImageSubscriptionUiAccess } from "@/lib/productos/catalog-image-subscription-ui";
import { resolveHostlySubscriptionAccessFromRestaurant } from "@/lib/server/subscription/resolve-hostly-subscription-access";

test("Basic hides automatic catalog image actions", () => {
  const access = resolveHostlySubscriptionAccessFromRestaurant({
    subscription: { plan: "basic" },
  });

  assert.deepEqual(resolveCatalogImageSubscriptionUiAccess(access), {
    canGenerateSingle: false,
    canSearchCatalog: false,
    canGenerateBulk: false,
  });
});

test("Pro exposes individual generation and catalog search but not bulk", () => {
  const access = resolveHostlySubscriptionAccessFromRestaurant({
    subscription: { plan: "pro" },
  });

  assert.deepEqual(resolveCatalogImageSubscriptionUiAccess(access), {
    canGenerateSingle: true,
    canSearchCatalog: true,
    canGenerateBulk: false,
  });
});

test("Ultra exposes the complete confirmed image workflow", () => {
  const access = resolveHostlySubscriptionAccessFromRestaurant({
    subscription: { plan: "ultra" },
  });

  assert.deepEqual(resolveCatalogImageSubscriptionUiAccess(access), {
    canGenerateSingle: true,
    canSearchCatalog: true,
    canGenerateBulk: true,
  });
});
