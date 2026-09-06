import assert from "node:assert/strict";
import test from "node:test";
import type { OperationalDelayAlert } from "@/lib/operations/operational-delay-alerts";
import { sanitizeOperationalAlertPolicy } from "@/lib/operations/operational-alert-policy";
import {
  buildManagerAutomationCopy,
  managerAutomationPriority,
  resolveManagerAutomationStage,
  shouldReopenManagerAutomation,
} from "@/lib/operations/manager-automations";
import {
  canClaimOperationalNotificationDelivery,
  forceUnsupportedOperationalChannelsOff,
  isOperationalCronRequestAuthorized,
  operationalNotificationCopy,
  operationalNotificationRetryDelayMs,
  providerBlockedChannels,
  resolveOperationalNotificationStage,
} from "@/lib/operations/operational-notifications";

function alert(overrides: Partial<OperationalDelayAlert> = {}): OperationalDelayAlert {
  return {
    id: "order-1:table",
    kind: "table_service_duration",
    orderId: "order-1",
    restaurantId: "r1",
    tableLabel: "Mesa 7",
    station: "table",
    stationLabel: "Mesa",
    stationHref: "/dashboard/operacion/tpv",
    level: "attention",
    escalated: false,
    elapsedMs: 21 * 60_000,
    elapsedMinutes: 21,
    oldestSentAtMs: 1,
    delayedLineCount: 0,
    thresholdMinutes: 20,
    criticalThresholdMinutes: 30,
    escalationAfterMinutes: 40,
    ...overrides,
  };
}

test("notification stage advances attention -> critical -> escalated", () => {
  assert.equal(resolveOperationalNotificationStage(alert()), "attention");
  assert.equal(resolveOperationalNotificationStage(alert({ level: "critical" })), "critical");
  assert.equal(resolveOperationalNotificationStage(alert({ level: "critical", escalated: true })), "escalated");
});

test("delivery claim blocks sent, terminal and active leases but retries expired failures", () => {
  const now = 10_000;
  assert.equal(canClaimOperationalNotificationDelivery(null, now), true);
  assert.equal(canClaimOperationalNotificationDelivery({ status: "sent" }, now), false);
  assert.equal(canClaimOperationalNotificationDelivery({ status: "failed", terminal: true }, now), false);
  assert.equal(canClaimOperationalNotificationDelivery({ status: "sending", leaseUntilMs: now + 1 }, now), false);
  assert.equal(canClaimOperationalNotificationDelivery({ status: "sending", leaseUntilMs: now - 1 }, now), true);
  assert.equal(canClaimOperationalNotificationDelivery({ status: "failed", nextAttemptAtMs: now + 1 }, now), false);
  assert.equal(canClaimOperationalNotificationDelivery({ status: "failed", nextAttemptAtMs: now }, now), true);
});

test("retry backoff is bounded", () => {
  assert.equal(operationalNotificationRetryDelayMs(1), 30_000);
  assert.equal(operationalNotificationRetryDelayMs(2), 60_000);
  assert.equal(operationalNotificationRetryDelayMs(99), 30 * 60_000);
});

test("provider availability prevents phantom external channels", () => {
  const policy = sanitizeOperationalAlertPolicy({ notificationChannels: { push: true, email: true, whatsapp: true, sms: true } });
  assert.deepEqual(providerBlockedChannels(policy, {
    push: true,
    email: false,
    whatsapp: false,
    sms: false,
    vapidKeyConfigured: false,
  }), ["email"]);
  const safe = forceUnsupportedOperationalChannelsOff(policy);
  assert.equal(safe.notificationChannels.push, true);
  assert.equal(safe.notificationChannels.email, true);
  assert.equal(safe.notificationChannels.whatsapp, false);
  assert.equal(safe.notificationChannels.sms, false);
});

test("notification copy distinguishes table duration and production delays", () => {
  assert.match(operationalNotificationCopy(alert()).title, /Mesa 7/);
  assert.match(operationalNotificationCopy(alert()).body, /21 min/);
  const production = alert({
    id: "order-1:kitchen",
    kind: "production_delay",
    station: "kitchen",
    stationLabel: "Cocina",
    delayedLineCount: 2,
    elapsedMinutes: 16,
  });
  assert.match(operationalNotificationCopy(production).body, /Cocina/);
  assert.match(operationalNotificationCopy(production).body, /2 líneas retrasadas/);
});

test("cron authorization prefers CRON_SECRET and has a narrow Vercel fallback", () => {
  assert.equal(isOperationalCronRequestAuthorized({
    authorizationHeader: "Bearer secret",
    cronSecret: "secret",
    cronScheduleHeader: null,
    expectedSchedule: "* * * * *",
    isVercel: true,
  }), true);
  assert.equal(isOperationalCronRequestAuthorized({
    authorizationHeader: "Bearer wrong",
    cronSecret: "secret",
    cronScheduleHeader: "* * * * *",
    expectedSchedule: "* * * * *",
    isVercel: true,
  }), false);
  assert.equal(isOperationalCronRequestAuthorized({
    authorizationHeader: null,
    cronSecret: undefined,
    cronScheduleHeader: "* * * * *",
    expectedSchedule: "* * * * *",
    isVercel: true,
  }), true);
  assert.equal(isOperationalCronRequestAuthorized({
    authorizationHeader: null,
    cronSecret: undefined,
    cronScheduleHeader: "* * * * *",
    expectedSchedule: "* * * * *",
    isVercel: false,
  }), false);
});

test("manager automation maps attention, critical and escalation to bounded priorities", () => {
  assert.equal(resolveManagerAutomationStage(alert()), "attention");
  assert.equal(managerAutomationPriority("attention"), "medium");
  assert.equal(resolveManagerAutomationStage(alert({ level: "critical" })), "critical");
  assert.equal(managerAutomationPriority("critical"), "high");
  assert.equal(resolveManagerAutomationStage(alert({ level: "critical", escalated: true })), "escalated");
  assert.equal(managerAutomationPriority("escalated"), "urgent");
});

test("manager automation only prepares safe navigation actions", () => {
  const production = alert({
    kind: "production_delay",
    station: "kitchen",
    stationLabel: "Cocina",
    stationHref: "/dashboard/operacion/cocina",
    delayedLineCount: 2,
    elapsedMinutes: 16,
  });
  const copy = buildManagerAutomationCopy(production);
  assert.equal(copy.title, "Mesa 7: retraso en Cocina");
  assert.deepEqual(copy.action, {
    kind: "navigate",
    href: "/dashboard/operacion/cocina",
    label: "Abrir Cocina",
  });
  assert.match(copy.detail, /2 líneas llevan/);
});

test("acknowledged automation remains quiet unless the incident worsens", () => {
  assert.equal(shouldReopenManagerAutomation({
    previousStatus: "acknowledged",
    previousStage: "attention",
    nextStage: "attention",
  }), false);
  assert.equal(shouldReopenManagerAutomation({
    previousStatus: "acknowledged",
    previousStage: "attention",
    nextStage: "critical",
  }), true);
  assert.equal(shouldReopenManagerAutomation({
    previousStatus: "active",
    previousStage: "attention",
    nextStage: "critical",
  }), false);
});
