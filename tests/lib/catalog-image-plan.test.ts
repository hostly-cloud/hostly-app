import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCatalogImageCreditDecision,
  hasCatalogImageCapability,
} from "@/lib/productos/catalog-image-plan";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";

test("Basic keeps manual images but exposes no automatic catalog capability", () => {
  const access = resolveCatalogImageAccessFromRestaurant({
    subscription: { plan: "basic" },
  });

  assert.equal(access.effectivePlan, "basic");
  assert.equal(access.source, "subscription");
  assert.equal(
    hasCatalogImageCapability(access, "catalog.image.ai.single"),
    false,
  );
  assert.equal(
    hasCatalogImageCapability(access, "catalog.image.ai.bulk"),
    false,
  );
  assert.equal(
    hasCatalogImageCapability(access, "catalog.image.catalogSearch"),
    false,
  );
});

test("Pro permits individual generation and catalog search, not bulk", () => {
  const access = resolveCatalogImageAccessFromRestaurant({
    subscription: { plan: "pro" },
  });

  assert.equal(
    hasCatalogImageCapability(access, "catalog.image.ai.single"),
    true,
  );
  assert.equal(
    hasCatalogImageCapability(access, "catalog.image.catalogSearch"),
    true,
  );
  assert.equal(
    hasCatalogImageCapability(access, "catalog.image.ai.bulk"),
    false,
  );
});

test("Ultra exposes all catalog image capabilities", () => {
  const access = resolveCatalogImageAccessFromRestaurant({
    subscription: { plan: "ultra" },
  });

  assert.equal(
    hasCatalogImageCapability(access, "catalog.image.ai.single"),
    true,
  );
  assert.equal(
    hasCatalogImageCapability(access, "catalog.image.ai.bulk"),
    true,
  );
  assert.equal(
    hasCatalogImageCapability(access, "catalog.image.catalogSearch"),
    true,
  );
});

test("tenants without a configured plan retain individual access during transition", () => {
  const access = resolveCatalogImageAccessFromRestaurant({ name: "Legacy" });

  assert.equal(access.effectivePlan, "pro");
  assert.equal(access.source, "legacy_compatibility");
  assert.equal(
    hasCatalogImageCapability(access, "catalog.image.ai.single"),
    true,
  );
  assert.equal(
    hasCatalogImageCapability(access, "catalog.image.ai.bulk"),
    false,
  );
});

test("the canonical subscription plan wins over legacy aliases", () => {
  const access = resolveCatalogImageAccessFromRestaurant({
    plan: "ultra",
    billing: { plan: "ultra" },
    subscription: { plan: "basic" },
  });

  assert.equal(access.effectivePlan, "basic");
  assert.equal(access.source, "subscription");
});

test("a recognized legacy plan remains traceable during migration", () => {
  const access = resolveCatalogImageAccessFromRestaurant({
    billing: { plan: "ultra" },
  });

  assert.equal(access.effectivePlan, "ultra");
  assert.equal(access.source, "legacy_field");
});

test("legacy tenants remain usage-recorded without an invented credit limit", () => {
  const access = resolveCatalogImageAccessFromRestaurant({ name: "Legacy" });

  assert.equal(access.meteringMode, "usage_recorded");
  assert.equal(access.creditBalance, null);
  assert.deepEqual(access.creditCosts, {
    aiSingle: null,
    aiBulk: null,
    catalogSearch: null,
  });
  assert.deepEqual(
    evaluateCatalogImageCreditDecision(access, "catalog.image.ai.single"),
    { status: "unmetered", creditCost: null },
  );
});

test("an explicit credit balance centralizes per-capability costs", () => {
  const access = resolveCatalogImageAccessFromRestaurant({
    subscription: {
      plan: "ultra",
      catalogImages: {
        meteringMode: "credit_balance",
        creditBalance: 7,
        creditCosts: { aiSingle: 2, aiBulk: 3, catalogSearch: 1 },
      },
    },
  });

  assert.equal(access.meteringMode, "credit_balance");
  assert.equal(access.creditBalance, 7);
  assert.deepEqual(access.creditCosts, {
    aiSingle: 2,
    aiBulk: 3,
    catalogSearch: 1,
  });
  assert.deepEqual(
    evaluateCatalogImageCreditDecision(access, "catalog.image.ai.bulk"),
    {
      status: "available",
      creditCost: 3,
      creditBalanceBefore: 7,
      creditBalanceAfter: 4,
    },
  );
});

test("explicit metering fails closed when its required cost is incomplete", () => {
  const access = resolveCatalogImageAccessFromRestaurant({
    subscription: {
      plan: "pro",
      catalogImages: {
        meteringMode: "credit_balance",
        creditBalance: 4,
        creditCosts: {},
      },
    },
  });

  assert.deepEqual(
    evaluateCatalogImageCreditDecision(access, "catalog.image.ai.single"),
    { status: "configuration_required", creditCost: null },
  );
});

test("an insufficient explicit balance is reported before generation", () => {
  const access = resolveCatalogImageAccessFromRestaurant({
    subscription: {
      plan: "pro",
      catalogImages: {
        meteringMode: "credit_balance",
        creditBalance: 1,
        creditCosts: { aiSingle: 2 },
      },
    },
  });

  assert.deepEqual(
    evaluateCatalogImageCreditDecision(access, "catalog.image.ai.single"),
    { status: "insufficient", creditCost: 2, creditBalance: 1 },
  );
});
