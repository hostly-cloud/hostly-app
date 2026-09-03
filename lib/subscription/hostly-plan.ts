export const HOSTLY_PLANS = ["basic", "pro", "ultra"] as const;

export type HostlyPlan = (typeof HOSTLY_PLANS)[number];

export type HostlyPlanSource =
  | "subscription"
  | "legacy_field"
  | "legacy_compatibility";

export type ResolvedHostlyPlan = {
  effectivePlan: HostlyPlan;
  source: HostlyPlanSource;
};

export const HOSTLY_LEGACY_COMPATIBILITY_PLAN: HostlyPlan = "pro";

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeHostlyPlan(value: unknown): HostlyPlan | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (HOSTLY_PLANS as readonly string[]).includes(normalized)
    ? (normalized as HostlyPlan)
    : null;
}

/**
 * `subscription.plan` is the canonical Hostly plan contract.
 * `billing.plan` and root-level `plan` remain read-only compatibility aliases
 * while legacy tenants are migrated.
 */
export function resolveHostlyPlanFromRestaurant(
  restaurant: Record<string, unknown> | null,
): ResolvedHostlyPlan {
  const subscription = readObject(restaurant?.subscription);
  const billing = readObject(restaurant?.billing);
  const subscriptionPlan = normalizeHostlyPlan(subscription?.plan);
  const legacyPlan =
    normalizeHostlyPlan(billing?.plan) ?? normalizeHostlyPlan(restaurant?.plan);

  if (subscriptionPlan) {
    return { effectivePlan: subscriptionPlan, source: "subscription" };
  }
  if (legacyPlan) {
    return { effectivePlan: legacyPlan, source: "legacy_field" };
  }
  return {
    effectivePlan: HOSTLY_LEGACY_COMPATIBILITY_PLAN,
    source: "legacy_compatibility",
  };
}

export function hostlyPlanLabel(plan: HostlyPlan): string {
  return plan === "basic" ? "Básico" : plan === "pro" ? "Pro" : "Ultra";
}
