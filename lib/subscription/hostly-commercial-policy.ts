import { HOSTLY_PLAN_CATALOG } from "@/lib/subscription/hostly-plan-catalog";
import type { HostlyPlan } from "@/lib/subscription/hostly-plan";

/**
 * Commercial plan policy is deliberately separate from user-role capabilities.
 * A role answers "may this person do it?"; this policy answers "does the
 * restaurant subscription include it and, if applicable, is usage available?".
 */
export type HostlyCommercialAssignment = "included" | "excluded";

export type HostlyCommercialUsagePolicy =
  | { mode: "unlimited" }
  | {
      mode: "count";
      limit: number;
      period: "day" | "month" | "billing_period";
    };

export type HostlyCommercialPlanAssignment = {
  access: HostlyCommercialAssignment;
  usage: HostlyCommercialUsagePolicy;
};

export type HostlyCommercialFeaturePolicy<Key extends string = string> = {
  key: Key;
  /**
   * `pending` never blocks existing behaviour. Change to `active` only after the
   * commercial matrix for this feature has been explicitly approved.
   */
  status: "pending" | "active";
  plans: Partial<Record<HostlyPlan, HostlyCommercialPlanAssignment>>;
};

export type HostlyCommercialUpgradeState =
  | { status: "not_needed" }
  | { status: "pending" }
  | { status: "available"; targetPlan: HostlyPlan }
  | { status: "unavailable" };

export type HostlyCommercialDecision = {
  featureKey: string;
  currentPlan: HostlyPlan;
  allowed: boolean;
  enforced: boolean;
  status:
    | "pending_assignment"
    | "included"
    | "excluded"
    | "usage_required"
    | "usage_limit_reached"
    | "configuration_required";
  usage:
    | null
    | {
        used: number;
        limit: number;
        remaining: number;
        period: "day" | "month" | "billing_period";
      };
  upgrade: HostlyCommercialUpgradeState;
};

function planOrder(plan: HostlyPlan): number {
  return HOSTLY_PLAN_CATALOG.find((entry) => entry.id === plan)?.order ?? 0;
}

function isValidCount(value: unknown): value is number {
  return Number.isFinite(value) && typeof value === "number" && value >= 0;
}

function assignmentCanServeUsage(
  assignment: HostlyCommercialPlanAssignment | undefined,
  requiredUsage: number | null,
): boolean {
  if (!assignment || assignment.access !== "included") return false;
  if (assignment.usage.mode === "unlimited") return true;
  if (!Number.isInteger(assignment.usage.limit) || assignment.usage.limit < 0) {
    return false;
  }
  return requiredUsage == null || assignment.usage.limit >= requiredUsage;
}

function resolveUpgrade(
  policy: HostlyCommercialFeaturePolicy,
  currentPlan: HostlyPlan,
  requiredUsage: number | null,
): HostlyCommercialUpgradeState {
  if (policy.status !== "active") return { status: "pending" };

  const currentOrder = planOrder(currentPlan);
  const target = HOSTLY_PLAN_CATALOG
    .filter((entry) => entry.order > currentOrder)
    .sort((a, b) => a.order - b.order)
    .find((entry) => assignmentCanServeUsage(policy.plans[entry.id], requiredUsage));

  return target
    ? { status: "available", targetPlan: target.id }
    : { status: "unavailable" };
}

/**
 * Pure evaluator shared by server guards and presentation code.
 *
 * Pending/unassigned policy is intentionally compatibility-safe (`allowed: true`,
 * `enforced: false`) so adding infrastructure cannot silently disable Hostly.
 * Once a policy is marked active, missing/invalid limit data fails closed.
 */
export function evaluateHostlyCommercialFeature(params: {
  plan: HostlyPlan;
  policy: HostlyCommercialFeaturePolicy;
  used?: number | null;
}): HostlyCommercialDecision {
  const { plan, policy } = params;

  if (policy.status !== "active" || !policy.plans[plan]) {
    return {
      featureKey: policy.key,
      currentPlan: plan,
      allowed: true,
      enforced: false,
      status: "pending_assignment",
      usage: null,
      upgrade: { status: "pending" },
    };
  }

  const assignment = policy.plans[plan];
  if (assignment.access === "excluded") {
    return {
      featureKey: policy.key,
      currentPlan: plan,
      allowed: false,
      enforced: true,
      status: "excluded",
      usage: null,
      upgrade: resolveUpgrade(policy, plan, null),
    };
  }

  if (assignment.usage.mode === "unlimited") {
    return {
      featureKey: policy.key,
      currentPlan: plan,
      allowed: true,
      enforced: true,
      status: "included",
      usage: null,
      upgrade: { status: "not_needed" },
    };
  }

  const limit = assignment.usage.limit;
  if (!Number.isInteger(limit) || limit < 0) {
    return {
      featureKey: policy.key,
      currentPlan: plan,
      allowed: false,
      enforced: true,
      status: "configuration_required",
      usage: null,
      upgrade: resolveUpgrade(policy, plan, null),
    };
  }

  if (!isValidCount(params.used)) {
    return {
      featureKey: policy.key,
      currentPlan: plan,
      allowed: false,
      enforced: true,
      status: "usage_required",
      usage: null,
      upgrade: resolveUpgrade(policy, plan, null),
    };
  }

  const used = params.used;
  const remaining = Math.max(0, limit - used);
  if (used >= limit) {
    return {
      featureKey: policy.key,
      currentPlan: plan,
      allowed: false,
      enforced: true,
      status: "usage_limit_reached",
      usage: {
        used,
        limit,
        remaining,
        period: assignment.usage.period,
      },
      upgrade: resolveUpgrade(policy, plan, used + 1),
    };
  }

  return {
    featureKey: policy.key,
    currentPlan: plan,
    allowed: true,
    enforced: true,
    status: "included",
    usage: {
      used,
      limit,
      remaining,
      period: assignment.usage.period,
    },
    upgrade: { status: "not_needed" },
  };
}
