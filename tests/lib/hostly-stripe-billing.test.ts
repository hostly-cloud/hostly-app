import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  createHostlyCheckoutSession,
  getHostlyStripePriceId,
  hostlyStripeConfigurationStatus,
  isHostlyStripeBillingEnabled,
  resolveHostlyStripePrice,
  verifyHostlyStripeWebhook,
} from "@/lib/subscription/hostly-stripe-billing";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withEnvAsync(
  values: Record<string, string | undefined>,
  run: () => Promise<void>,
) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Hostly SaaS billing is fail-closed by default", () => {
  withEnv(
    {
      HOSTLY_STRIPE_BILLING_ENABLED: undefined,
      STRIPE_SECRET_KEY: undefined,
      STRIPE_HOSTLY_SUBSCRIPTION_WEBHOOK_SECRET: undefined,
    },
    () => {
      assert.equal(isHostlyStripeBillingEnabled(), false);
      const status = hostlyStripeConfigurationStatus();
      assert.equal(status.enabled, false);
      assert.equal(status.secretKeyConfigured, false);
      assert.equal(status.webhookSecretConfigured, false);
    },
  );
});

test("Stripe Price IDs map bidirectionally to Hostly plan and interval", () => {
  withEnv(
    {
      HOSTLY_STRIPE_PRICE_BASIC_MONTHLY: "price_basic_m",
      HOSTLY_STRIPE_PRICE_BASIC_ANNUAL: "price_basic_y",
      HOSTLY_STRIPE_PRICE_PRO_MONTHLY: "price_pro_m",
      HOSTLY_STRIPE_PRICE_PRO_ANNUAL: "price_pro_y",
      HOSTLY_STRIPE_PRICE_ULTRA_MONTHLY: "price_ultra_m",
      HOSTLY_STRIPE_PRICE_ULTRA_ANNUAL: "price_ultra_y",
    },
    () => {
      assert.equal(getHostlyStripePriceId("pro", "month"), "price_pro_m");
      assert.deepEqual(resolveHostlyStripePrice("price_ultra_y"), {
        plan: "ultra",
        interval: "year",
      });
      assert.equal(resolveHostlyStripePrice("price_unknown"), null);
    },
  );
});

test("Stripe webhook verification accepts valid current signatures and rejects tampering", () => {
  const secret = "whsec_test_hostly";
  const timestamp = 1_800_000_000;
  const payload = JSON.stringify({ id: "evt_hostly", type: "customer.subscription.updated" });
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  withEnv(
    { STRIPE_HOSTLY_SUBSCRIPTION_WEBHOOK_SECRET: secret },
    () => {
      assert.equal(
        verifyHostlyStripeWebhook(payload, `t=${timestamp},v1=${signature}`, timestamp),
        true,
      );
      assert.equal(
        verifyHostlyStripeWebhook(`${payload}x`, `t=${timestamp},v1=${signature}`, timestamp),
        false,
      );
      assert.equal(
        verifyHostlyStripeWebhook(payload, `t=${timestamp - 301},v1=${signature}`, timestamp),
        false,
      );
    },
  );
});

test("Pro Checkout applies a 30-day trial only when eligible and forwards idempotency", async () => {
  await withEnvAsync(
    {
      HOSTLY_STRIPE_BILLING_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_test_hostly",
      HOSTLY_STRIPE_PRICE_PRO_MONTHLY: "price_pro_m",
    },
    async () => {
      const previousFetch = globalThis.fetch;
      let body: URLSearchParams | null = null;
      let idempotencyKey = "";
      globalThis.fetch = async (_input, init) => {
        body = init?.body as URLSearchParams;
        const headers = new Headers(init?.headers);
        idempotencyKey = headers.get("idempotency-key") ?? "";
        return new Response(JSON.stringify({ id: "cs_test", url: "https://checkout.stripe.test/session" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };
      try {
        const session = await createHostlyCheckoutSession({
          restaurantId: "restaurant_test",
          email: "owner@example.com",
          plan: "pro",
          interval: "month",
          baseUrl: "https://hostlyapp.app",
          proTrialEligible: true,
          idempotencyKey: "hostly-checkout:test:1234567890",
        });
        assert.equal(session.url, "https://checkout.stripe.test/session");
        assert.equal(body?.get("subscription_data[trial_period_days]"), "30");
        assert.equal(body?.get("payment_method_collection"), "always");
        assert.equal(body?.get("subscription_data[metadata][hostlyTrial]"), "pro_30d");
        assert.equal(
          body?.get("success_url"),
          "https://hostlyapp.app/dashboard/configuracion/cuenta?subscription=success",
        );
        assert.equal(idempotencyKey, "hostly-checkout:test:1234567890");
      } finally {
        globalThis.fetch = previousFetch;
      }
    },
  );
});
