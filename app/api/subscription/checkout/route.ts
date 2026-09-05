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

  try {
    const session = await createHostlyCheckoutSession({
      restaurantId: authCtx.restaurantId,
      email: authCtx.email,
      plan,
      interval,
      baseUrl: requestBaseUrl(req),
    });
    return NextResponse.json({ ok: true, checkoutUrl: session.url });
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
