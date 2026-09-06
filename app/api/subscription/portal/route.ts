import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { isOwnerOrAdminRole } from "@/lib/server/auth/profile-role";
import {
  createHostlyBillingPortalSession,
  isHostlyStripeSandboxMode,
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

  const restaurantSnap = await authCtx.db
    .collection("restaurants")
    .doc(authCtx.restaurantId)
    .get();
  const data = restaurantSnap.data() as Record<string, unknown> | undefined;
  const sourceField = isHostlyStripeSandboxMode()
    ? "subscriptionSandbox"
    : "subscription";
  const subscription =
    data?.[sourceField] && typeof data[sourceField] === "object"
      ? (data[sourceField] as Record<string, unknown>)
      : null;
  const customerId =
    typeof subscription?.stripeCustomerId === "string"
      ? subscription.stripeCustomerId.trim()
      : "";
  if (!customerId) return jsonError(409, "STRIPE_CUSTOMER_NOT_LINKED");

  try {
    const session = await createHostlyBillingPortalSession({
      customerId,
      returnUrl: `${requestBaseUrl(req)}/dashboard/configuracion/cuenta`,
    });
    return NextResponse.json({ ok: true, portalUrl: session.url });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "SUBSCRIPTION_PORTAL_FAILED";
    if (code === "HOSTLY_BILLING_DISABLED" || code === "STRIPE_SECRET_KEY_MISSING") {
      return jsonError(503, code);
    }
    return jsonError(502, "SUBSCRIPTION_PORTAL_FAILED");
  }
}
