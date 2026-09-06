import assert from "node:assert/strict";
import test from "node:test";
import {
  HOSTLY_ENTITLEMENTS,
  HOSTLY_PLAN_ENTITLEMENTS,
  getHostlyPlanEntitlements,
  hasHostlyPlanEntitlement,
} from "@/lib/subscription/hostly-entitlements";
import { resolveTpvProductInfoAccess } from "@/lib/tpv/product-info-plan-access";

test("Hostly keeps commercial entitlements separated by module", () => {
  assert.deepEqual(HOSTLY_ENTITLEMENTS.catalogImages, [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
  ]);
  assert.deepEqual(HOSTLY_ENTITLEMENTS.tpvProductInfo, [
    "tpv.productInfo.gastronomy",
  ]);
  assert.deepEqual(HOSTLY_ENTITLEMENTS.ai, [
    "ai.managerAnalytics",
    "ai.sommelierPairing",
  ]);
  assert.deepEqual(HOSTLY_ENTITLEMENTS.operations, [
    "operations.managerAutomations",
  ]);
  assert.deepEqual(HOSTLY_ENTITLEMENTS.posMigration, [
    "migration.products",
    "migration.full",
  ]);
});

test("Basic has no AI, manager automation, gastronomy or automatic migration entitlement", () => {
  assert.deepEqual(getHostlyPlanEntitlements("basic"), []);
  assert.equal(hasHostlyPlanEntitlement("basic", "catalog.image.ai.single"), false);
  assert.equal(hasHostlyPlanEntitlement("basic", "tpv.productInfo.gastronomy"), false);
  assert.equal(hasHostlyPlanEntitlement("basic", "ai.managerAnalytics"), false);
  assert.equal(hasHostlyPlanEntitlement("basic", "ai.sommelierPairing"), false);
  assert.equal(hasHostlyPlanEntitlement("basic", "operations.managerAutomations"), false);
  assert.equal(hasHostlyPlanEntitlement("basic", "migration.products"), false);
  assert.equal(hasHostlyPlanEntitlement("basic", "migration.full"), false);
  assert.deepEqual(resolveTpvProductInfoAccess("basic"), {
    canOpenGastronomy: false,
    canSeeAllergens: false,
    canSeeWineProfile: false,
    canSeeAiPairings: false,
  });
});

test("Pro enables individual image tools, manager intelligence, automations and product migration", () => {
  assert.deepEqual(HOSTLY_PLAN_ENTITLEMENTS.pro, [
    "catalog.image.ai.single",
    "catalog.image.catalogSearch",
    "tpv.productInfo.gastronomy",
    "ai.managerAnalytics",
    "operations.managerAutomations",
    "migration.products",
  ]);
  assert.equal(hasHostlyPlanEntitlement("pro", "catalog.image.ai.single"), true);
  assert.equal(hasHostlyPlanEntitlement("pro", "catalog.image.ai.bulk"), false);
  assert.equal(hasHostlyPlanEntitlement("pro", "tpv.productInfo.gastronomy"), true);
  assert.equal(hasHostlyPlanEntitlement("pro", "ai.managerAnalytics"), true);
  assert.equal(hasHostlyPlanEntitlement("pro", "ai.sommelierPairing"), false);
  assert.equal(hasHostlyPlanEntitlement("pro", "operations.managerAutomations"), true);
  assert.equal(hasHostlyPlanEntitlement("pro", "migration.products"), true);
  assert.equal(hasHostlyPlanEntitlement("pro", "migration.full"), false);
  assert.deepEqual(resolveTpvProductInfoAccess("pro"), {
    canOpenGastronomy: true,
    canSeeAllergens: true,
    canSeeWineProfile: true,
    canSeeAiPairings: false,
  });
});

test("Ultra enables the complete catalog, manager intelligence, automation, Sommelier and migration set", () => {
  assert.deepEqual(HOSTLY_PLAN_ENTITLEMENTS.ultra, [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
    "tpv.productInfo.gastronomy",
    "ai.managerAnalytics",
    "ai.sommelierPairing",
    "operations.managerAutomations",
    "migration.products",
    "migration.full",
  ]);
  assert.equal(hasHostlyPlanEntitlement("ultra", "catalog.image.ai.bulk"), true);
  assert.equal(hasHostlyPlanEntitlement("ultra", "tpv.productInfo.gastronomy"), true);
  assert.equal(hasHostlyPlanEntitlement("ultra", "ai.managerAnalytics"), true);
  assert.equal(hasHostlyPlanEntitlement("ultra", "ai.sommelierPairing"), true);
  assert.equal(hasHostlyPlanEntitlement("ultra", "operations.managerAutomations"), true);
  assert.equal(hasHostlyPlanEntitlement("ultra", "migration.products"), true);
  assert.equal(hasHostlyPlanEntitlement("ultra", "migration.full"), true);
  assert.deepEqual(resolveTpvProductInfoAccess("ultra"), {
    canOpenGastronomy: true,
    canSeeAllergens: true,
    canSeeWineProfile: true,
    canSeeAiPairings: true,
  });
});
