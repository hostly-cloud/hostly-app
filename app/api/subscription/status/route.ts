import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import {
  normalizeHostlyPlan,
  resolveHostlyPlanFromRestaurant,
} from "@/lib/subscription/hostly-plan";
import {
  hostlyStripeConfigurationStatus,
  isHostlyStripeSandboxMode,
} from "@/lib/subscription/hostly-stripe-billing";

export async function GET(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  const restaurantSnap = await authCtx.db
    .collection("restaurants")
    .doc(authCtx.restaurantId)
    .get();
  const restaurant = (restaurantSnap.data() ?? null) as Record<string, unknown> | null;
  const resolved = resolveHostlyPlanFromRestaurant(restaurant);
  const sandboxMode = isHostlyStripeSandboxMode();
  const sourceField = sandboxMode ? "subscriptionSandbox" : "subscription";
  const subscription =
    restaurant?.[sourceField] && typeof restaurant[sourceField] === "object"
      ? (restaurant[sourceField] as Record<string, unknown>)
      : null;
  const sandboxPlan = sandboxMode ? normalizeHostlyPlan(subscription?.plan) : null;

  return NextResponse.json({
    ok: true,
    effectivePlan: sandboxPlan ?? resolved.effectivePlan,
    planSource: sandboxPlan ? "sandbox_subscription" : resolved.source,
    subscription: subscription
      ? {
          status: typeof subscription.status === "string" ? subscription.status : null,
          interval: typeof subscription.interval === "string" ? subscription.interval : null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
          currentPeriodEnd:
            typeof subscription.currentPeriodEnd === "number"
              ? subscription.currentPeriodEnd
              : null,
          trialEnd:
            typeof subscription.trialEnd === "number" ? subscription.trialEnd : null,
          trialUsed: subscription.trialUsed === true,
          lastPaymentFailedAt:
            typeof subscription.lastPaymentFailedAt === "number"
              ? subscription.lastPaymentFailedAt
              : null,
          customerLinked:
            typeof subscription.stripeCustomerId === "string" &&
            subscription.stripeCustomerId.trim().length > 0,
          subscriptionLinked:
            typeof subscription.stripeSubscriptionId === "string" &&
            subscription.stripeSubscriptionId.trim().length > 0,
        }
      : null,
    billing: hostlyStripeConfigurationStatus(),
  });
}
