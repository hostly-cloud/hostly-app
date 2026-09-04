import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateHostlyCommercialFeature,
  type HostlyCommercialFeaturePolicy,
} from "@/lib/subscription/hostly-commercial-policy";

const pendingPolicy: HostlyCommercialFeaturePolicy<"example.pending"> = {
  key: "example.pending",
  status: "pending",
  plans: {},
};

const activePolicy: HostlyCommercialFeaturePolicy<"example.active"> = {
  key: "example.active",
  status: "active",
  plans: {
    basic: { access: "excluded", usage: { mode: "unlimited" } },
    pro: {
      access: "included",
      usage: { mode: "count", limit: 10, period: "month" },
    },
    ultra: { access: "included", usage: { mode: "unlimited" } },
  },
};

test("pending commercial policy never blocks existing Hostly behaviour", () => {
  assert.deepEqual(
    evaluateHostlyCommercialFeature({ plan: "basic", policy: pendingPolicy }),
    {
      featureKey: "example.pending",
      currentPlan: "basic",
      allowed: true,
      enforced: false,
      status: "pending_assignment",
      usage: null,
      upgrade: { status: "pending" },
    },
  );
});

test("an active excluded feature reports the nearest plan that includes it", () => {
  const decision = evaluateHostlyCommercialFeature({
    plan: "basic",
    policy: activePolicy,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.enforced, true);
  assert.equal(decision.status, "excluded");
  assert.deepEqual(decision.upgrade, { status: "available", targetPlan: "pro" });
});

test("an unlimited active feature is allowed without usage state", () => {
  const decision = evaluateHostlyCommercialFeature({
    plan: "ultra",
    policy: activePolicy,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.status, "included");
  assert.equal(decision.usage, null);
  assert.deepEqual(decision.upgrade, { status: "not_needed" });
});

test("count-based policies require trusted usage before allowing the operation", () => {
  const decision = evaluateHostlyCommercialFeature({
    plan: "pro",
    policy: activePolicy,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, "usage_required");
  assert.equal(decision.usage, null);
});

test("count-based policies expose deterministic remaining usage", () => {
  const decision = evaluateHostlyCommercialFeature({
    plan: "pro",
    policy: activePolicy,
    used: 4,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.status, "included");
  assert.deepEqual(decision.usage, {
    used: 4,
    limit: 10,
    remaining: 6,
    period: "month",
  });
});

test("reaching a plan limit denies the operation and resolves an upgrade", () => {
  const decision = evaluateHostlyCommercialFeature({
    plan: "pro",
    policy: activePolicy,
    used: 10,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, "usage_limit_reached");
  assert.deepEqual(decision.usage, {
    used: 10,
    limit: 10,
    remaining: 0,
    period: "month",
  });
  assert.deepEqual(decision.upgrade, { status: "available", targetPlan: "ultra" });
});

test("the highest plan reports unavailable when no higher assignment can serve it", () => {
  const ultraExcluded: HostlyCommercialFeaturePolicy = {
    key: "example.none",
    status: "active",
    plans: {
      basic: { access: "excluded", usage: { mode: "unlimited" } },
      pro: { access: "excluded", usage: { mode: "unlimited" } },
      ultra: { access: "excluded", usage: { mode: "unlimited" } },
    },
  };

  const decision = evaluateHostlyCommercialFeature({
    plan: "ultra",
    policy: ultraExcluded,
  });

  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.upgrade, { status: "unavailable" });
});

test("active count configuration fails closed when its limit is invalid", () => {
  const invalidPolicy: HostlyCommercialFeaturePolicy = {
    key: "example.invalid",
    status: "active",
    plans: {
      pro: {
        access: "included",
        usage: { mode: "count", limit: -1, period: "month" },
      },
      ultra: { access: "included", usage: { mode: "unlimited" } },
    },
  };

  const decision = evaluateHostlyCommercialFeature({
    plan: "pro",
    policy: invalidPolicy,
    used: 0,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, "configuration_required");
  assert.deepEqual(decision.upgrade, { status: "available", targetPlan: "ultra" });
});

test("an active but unassigned plan remains compatibility-safe during rollout", () => {
  const partiallyAssigned: HostlyCommercialFeaturePolicy = {
    key: "example.partial",
    status: "active",
    plans: {
      ultra: { access: "included", usage: { mode: "unlimited" } },
    },
  };

  const decision = evaluateHostlyCommercialFeature({
    plan: "basic",
    policy: partiallyAssigned,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.enforced, false);
  assert.equal(decision.status, "pending_assignment");
  assert.deepEqual(decision.upgrade, { status: "pending" });
});
