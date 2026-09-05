import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { resolveHostlyPlanFromRestaurant } from "@/lib/subscription/hostly-plan";
import { hostlyStripeConfigurationStatus } from "@/lib/subscription/hostly-stripe-billing";

export async function GET(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  const restaurantSnap = await authCtx.db
    .collection("restaurants")
    .doc(authCtx.restaurantId)
    .get();
  const restaurant = (restaurantSnap.data() ?? null) as Record<string, unknown> | null;
  const resolved = resolveHostlyPlanFromRestaurant(restaurant);
  const subscription =
    restaurant?.subscription && typeof restaurant.subscription === "object"
      ? (restaurant.subscription as Record<string, unknown>)
      : null;

  return NextResponse.json({
    ok: true,
    effectivePlan: resolved.effectivePlan,
    planSource: resolved.source,
    subscription: subscription
      ? {
          status: typeof subscription.status === "string" ? subscription.status : null,
          interval: typeof subscription.interval === "string" ? subscription.interval : null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
          currentPeriodEnd:
            typeof subscription.currentPeriodEnd === "number"
              ? subscription.currentPeriodEnd
              : null,
          customerLinked:
            typeof subscription.stripeCustomerId === "string" &&
            subscription.stripeCustomerId.trim().length > 0,
        }
      : null,
    billing: hostlyStripeConfigurationStatus(),
  });
}
