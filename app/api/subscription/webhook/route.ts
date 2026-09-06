import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import {
  isHostlyStripeBillingEnabled,
  isHostlyStripeSandboxMode,
  retrieveHostlyStripeSubscription,
  verifyHostlyStripeWebhook,
} from "@/lib/subscription/hostly-stripe-billing";

type StripeEvent = {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: Record<string, unknown> };
};

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function stringField(object: Record<string, unknown>, key: string): string {
  const value = object[key];
  return typeof value === "string" ? value.trim() : "";
}

function objectIdField(object: Record<string, unknown>, key: string): string {
  const value = object[key];
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const id = (value as Record<string, unknown>).id;
    return typeof id === "string" ? id.trim() : "";
  }
  return "";
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

function subscriptionFieldName(): "subscription" | "subscriptionSandbox" {
  return isHostlyStripeSandboxMode() ? "subscriptionSandbox" : "subscription";
}

function eventCollectionName(): "stripeWebhookEvents" | "stripeWebhookEventsSandbox" {
  return isHostlyStripeSandboxMode()
    ? "stripeWebhookEventsSandbox"
    : "stripeWebhookEvents";
}

async function syncSubscription(input: {
  subscriptionId: string;
  restaurantId?: string;
  deleted?: boolean;
  paymentFailedAt?: number | null;
}) {
  const db = getHostlyFirestore();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");
  const subscriptionField = subscriptionFieldName();

  if (input.deleted) {
    const restaurantId = input.restaurantId?.trim() ?? "";
    if (!restaurantId) throw new Error("STRIPE_RESTAURANT_ID_MISSING");
    await db.collection("restaurants").doc(restaurantId).set(
      {
        [subscriptionField]: {
          plan: "basic",
          status: "canceled",
          stripeSubscriptionId: FieldValue.delete(),
          stripePriceId: FieldValue.delete(),
          interval: FieldValue.delete(),
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          trialEnd: null,
          source: isHostlyStripeSandboxMode() ? "stripe_sandbox" : "stripe",
          lastCanceledSubscriptionId: input.subscriptionId,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
    return;
  }

  const snapshot = await retrieveHostlyStripeSubscription(input.subscriptionId);
  const restaurantId = input.restaurantId?.trim() || snapshot.restaurantId;
  if (restaurantId !== snapshot.restaurantId) {
    throw new Error("STRIPE_RESTAURANT_ID_MISMATCH");
  }

  const subscriptionUpdate: Record<string, unknown> = {
    plan: snapshot.plan,
    status: snapshot.status,
    interval: snapshot.interval,
    stripeCustomerId: snapshot.customerId,
    stripeSubscriptionId: snapshot.id,
    stripePriceId: snapshot.priceId,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    trialEnd: snapshot.trialEnd,
    source: isHostlyStripeSandboxMode() ? "stripe_sandbox" : "stripe",
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (snapshot.trialEnd !== null) subscriptionUpdate.trialUsed = true;
  if (input.paymentFailedAt) {
    subscriptionUpdate.lastPaymentFailedAt = input.paymentFailedAt;
  } else if (snapshot.status === "active" || snapshot.status === "trialing") {
    subscriptionUpdate.lastPaymentFailedAt = FieldValue.delete();
  }

  await db.collection("restaurants").doc(restaurantId).set(
    { [subscriptionField]: subscriptionUpdate },
    { merge: true },
  );
}

async function claimEvent(event: StripeEvent): Promise<"claimed" | "completed" | "busy"> {
  const db = getHostlyFirestore();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");
  const eventId = event.id?.trim() ?? "";
  if (!eventId) throw new Error("STRIPE_EVENT_ID_MISSING");
  const ref = db.collection(eventCollectionName()).doc(eventId);
  const token = randomUUID();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as Record<string, unknown> | undefined;
    if (data?.status === "completed") return "completed" as const;
    if (data?.status === "processing") {
      const startedAtMs = typeof data.startedAtMs === "number" ? data.startedAtMs : 0;
      if (Date.now() - startedAtMs < 60_000) return "busy" as const;
    }
    tx.set(
      ref,
      {
        status: "processing",
        token,
        mode: isHostlyStripeSandboxMode() ? "sandbox" : "live",
        type: event.type ?? null,
        stripeCreatedAt: event.created ?? null,
        startedAtMs: Date.now(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return "claimed" as const;
  });
}

async function completeEvent(event: StripeEvent, status: "completed" | "failed", error?: string) {
  const db = getHostlyFirestore();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");
  const eventId = event.id?.trim() ?? "";
  if (!eventId) return;
  await db.collection(eventCollectionName()).doc(eventId).set(
    {
      status,
      error: error ?? FieldValue.delete(),
      completedAt: status === "completed" ? FieldValue.serverTimestamp() : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
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
  if (!object || !event.type || !event.id) return jsonError(400, "INVALID_STRIPE_EVENT");

  let claim: "claimed" | "completed" | "busy";
  try {
    claim = await claimEvent(event);
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUBSCRIPTION_SYNC_FAILED";
    if (code === "ADMIN_NOT_CONFIGURED") return jsonError(503, code);
    return jsonError(500, "SUBSCRIPTION_SYNC_FAILED");
  }
  if (claim === "completed") {
    return NextResponse.json({ ok: true, received: true, duplicate: true, eventId: event.id });
  }
  if (claim === "busy") {
    return jsonError(409, "STRIPE_EVENT_ALREADY_PROCESSING");
  }

  try {
    if (event.type === "checkout.session.completed") {
      const restaurantId =
        stringField(object, "client_reference_id") || metadataRestaurantId(object);
      const subscriptionId = objectIdField(object, "subscription");
      if (!restaurantId || !subscriptionId) {
        throw new Error("STRIPE_SUBSCRIPTION_METADATA_MISSING");
      }
      await syncSubscription({ restaurantId, subscriptionId });
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const restaurantId = metadataRestaurantId(object);
      const subscriptionId = stringField(object, "id");
      if (!subscriptionId) throw new Error("STRIPE_SUBSCRIPTION_METADATA_MISSING");
      await syncSubscription({ restaurantId: restaurantId || undefined, subscriptionId });
    } else if (event.type === "customer.subscription.deleted") {
      const restaurantId = metadataRestaurantId(object);
      const subscriptionId = stringField(object, "id");
      if (!restaurantId || !subscriptionId) {
        throw new Error("STRIPE_SUBSCRIPTION_METADATA_MISSING");
      }
      await syncSubscription({ restaurantId, subscriptionId, deleted: true });
    } else if (event.type === "invoice.payment_failed") {
      const subscriptionId = objectIdField(object, "subscription");
      if (subscriptionId) {
        await syncSubscription({
          subscriptionId,
          paymentFailedAt: event.created ?? Math.floor(Date.now() / 1000),
        });
      }
    } else if (event.type === "invoice.paid") {
      const subscriptionId = objectIdField(object, "subscription");
      if (subscriptionId) await syncSubscription({ subscriptionId });
    }

    await completeEvent(event, "completed");
    return NextResponse.json({ ok: true, received: true, eventId: event.id });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "SUBSCRIPTION_SYNC_FAILED";
    await completeEvent(event, "failed", code).catch(() => undefined);
    if (code === "ADMIN_NOT_CONFIGURED" || code === "STRIPE_SECRET_KEY_MISSING") {
      return jsonError(503, code);
    }
    return jsonError(500, "SUBSCRIPTION_SYNC_FAILED");
  }
}
