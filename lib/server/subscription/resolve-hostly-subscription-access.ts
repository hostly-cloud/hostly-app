import type { Firestore } from "firebase-admin/firestore";
import {
  getHostlyPlanEntitlements,
  hasHostlyPlanEntitlement,
  type HostlyEntitlement,
} from "@/lib/subscription/hostly-entitlements";
import {
  resolveHostlyPlanFromRestaurant,
  type HostlyPlan,
  type HostlyPlanSource,
} from "@/lib/subscription/hostly-plan";

export type HostlySubscriptionAccess = {
  effectivePlan: HostlyPlan;
  source: HostlyPlanSource;
  entitlements: readonly HostlyEntitlement[];
};

export function resolveHostlySubscriptionAccessFromRestaurant(
  restaurant: Record<string, unknown> | null,
): HostlySubscriptionAccess {
  const { effectivePlan, source } = resolveHostlyPlanFromRestaurant(restaurant);
  return {
    effectivePlan,
    source,
    entitlements: [...getHostlyPlanEntitlements(effectivePlan)],
  };
}

export function subscriptionAccessHasEntitlement(
  access: HostlySubscriptionAccess,
  entitlement: HostlyEntitlement,
): boolean {
  return hasHostlyPlanEntitlement(access.effectivePlan, entitlement);
}

export async function resolveHostlySubscriptionAccess(params: {
  db: Firestore;
  restaurantId: string;
}): Promise<HostlySubscriptionAccess> {
  const restaurantId = params.restaurantId.trim();
  if (!restaurantId || restaurantId.includes("/") || restaurantId.includes("..")) {
    return resolveHostlySubscriptionAccessFromRestaurant(null);
  }

  const snapshot = await params.db.collection("restaurants").doc(restaurantId).get();
  const restaurant = snapshot.exists
    ? (snapshot.data() as Record<string, unknown>)
    : null;
  return resolveHostlySubscriptionAccessFromRestaurant(restaurant);
}
