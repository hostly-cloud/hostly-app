import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import {
  isHostlyStripeBillingEnabled,
  retrieveHostlyStripeSubscription,
  verifyHostlyStripeWebhook,
} from "@/lib/subscription/hostly-stripe-billing";

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function stringField(object: Record<string, unknown>, key: string): string {
  const value = object[key];
  return typeof value === "string" ? value.trim() : "";
}

function metadataRestaurantId(object: Record<string, unknown>): string {
  const metadata =
    object.metadata && typeof object.metadata === "object"
      ? (object.metadata as Record<string, unknown>)
      : null;
  return typeof metadata?.restaurantId === "string"
    ? metadata.restaurantId.trim()
    : "";
}

async function syncSubscription(input: {
  restaurantId: string;
  subscriptionId: string;
  deleted?: boolean;
}) {
  const db = getHostlyFirestore();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");
  const ref = db.collection("restaurants").doc(input.restaurantId);

  if (input.deleted) {
    await ref.set(
      {
        subscription: {
          plan: "basic",
          status: "canceled",
          stripeSubscriptionId: FieldValue.delete(),
          stripePriceId: FieldValue.delete(),
          interval: FieldValue.delete(),
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          source: "stripe",
          lastCanceledSubscriptionId: input.subscriptionId,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
    return;
  }

  const snapshot = await retrieveHostlyStripeSubscription(input.subscriptionId);
  await ref.set(
    {
      subscription: {
        plan: snapshot.plan,
        status: snapshot.status,
        interval: snapshot.interval,
        stripeCustomerId: snapshot.customerId,
        stripeSubscriptionId: snapshot.id,
        stripePriceId: snapshot.priceId,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        currentPeriodEnd: snapshot.currentPeriodEnd,
        source: "stripe",
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );
}

export async function POST(req: Request) {
  if (!isHostlyStripeBillingEnabled()) {
    return jsonError(503, "HOSTLY_BILLING_DISABLED");
  }

  const rawBody = await req.text();
  if (!verifyHostlyStripeWebhook(rawBody, req.headers.get("stripe-signature"))) {
    return jsonError(400, "INVALID_STRIPE_SIGNATURE");
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return jsonError(400, "INVALID_STRIPE_EVENT");
  }
  const object = event.data?.object;
  if (!object || !event.type) return jsonError(400, "INVALID_STRIPE_EVENT");

  try {
    if (event.type === "checkout.session.completed") {
      const restaurantId =
        stringField(object, "client_reference_id") || metadataRestaurantId(object);
      const subscriptionId = stringField(object, "subscription");
      if (!restaurantId || !subscriptionId) {
        return jsonError(400, "STRIPE_SUBSCRIPTION_METADATA_MISSING");
      }
      await syncSubscription({ restaurantId, subscriptionId });
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const restaurantId = metadataRestaurantId(object);
      const subscriptionId = stringField(object, "id");
      if (!restaurantId || !subscriptionId) {
        return jsonError(400, "STRIPE_SUBSCRIPTION_METADATA_MISSING");
      }
      await syncSubscription({ restaurantId, subscriptionId });
    } else if (event.type === "customer.subscription.deleted") {
      const restaurantId = metadataRestaurantId(object);
      const subscriptionId = stringField(object, "id");
      if (!restaurantId || !subscriptionId) {
        return jsonError(400, "STRIPE_SUBSCRIPTION_METADATA_MISSING");
      }
      await syncSubscription({ restaurantId, subscriptionId, deleted: true });
    }

    return NextResponse.json({ ok: true, received: true, eventId: event.id ?? null });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "SUBSCRIPTION_SYNC_FAILED";
    if (code === "ADMIN_NOT_CONFIGURED" || code === "STRIPE_SECRET_KEY_MISSING") {
      return jsonError(503, code);
    }
    return jsonError(500, "SUBSCRIPTION_SYNC_FAILED");
  }
}
