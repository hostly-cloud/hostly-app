import assert from "node:assert/strict";
import test from "node:test";
import {
  HOSTLY_ENTITLEMENTS,
  HOSTLY_PLAN_ENTITLEMENTS,
  getHostlyPlanEntitlements,
  hasHostlyPlanEntitlement,
} from "@/lib/subscription/hostly-entitlements";

test("Hostly keeps commercial entitlements separated by module", () => {
  assert.deepEqual(HOSTLY_ENTITLEMENTS.catalogImages, [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
  ]);
  assert.deepEqual(HOSTLY_ENTITLEMENTS.tpvProductInfo, [
    "tpv.productInfo.gastronomy",
  ]);
  assert.deepEqual(HOSTLY_ENTITLEMENTS.ai, ["ai.sommelierPairing"]);
});

test("Basic has no AI catalog image, product gastronomy or Sommelier entitlement", () => {
  assert.deepEqual(getHostlyPlanEntitlements("basic"), []);
  assert.equal(
    hasHostlyPlanEntitlement("basic", "catalog.image.ai.single"),
    false,
  );
  assert.equal(
    hasHostlyPlanEntitlement("basic", "tpv.productInfo.gastronomy"),
    false,
  );
  assert.equal(hasHostlyPlanEntitlement("basic", "ai.sommelierPairing"), false);
});

test("Pro enables individual image tools and TPV gastronomy, but not bulk generation or Sommelier", () => {
  assert.deepEqual(HOSTLY_PLAN_ENTITLEMENTS.pro, [
    "catalog.image.ai.single",
    "catalog.image.catalogSearch",
    "tpv.productInfo.gastronomy",
  ]);
  assert.equal(
    hasHostlyPlanEntitlement("pro", "catalog.image.ai.single"),
    true,
  );
  assert.equal(
    hasHostlyPlanEntitlement("pro", "catalog.image.ai.bulk"),
    false,
  );
  assert.equal(
    hasHostlyPlanEntitlement("pro", "tpv.productInfo.gastronomy"),
    true,
  );
  assert.equal(hasHostlyPlanEntitlement("pro", "ai.sommelierPairing"), false);
});

test("Ultra enables the complete catalog image, TPV gastronomy and Sommelier entitlement set", () => {
  assert.deepEqual(HOSTLY_PLAN_ENTITLEMENTS.ultra, [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
    "tpv.productInfo.gastronomy",
    "ai.sommelierPairing",
  ]);
  assert.equal(
    hasHostlyPlanEntitlement("ultra", "catalog.image.ai.bulk"),
    true,
  );
  assert.equal(
    hasHostlyPlanEntitlement("ultra", "tpv.productInfo.gastronomy"),
    true,
  );
  assert.equal(hasHostlyPlanEntitlement("ultra", "ai.sommelierPairing"), true);
});
