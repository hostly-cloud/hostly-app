import assert from "node:assert/strict";
import test from "node:test";
import {
  HOSTLY_LEGACY_COMPATIBILITY_PLAN,
  HOSTLY_PLANS,
  hostlyPlanLabel,
  normalizeHostlyPlan,
  resolveHostlyPlanFromRestaurant,
} from "@/lib/subscription/hostly-plan";

test("Hostly exposes the shared Basic, Pro and Ultra plan contract", () => {
  assert.deepEqual(HOSTLY_PLANS, ["basic", "pro", "ultra"]);
  assert.equal(HOSTLY_LEGACY_COMPATIBILITY_PLAN, "pro");
});

test("plan normalization accepts canonical values without depending on casing", () => {
  assert.equal(normalizeHostlyPlan(" basic "), "basic");
  assert.equal(normalizeHostlyPlan("PRO"), "pro");
  assert.equal(normalizeHostlyPlan("Ultra"), "ultra");
  assert.equal(normalizeHostlyPlan("enterprise"), null);
  assert.equal(normalizeHostlyPlan(null), null);
});

test("subscription.plan is the canonical plan source", () => {
  assert.deepEqual(
    resolveHostlyPlanFromRestaurant({
      plan: "ultra",
      billing: { plan: "ultra" },
      subscription: { plan: "basic" },
    }),
    { effectivePlan: "basic", source: "subscription" },
  );
});

test("legacy aliases remain readable while tenants migrate", () => {
  assert.deepEqual(
    resolveHostlyPlanFromRestaurant({ billing: { plan: "ultra" } }),
    { effectivePlan: "ultra", source: "legacy_field" },
  );
  assert.deepEqual(resolveHostlyPlanFromRestaurant({ plan: "basic" }), {
    effectivePlan: "basic",
    source: "legacy_field",
  });
});

test("an unconfigured or invalid tenant keeps the current Pro compatibility fallback", () => {
  assert.deepEqual(resolveHostlyPlanFromRestaurant({ name: "Legacy" }), {
    effectivePlan: "pro",
    source: "legacy_compatibility",
  });
  assert.deepEqual(
    resolveHostlyPlanFromRestaurant({ subscription: { plan: "unknown" } }),
    { effectivePlan: "pro", source: "legacy_compatibility" },
  );
});

test("plan labels are shared across modules", () => {
  assert.equal(hostlyPlanLabel("basic"), "Básico");
  assert.equal(hostlyPlanLabel("pro"), "Pro");
  assert.equal(hostlyPlanLabel("ultra"), "Ultra");
});
