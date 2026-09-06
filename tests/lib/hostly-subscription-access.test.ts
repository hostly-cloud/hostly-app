import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveHostlySubscriptionAccessFromRestaurant,
  subscriptionAccessHasEntitlement,
} from "@/lib/server/subscription/resolve-hostly-subscription-access";

test("global subscription access resolves the canonical plan and entitlements", () => {
  const access = resolveHostlySubscriptionAccessFromRestaurant({
    subscription: { plan: "ultra" },
  });

  assert.equal(access.effectivePlan, "ultra");
  assert.equal(access.source, "subscription");
  assert.deepEqual(access.entitlements, [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
    "tpv.productInfo.gastronomy",
    "ai.sommelierPairing",
    "migration.products",
    "migration.full",
  ]);
  assert.equal(
    subscriptionAccessHasEntitlement(access, "catalog.image.ai.bulk"),
    true,
  );
  assert.equal(
    subscriptionAccessHasEntitlement(access, "tpv.productInfo.gastronomy"),
    true,
  );
  assert.equal(
    subscriptionAccessHasEntitlement(access, "ai.sommelierPairing"),
    true,
  );
  assert.equal(
    subscriptionAccessHasEntitlement(access, "migration.products"),
    true,
  );
  assert.equal(
    subscriptionAccessHasEntitlement(access, "migration.full"),
    true,
  );
});

test("global subscription access preserves the Pro compatibility fallback", () => {
  const access = resolveHostlySubscriptionAccessFromRestaurant({ name: "Legacy" });

  assert.equal(access.effectivePlan, "pro");
  assert.equal(access.source, "legacy_compatibility");
  assert.deepEqual(access.entitlements, [
    "catalog.image.ai.single",
    "catalog.image.catalogSearch",
    "tpv.productInfo.gastronomy",
    "migration.products",
  ]);
  assert.equal(
    subscriptionAccessHasEntitlement(access, "tpv.productInfo.gastronomy"),
    true,
  );
  assert.equal(
    subscriptionAccessHasEntitlement(access, "ai.sommelierPairing"),
    false,
  );
  assert.equal(
    subscriptionAccessHasEntitlement(access, "migration.products"),
    true,
  );
  assert.equal(
    subscriptionAccessHasEntitlement(access, "migration.full"),
    false,
  );
});

test("Basic exposes no confirmed commercial entitlements", () => {
  const access = resolveHostlySubscriptionAccessFromRestaurant({
    subscription: { plan: "basic" },
  });

  assert.equal(access.effectivePlan, "basic");
  assert.deepEqual(access.entitlements, []);
  assert.equal(
    subscriptionAccessHasEntitlement(access, "catalog.image.ai.single"),
    false,
  );
  assert.equal(
    subscriptionAccessHasEntitlement(access, "tpv.productInfo.gastronomy"),
    false,
  );
  assert.equal(
    subscriptionAccessHasEntitlement(access, "ai.sommelierPairing"),
    false,
  );
  assert.equal(
    subscriptionAccessHasEntitlement(access, "migration.products"),
    false,
  );
  assert.equal(
    subscriptionAccessHasEntitlement(access, "migration.full"),
    false,
  );
});

test("subscription.plan remains authoritative over legacy aliases", () => {
  const access = resolveHostlySubscriptionAccessFromRestaurant({
    plan: "ultra",
    billing: { plan: "ultra" },
    subscription: { plan: "basic" },
  });

  assert.equal(access.effectivePlan, "basic");
  assert.equal(access.source, "subscription");
  assert.deepEqual(access.entitlements, []);
});
