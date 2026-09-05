import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { isOwnerOrAdminRole } from "@/lib/server/auth/profile-role";
import {
  createHostlyCheckoutSession,
  normalizeHostlyBillingInterval,
  normalizeRequestedHostlyPlan,
} from "@/lib/subscription/hostly-stripe-billing";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function requestBaseUrl(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(req.url).origin;
}

function safeIdempotencyKey(value: string | null): string | undefined {
  const key = value?.trim() ?? "";
  return /^[A-Za-z0-9:_-]{16,200}$/.test(key) ? key : undefined;
}

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!isOwnerOrAdminRole(authCtx.role)) {
    return jsonError(403, "SUBSCRIPTION_ADMIN_REQUIRED");
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "INVALID_JSON");

  const plan = normalizeRequestedHostlyPlan(body.plan);
  const interval = normalizeHostlyBillingInterval(body.interval);
  if (!plan || !interval) return jsonError(400, "INVALID_SUBSCRIPTION_SELECTION");

  const restaurantSnap = await authCtx.db
    .collection("restaurants")
    .doc(authCtx.restaurantId)
    .get();
  const restaurant = restaurantSnap.data() as Record<string, unknown> | undefined;
  const subscription =
    restaurant?.subscription && typeof restaurant.subscription === "object"
      ? (restaurant.subscription as Record<string, unknown>)
      : null;
  const linkedSubscriptionId =
    typeof subscription?.stripeSubscriptionId === "string"
      ? subscription.stripeSubscriptionId.trim()
      : "";
  if (linkedSubscriptionId) {
    return jsonError(409, "STRIPE_SUBSCRIPTION_ALREADY_LINKED");
  }
  const linkedCustomerId =
    typeof subscription?.stripeCustomerId === "string"
      ? subscription.stripeCustomerId.trim()
      : "";
  const proTrialEligible = plan === "pro" && subscription?.trialUsed !== true;

  try {
    const session = await createHostlyCheckoutSession({
      restaurantId: authCtx.restaurantId,
      email: authCtx.email,
      customerId: linkedCustomerId || null,
      plan,
      interval,
      baseUrl: requestBaseUrl(req),
      proTrialEligible,
      idempotencyKey: safeIdempotencyKey(req.headers.get("idempotency-key")),
    });
    return NextResponse.json({
      ok: true,
      checkoutUrl: session.url,
      trialDays: proTrialEligible ? 30 : 0,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "SUBSCRIPTION_CHECKOUT_FAILED";
    if (
      code === "HOSTLY_BILLING_DISABLED" ||
      code === "STRIPE_SECRET_KEY_MISSING" ||
      code === "STRIPE_PRICE_NOT_CONFIGURED"
    ) {
      return jsonError(503, code);
    }
    return jsonError(502, "SUBSCRIPTION_CHECKOUT_FAILED");
  }
}
