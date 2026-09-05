import type { OperationalDelayAlert } from "@/lib/operations/operational-delay-alerts";
import type { OperationalAlertPolicy } from "@/lib/operations/operational-alert-policy";

export type OperationalNotificationChannel = "push" | "email";
export type OperationalNotificationStage = "attention" | "critical" | "escalated";

export type OperationalNotificationProviderAvailability = {
  push: boolean;
  email: boolean;
  whatsapp: false;
  sms: false;
  vapidKeyConfigured: boolean;
};

export type OperationalNotificationDeliveryState = {
  status?: unknown;
  terminal?: unknown;
  leaseUntilMs?: unknown;
  nextAttemptAtMs?: unknown;
};

export function resolveOperationalNotificationStage(
  alert: Pick<OperationalDelayAlert, "level" | "escalated">,
): OperationalNotificationStage {
  if (alert.escalated) return "escalated";
  return alert.level === "critical" ? "critical" : "attention";
}

export function operationalNotificationRetryDelayMs(attemptCount: number): number {
  const attempt = Math.max(1, Math.floor(Number(attemptCount) || 1));
  return Math.min(30 * 60_000, 30_000 * 2 ** Math.min(6, attempt - 1));
}

export function canClaimOperationalNotificationDelivery(
  state: OperationalNotificationDeliveryState | null | undefined,
  nowMs: number,
): boolean {
  if (!state) return true;
  if (state.status === "sent" || state.terminal === true) return false;
  const leaseUntilMs = Number(state.leaseUntilMs) || 0;
  if (state.status === "sending" && leaseUntilMs > nowMs) return false;
  const nextAttemptAtMs = Number(state.nextAttemptAtMs) || 0;
  return nextAttemptAtMs <= nowMs;
}

export function providerBlockedChannels(
  policy: OperationalAlertPolicy,
  availability: OperationalNotificationProviderAvailability,
): OperationalNotificationChannel[] {
  const blocked: OperationalNotificationChannel[] = [];
  if (policy.notificationChannels.push && !availability.push) blocked.push("push");
  if (policy.notificationChannels.email && !availability.email) blocked.push("email");
  return blocked;
}

export function forceUnsupportedOperationalChannelsOff(
  policy: OperationalAlertPolicy,
): OperationalAlertPolicy {
  return {
    ...policy,
    notificationChannels: {
      ...policy.notificationChannels,
      whatsapp: false,
      sms: false,
    },
  };
}

export function operationalNotificationCopy(alert: OperationalDelayAlert): {
  title: string;
  body: string;
} {
  const stage = resolveOperationalNotificationStage(alert);
  const stageLabel = stage === "escalated" ? "Escalada" : stage === "critical" ? "Crítica" : "Atención";
  const title = `Hostly · ${alert.tableLabel} · ${stageLabel}`;
  const body = alert.kind === "table_service_duration"
    ? `Servicio de mesa abierto durante ${alert.elapsedMinutes} min.`
    : `${alert.stationLabel}: ${alert.delayedLineCount} ${alert.delayedLineCount === 1 ? "línea retrasada" : "líneas retrasadas"} · ${alert.elapsedMinutes} min.`;
  return { title, body };
}

export function isOperationalCronRequestAuthorized(input: {
  authorizationHeader: string | null;
  cronSecret: string | undefined;
  cronScheduleHeader: string | null;
  expectedSchedule: string;
  isVercel: boolean;
}): boolean {
  const secret = input.cronSecret?.trim();
  if (secret) {
    return input.authorizationHeader === `Bearer ${secret}`;
  }

  // Fallback for already-deployed projects that have not provisioned CRON_SECRET
  // yet. The endpoint accepts no tenant/payload input and is additionally guarded
  // by a global Firestore lease plus per-recipient idempotent delivery claims.
  return input.isVercel && input.cronScheduleHeader === input.expectedSchedule;
}
