import assert from "node:assert/strict";
import test from "node:test";
import { hasCatalogImageCapability } from "@/lib/productos/catalog-image-plan";
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
