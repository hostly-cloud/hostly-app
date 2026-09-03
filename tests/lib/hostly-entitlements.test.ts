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
});

test("Basic has no AI catalog image entitlement", () => {
  assert.deepEqual(getHostlyPlanEntitlements("basic"), []);
  assert.equal(
    hasHostlyPlanEntitlement("basic", "catalog.image.ai.single"),
    false,
  );
});

test("Pro enables individual generation and catalog search but not bulk generation", () => {
  assert.deepEqual(HOSTLY_PLAN_ENTITLEMENTS.pro, [
    "catalog.image.ai.single",
    "catalog.image.catalogSearch",
  ]);
  assert.equal(
    hasHostlyPlanEntitlement("pro", "catalog.image.ai.single"),
    true,
  );
  assert.equal(
    hasHostlyPlanEntitlement("pro", "catalog.image.ai.bulk"),
    false,
  );
});

test("Ultra enables the full confirmed catalog image entitlement set", () => {
  assert.deepEqual(HOSTLY_PLAN_ENTITLEMENTS.ultra, [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
  ]);
  assert.equal(
    hasHostlyPlanEntitlement("ultra", "catalog.image.ai.bulk"),
    true,
  );
});
