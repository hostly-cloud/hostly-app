import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getHostlyMessaging } from "@/lib/firebase/admin";
import { hasCapability } from "@/lib/auth/hostly-capabilities";
import { readAuthorizedProfile } from "@/lib/server/auth/authorized-profile";
import { buildAndSyncOperationalAlertCenter } from "@/lib/server/operations/operational-alert-center";
import type { OperationalDelayAlert } from "@/lib/operations/operational-delay-alerts";
import {
  canClaimOperationalNotificationDelivery,
  operationalNotificationCopy,
  operationalNotificationRetryDelayMs,
  resolveOperationalNotificationStage,
  type OperationalNotificationChannel,
  type OperationalNotificationProviderAvailability,
} from "@/lib/operations/operational-notifications";

const MAX_ATTEMPTS = 5;
const DELIVERY_LEASE_MS = 45_000;
const DISPATCH_LEASE_MS = 50_000;
const TERMINAL_ORDER_STATUSES = new Set(["closed", "paid", "cancelled", "canceled", "merged"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function deliveryId(input: {
  incidentId: string;
  stage: string;
  channel: OperationalNotificationChannel;
  recipientId: string;
}): string {
  return hash(`${input.incidentId}|${input.stage}|${input.channel}|${input.recipientId}`);
}

function subscriptionsRef(db: Firestore, restaurantId: string) {
  return db.collection(`restaurants/${restaurantId}/operationalNotificationSubscriptions`);
}

function deliveriesRef(db: Firestore, restaurantId: string) {
  return db.collection(`restaurants/${restaurantId}/operationalNotificationDeliveries`);
}

export function getOperationalNotificationProviderAvailability(): OperationalNotificationProviderAvailability {
  const messagingSenderId = text(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID);
  const emailApiKey = text(process.env.HOSTLY_RESEND_API_KEY);
  const emailFrom = text(process.env.HOSTLY_ALERT_EMAIL_FROM);
  return {
    push: Boolean(messagingSenderId && getHostlyMessaging()),
    email: Boolean(emailApiKey && emailFrom),
    whatsapp: false,
    sms: false,
    vapidKeyConfigured: Boolean(text(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY)),
  };
}

type NotificationRecipient = {
  uid: string;
  email: string;
};

async function readOperationalNotificationRecipients(
  db: Firestore,
  restaurantId: string,
): Promise<NotificationRecipient[]> {
  const snapshot = await db.collection("users").where("restaurantId", "==", restaurantId).get();
  const recipients: NotificationRecipient[] = [];
  for (const document of snapshot.docs) {
    const data = document.data() as Record<string, unknown>;
    const email = text(data.email).toLowerCase();
    if (!email) continue;
    try {
      const profile = await readAuthorizedProfile(db, document.id, email);
      if (profile.restaurantId !== restaurantId || !profile.isActive) continue;
      if (!hasCapability(profile.role, "operations.audit")) continue;
      recipients.push({ uid: profile.uid, email: profile.email });
    } catch {
      // A profile requiring review must never receive operational data.
    }
  }
  return recipients;
}

async function claimDelivery(input: {
  db: Firestore;
  restaurantId: string;
  incidentId: string;
  stage: string;
  channel: OperationalNotificationChannel;
  recipientId: string;
  nowMs: number;
}): Promise<{ claimed: boolean; id: string; attemptCount: number }> {
  const id = deliveryId(input);
  const ref = deliveriesRef(input.db, input.restaurantId).doc(id);
  let attemptCount = 0;
  const claimed = await input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() as Record<string, unknown> : null;
    if (!canClaimOperationalNotificationDelivery(current, input.nowMs)) return false;
    attemptCount = Math.max(0, Number(current?.attemptCount) || 0) + 1;
    transaction.set(ref, {
      restaurantId: input.restaurantId,
      incidentId: input.incidentId,
      stage: input.stage,
      channel: input.channel,
      recipientId: input.recipientId,
      status: "sending",
      terminal: false,
      attemptCount,
      leaseUntilMs: input.nowMs + DELIVERY_LEASE_MS,
      nextAttemptAtMs: null,
      lastAttemptAtMs: input.nowMs,
      updatedAtMs: input.nowMs,
      createdAtMs: current?.createdAtMs ?? input.nowMs,
    }, { merge: true });
    return true;
  });
  return { claimed, id, attemptCount };
}

async function finishDelivery(input: {
  db: Firestore;
  restaurantId: string;
  id: string;
  success: boolean;
  attemptCount: number;
  nowMs: number;
  providerMessageId?: string | null;
  errorCode?: string | null;
  terminal?: boolean;
}): Promise<void> {
  const terminal = input.terminal === true || (!input.success && input.attemptCount >= MAX_ATTEMPTS);
  await deliveriesRef(input.db, input.restaurantId).doc(input.id).set({
    status: input.success ? "sent" : "failed",
    terminal: input.success ? true : terminal,
    leaseUntilMs: null,
    sentAtMs: input.success ? input.nowMs : null,
    providerMessageId: input.providerMessageId ?? null,
    errorCode: input.errorCode ?? null,
    nextAttemptAtMs: input.success || terminal
      ? null
      : input.nowMs + operationalNotificationRetryDelayMs(input.attemptCount),
    updatedAtMs: input.nowMs,
  }, { merge: true });
}

function emailHtml(copy: { title: string; body: string }, url: string): string {
  const escape = (value: string) => value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  return `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5"><h2>${escape(copy.title)}</h2><p>${escape(copy.body)}</p><p><a href="${escape(url)}">Abrir Centro de operaciones</a></p><p style="color:#64748b;font-size:12px">Hostly · alerta operativa automática</p></div>`;
}

async function sendOperationalEmail(input: {
  recipient: NotificationRecipient;
  alert: OperationalDelayAlert;
  idempotencyKey: string;
}): Promise<{ ok: boolean; messageId?: string; errorCode?: string; terminal?: boolean }> {
  const apiKey = text(process.env.HOSTLY_RESEND_API_KEY);
  const from = text(process.env.HOSTLY_ALERT_EMAIL_FROM);
  if (!apiKey || !from) return { ok: false, errorCode: "EMAIL_PROVIDER_NOT_CONFIGURED", terminal: true };
  const copy = operationalNotificationCopy(input.alert);
  const baseUrl = text(process.env.NEXT_PUBLIC_APP_URL) || text(process.env.NEXT_PUBLIC_SITE_URL) || "https://hostlyapp.app";
  const url = new URL("/dashboard/operacion/activity/alerts", baseUrl).toString();
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from,
        to: [input.recipient.email],
        subject: copy.title,
        text: `${copy.body}\n\n${url}`,
        html: emailHtml(copy, url),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => null) as { id?: unknown; message?: unknown } | null;
    if (response.ok) return { ok: true, messageId: text(payload?.id) || undefined };
    const terminal = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    return { ok: false, errorCode: `RESEND_${response.status}`, terminal };
  } catch (error) {
    return { ok: false, errorCode: error instanceof Error ? error.name : "EMAIL_NETWORK_ERROR" };
  }
}

async function sendPushToRecipient(input: {
  db: Firestore;
  restaurantId: string;
  recipient: NotificationRecipient;
  alert: OperationalDelayAlert;
}): Promise<{ ok: boolean; messageId?: string; errorCode?: string; terminal?: boolean }> {
  const messaging = getHostlyMessaging();
  if (!messaging) return { ok: false, errorCode: "PUSH_PROVIDER_NOT_CONFIGURED", terminal: true };
  const snapshot = await subscriptionsRef(input.db, input.restaurantId).where("uid", "==", input.recipient.uid).get();
  const subscriptions = snapshot.docs
    .map((document) => ({ document, token: text(document.data().token) }))
    .filter((entry) => entry.token);
  if (subscriptions.length === 0) return { ok: false, errorCode: "NO_PUSH_SUBSCRIPTION", terminal: true };
  const copy = operationalNotificationCopy(input.alert);
  const stage = resolveOperationalNotificationStage(input.alert);
  let successCount = 0;
  let lastMessageId = "";
  let lastErrorCode = "";
  for (let offset = 0; offset < subscriptions.length; offset += 500) {
    const chunk = subscriptions.slice(offset, offset + 500);
    const result = await messaging.sendEachForMulticast({
      tokens: chunk.map((entry) => entry.token),
      data: {
        title: copy.title,
        body: copy.body,
        url: "/dashboard/operacion/activity/alerts",
        incidentId: input.alert.id,
        stage,
      },
      webpush: {
        headers: { Urgency: stage === "attention" ? "normal" : "high" },
      },
    });
    successCount += result.successCount;
    result.responses.forEach((response, index) => {
      if (response.success) {
        lastMessageId = response.messageId;
        return;
      }
      const code = response.error?.code ?? "PUSH_SEND_FAILED";
      lastErrorCode = code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        void chunk[index]?.document.ref.delete().catch(() => undefined);
      }
    });
  }
  if (successCount > 0) return { ok: true, messageId: lastMessageId || undefined };
  const terminal = lastErrorCode === "messaging/registration-token-not-registered" || lastErrorCode === "messaging/invalid-registration-token";
  return { ok: false, errorCode: lastErrorCode || "PUSH_SEND_FAILED", terminal };
}

async function dispatchAlertForRestaurant(input: {
  db: Firestore;
  restaurantId: string;
  alert: OperationalDelayAlert & { incidentId: string };
  recipients: NotificationRecipient[];
  availability: OperationalNotificationProviderAvailability;
  pushEnabled: boolean;
  emailEnabled: boolean;
  nowMs: number;
}): Promise<{ sent: number; failed: number; skipped: number }> {
  const stage = resolveOperationalNotificationStage(input.alert);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const recipient of input.recipients) {
    for (const channel of ["push", "email"] as const) {
      const enabled = channel === "push" ? input.pushEnabled : input.emailEnabled;
      const available = channel === "push" ? input.availability.push : input.availability.email;
      if (!enabled || !available) {
        skipped += 1;
        continue;
      }
      const claim = await claimDelivery({
        db: input.db,
        restaurantId: input.restaurantId,
        incidentId: input.alert.incidentId,
        stage,
        channel,
        recipientId: recipient.uid,
        nowMs: input.nowMs,
      });
      if (!claim.claimed) {
        skipped += 1;
        continue;
      }
      const result = channel === "email"
        ? await sendOperationalEmail({
            recipient,
            alert: input.alert,
            idempotencyKey: `hostly-alert/${claim.id}`,
          })
        : await sendPushToRecipient({
            db: input.db,
            restaurantId: input.restaurantId,
            recipient,
            alert: input.alert,
          });
      await finishDelivery({
        db: input.db,
        restaurantId: input.restaurantId,
        id: claim.id,
        success: result.ok,
        attemptCount: claim.attemptCount,
        nowMs: input.nowMs,
        providerMessageId: result.messageId,
        errorCode: result.errorCode,
        terminal: result.terminal,
      });
      if (result.ok) sent += 1;
      else failed += 1;
    }
  }
  return { sent, failed, skipped };
}

async function claimGlobalDispatchLease(db: Firestore, nowMs: number): Promise<boolean> {
  const ref = db.doc("_hostlySystemJobs/operationalAlertNotifications");
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const leaseUntilMs = Number(snapshot.data()?.leaseUntilMs) || 0;
    if (leaseUntilMs > nowMs) return false;
    transaction.set(ref, {
      leaseUntilMs: nowMs + DISPATCH_LEASE_MS,
      lastStartedAtMs: nowMs,
      updatedAtMs: nowMs,
    }, { merge: true });
    return true;
  });
}

async function releaseGlobalDispatchLease(db: Firestore, nowMs: number): Promise<void> {
  await db.doc("_hostlySystemJobs/operationalAlertNotifications").set({
    leaseUntilMs: 0,
    lastFinishedAtMs: nowMs,
    updatedAtMs: nowMs,
  }, { merge: true });
}

async function activeRestaurantIds(db: Firestore): Promise<string[]> {
  const snapshot = await db.collection("orders")
    .where("status", "not-in", Array.from(TERMINAL_ORDER_STATUSES))
    .select("restaurantId", "status")
    .limit(5000)
    .get();
  const ids = new Set<string>();
  snapshot.docs.forEach((document) => {
    const data = document.data() as Record<string, unknown>;
    const restaurantId = text(data.restaurantId);
    const status = text(data.status).toLowerCase();
    if (restaurantId && !TERMINAL_ORDER_STATUSES.has(status)) ids.add(restaurantId);
  });
  return Array.from(ids);
}

export async function dispatchOperationalAlertNotifications(
  db: Firestore,
  nowMs = Date.now(),
): Promise<{
  acquired: boolean;
  restaurants: number;
  alerts: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const acquired = await claimGlobalDispatchLease(db, nowMs);
  if (!acquired) return { acquired: false, restaurants: 0, alerts: 0, sent: 0, failed: 0, skipped: 0 };
  let restaurants = 0;
  let alerts = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  try {
    const availability = getOperationalNotificationProviderAvailability();
    const restaurantIds = await activeRestaurantIds(db);
    for (const restaurantId of restaurantIds) {
      const center = await buildAndSyncOperationalAlertCenter(db, restaurantId, nowMs);
      if (!center.policy.enabled || center.alerts.length === 0) continue;
      if (!center.policy.notificationChannels.push && !center.policy.notificationChannels.email) continue;
      const recipients = await readOperationalNotificationRecipients(db, restaurantId);
      if (recipients.length === 0) continue;
      restaurants += 1;
      alerts += center.alerts.length;
      for (const alert of center.alerts) {
        const result = await dispatchAlertForRestaurant({
          db,
          restaurantId,
          alert,
          recipients,
          availability,
          pushEnabled: center.policy.notificationChannels.push,
          emailEnabled: center.policy.notificationChannels.email,
          nowMs,
        });
        sent += result.sent;
        failed += result.failed;
        skipped += result.skipped;
      }
    }
    return { acquired: true, restaurants, alerts, sent, failed, skipped };
  } finally {
    await releaseGlobalDispatchLease(db, Date.now()).catch(() => undefined);
  }
}
