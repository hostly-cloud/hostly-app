import type { HostlyEntitlement } from "@/lib/subscription/hostly-entitlements";
import type {
  HostlyPlan,
  HostlyPlanSource,
} from "@/lib/subscription/hostly-plan";

export type HostlySubscriptionAccess = {
  effectivePlan: HostlyPlan;
  source: HostlyPlanSource;
  entitlements: readonly HostlyEntitlement[];
};

export function subscriptionAccessHasEntitlement(
  access: HostlySubscriptionAccess,
  entitlement: HostlyEntitlement,
): boolean {
  return access.entitlements.includes(entitlement);
}
