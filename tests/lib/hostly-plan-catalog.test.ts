import assert from "node:assert/strict";
import test from "node:test";
import {
  HOSTLY_PLAN_CATALOG,
  getHostlyPlanCatalogEntry,
} from "@/lib/subscription/hostly-plan-catalog";

test("Hostly exposes Basic, Pro and Ultra as the stable commercial catalog", () => {
  assert.deepEqual(
    HOSTLY_PLAN_CATALOG.map(({ id, label, order }) => ({ id, label, order })),
    [
      { id: "basic", label: "Básico", order: 1 },
      { id: "pro", label: "Pro", order: 2 },
      { id: "ultra", label: "Ultra", order: 3 },
    ],
  );
});

test("feature assignment and pricing stay explicitly pending", () => {
  for (const plan of HOSTLY_PLAN_CATALOG) {
    assert.equal(plan.status, "defined");
    assert.equal(plan.featureAssignmentStatus, "pending");
    assert.equal(plan.pricingStatus, "pending");
    assert.equal("features" in plan, false);
    assert.equal("price" in plan, false);
  }
});

test("plan catalog entries are addressable by canonical plan id", () => {
  assert.equal(getHostlyPlanCatalogEntry("basic").label, "Básico");
  assert.equal(getHostlyPlanCatalogEntry("pro").label, "Pro");
  assert.equal(getHostlyPlanCatalogEntry("ultra").label, "Ultra");
});
