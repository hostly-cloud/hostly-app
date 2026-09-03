import type { Firestore } from "firebase-admin/firestore";
import { getHostlyPlanEntitlements } from "@/lib/subscription/hostly-entitlements";
import { resolveHostlyPlanFromRestaurant } from "@/lib/subscription/hostly-plan";
import type { HostlySubscriptionAccess } from "@/lib/subscription/hostly-subscription-access";

export type { HostlySubscriptionAccess } from "@/lib/subscription/hostly-subscription-access";
export { subscriptionAccessHasEntitlement } from "@/lib/subscription/hostly-subscription-access";

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
