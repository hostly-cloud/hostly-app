import { createHmac, timingSafeEqual } from "node:crypto";
import type { HostlyPlan } from "@/lib/subscription/hostly-plan";
import { normalizeHostlyPlan } from "@/lib/subscription/hostly-plan";

export type HostlyBillingInterval = "month" | "year";

export type HostlyStripeSubscriptionSnapshot = {
  id: string;
  customerId: string;
  status: string;
  priceId: string;
  plan: HostlyPlan;
  interval: HostlyBillingInterval;
  currentPeriodEnd: number | null;
  trialEnd: number | null;
  cancelAtPeriodEnd: boolean;
};

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const WEBHOOK_TOLERANCE_SECONDS = 300;
const PRO_TRIAL_DAYS = 30;

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function isHostlyStripeBillingEnabled(): boolean {
  return env("HOSTLY_STRIPE_BILLING_ENABLED").toLowerCase() === "true";
}

export function getHostlyStripePriceId(
  plan: HostlyPlan,
  interval: HostlyBillingInterval,
): string | null {
  const suffix = `${plan.toUpperCase()}_${interval === "month" ? "MONTHLY" : "ANNUAL"}`;
  return env(`HOSTLY_STRIPE_PRICE_${suffix}`) || null;
}

export function resolveHostlyStripePrice(
  priceId: string,
): { plan: HostlyPlan; interval: HostlyBillingInterval } | null {
  for (const plan of ["basic", "pro", "ultra"] as const) {
    for (const interval of ["month", "year"] as const) {
      if (getHostlyStripePriceId(plan, interval) === priceId) {
        return { plan, interval };
      }
    }
  }
  return null;
}

export function hostlyStripeConfigurationStatus() {
  const prices = Object.fromEntries(
    (["basic", "pro", "ultra"] as const).map((plan) => [
      plan,
      {
        month: Boolean(getHostlyStripePriceId(plan, "month")),
        year: Boolean(getHostlyStripePriceId(plan, "year")),
      },
    ]),
  );
  return {
    enabled: isHostlyStripeBillingEnabled(),
    secretKeyConfigured: Boolean(env("STRIPE_SECRET_KEY")),
    webhookSecretConfigured: Boolean(env("STRIPE_HOSTLY_SUBSCRIPTION_WEBHOOK_SECRET")),
    prices,
  };
}

function requireStripeReady() {
  if (!isHostlyStripeBillingEnabled()) throw new Error("HOSTLY_BILLING_DISABLED");
  const secretKey = env("STRIPE_SECRET_KEY");
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY_MISSING");
  return secretKey;
}

async function stripeRequest<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: URLSearchParams; idempotencyKey?: string },
): Promise<T> {
  const secretKey = requireStripeReady();
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(init?.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init?.body,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;
  if (!response.ok || !payload) {
    const detail = payload?.error?.message?.slice(0, 160) ?? `HTTP_${response.status}`;
    throw new Error(`STRIPE_REQUEST_FAILED:${detail}`);
  }
  return payload;
}

export async function createHostlyCheckoutSession(input: {
  restaurantId: string;
  email: string;
  customerId?: string | null;
  plan: HostlyPlan;
  interval: HostlyBillingInterval;
  baseUrl: string;
  proTrialEligible?: boolean;
  idempotencyKey?: string;
}) {
  const priceId = getHostlyStripePriceId(input.plan, input.interval);
  if (!priceId) throw new Error("STRIPE_PRICE_NOT_CONFIGURED");

  const body = new URLSearchParams();
  body.set("mode", "subscription");
  const customerId = input.customerId?.trim();
  if (customerId) body.set("customer", customerId);
  else body.set("customer_email", input.email);
  body.set("client_reference_id", input.restaurantId);
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("success_url", `${input.baseUrl}/dashboard/configuracion/cuenta?subscription=success`);
  body.set("cancel_url", `${input.baseUrl}/dashboard/configuracion/cuenta?subscription=cancelled`);
  body.set("allow_promotion_codes", "true");
  body.set("metadata[restaurantId]", input.restaurantId);
  body.set("metadata[hostlyPlan]", input.plan);
  body.set("metadata[hostlyInterval]", input.interval);
  body.set("subscription_data[metadata][restaurantId]", input.restaurantId);
  body.set("subscription_data[metadata][hostlyPlan]", input.plan);
  body.set("subscription_data[metadata][hostlyInterval]", input.interval);

  if (input.plan === "pro" && input.proTrialEligible === true) {
    body.set("payment_method_collection", "always");
    body.set("subscription_data[trial_period_days]", String(PRO_TRIAL_DAYS));
    body.set("subscription_data[trial_settings][end_behavior][missing_payment_method]", "cancel");
    body.set("subscription_data[metadata][hostlyTrial]", "pro_30d");
  }

  const session = await stripeRequest<{ id: string; url: string | null }>(
    "/checkout/sessions",
    {
      method: "POST",
      body,
      idempotencyKey: input.idempotencyKey,
    },
  );
  if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");
  return session;
}

export async function createHostlyBillingPortalSession(input: {
  customerId: string;
  returnUrl: string;
}) {
  const body = new URLSearchParams();
  body.set("customer", input.customerId);
  body.set("return_url", input.returnUrl);
  const session = await stripeRequest<{ id: string; url: string }>(
    "/billing_portal/sessions",
    { method: "POST", body },
  );
  return session;
}

type StripeSubscriptionResponse = {
  id: string;
  customer: string | { id?: string };
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  trial_end?: number | null;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ price?: { id?: string } }> };
};

export async function retrieveHostlyStripeSubscription(
  subscriptionId: string,
): Promise<HostlyStripeSubscriptionSnapshot> {
  const subscription = await stripeRequest<StripeSubscriptionResponse>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  const priceId = subscription.items?.data?.[0]?.price?.id ?? "";
  const mapped = resolveHostlyStripePrice(priceId);
  if (!mapped) throw new Error("STRIPE_PRICE_NOT_RECOGNIZED");
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? "";
  if (!customerId) throw new Error("STRIPE_CUSTOMER_ID_MISSING");
  return {
    id: subscription.id,
    customerId,
    status: subscription.status,
    priceId,
    plan: mapped.plan,
    interval: mapped.interval,
    currentPeriodEnd:
      typeof subscription.current_period_end === "number"
        ? subscription.current_period_end
        : null,
    trialEnd: typeof subscription.trial_end === "number" ? subscription.trial_end : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
  };
}

export function verifyHostlyStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const secret = env("STRIPE_HOSTLY_SUBSCRIPTION_WEBHOOK_SECRET");
  if (!secret || !signatureHeader) return false;
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  const timestamp = Number(timestampPart?.slice(2));
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return signatures.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate, "utf8");
    return (
      candidateBuffer.length === expectedBuffer.length &&
      timingSafeEqual(candidateBuffer, expectedBuffer)
    );
  });
}

export function normalizeRequestedHostlyPlan(value: unknown): HostlyPlan | null {
  return normalizeHostlyPlan(value);
}

export function normalizeHostlyBillingInterval(
  value: unknown,
): HostlyBillingInterval | null {
  return value === "month" || value === "year" ? value : null;
}
