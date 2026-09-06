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
  assert.deepEqual(HOSTLY_ENTITLEMENTS.ai, ["ai.sommelierPairing"]);
  assert.deepEqual(HOSTLY_ENTITLEMENTS.posMigration, [
    "migration.products",
    "migration.full",
  ]);
});

test("Basic has no AI catalog image, product gastronomy, Sommelier or automatic migration entitlement", () => {
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
  assert.equal(hasHostlyPlanEntitlement("basic", "migration.products"), false);
  assert.equal(hasHostlyPlanEntitlement("basic", "migration.full"), false);
  assert.deepEqual(resolveTpvProductInfoAccess("basic"), {
    canOpenGastronomy: false,
    canSeeAllergens: false,
    canSeeWineProfile: false,
    canSeeAiPairings: false,
  });
});

test("Pro enables individual image tools, TPV gastronomy and product migration, but not bulk generation, Sommelier or full layout migration", () => {
  assert.deepEqual(HOSTLY_PLAN_ENTITLEMENTS.pro, [
    "catalog.image.ai.single",
    "catalog.image.catalogSearch",
    "tpv.productInfo.gastronomy",
    "migration.products",
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
  assert.equal(hasHostlyPlanEntitlement("pro", "migration.products"), true);
  assert.equal(hasHostlyPlanEntitlement("pro", "migration.full"), false);
  assert.deepEqual(resolveTpvProductInfoAccess("pro"), {
    canOpenGastronomy: true,
    canSeeAllergens: true,
    canSeeWineProfile: true,
    canSeeAiPairings: false,
  });
});

test("Ultra enables the complete catalog image, TPV gastronomy, Sommelier and migration entitlement set", () => {
  assert.deepEqual(HOSTLY_PLAN_ENTITLEMENTS.ultra, [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
    "tpv.productInfo.gastronomy",
    "ai.sommelierPairing",
    "migration.products",
    "migration.full",
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
  assert.equal(hasHostlyPlanEntitlement("ultra", "migration.products"), true);
  assert.equal(hasHostlyPlanEntitlement("ultra", "migration.full"), true);
  assert.deepEqual(resolveTpvProductInfoAccess("ultra"), {
    canOpenGastronomy: true,
    canSeeAllergens: true,
    canSeeWineProfile: true,
    canSeeAiPairings: true,
  });
});
