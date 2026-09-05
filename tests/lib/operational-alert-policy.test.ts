import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPERATIONAL_ALERT_POLICY,
  isOperationalAlertEscalated,
  resolveOperationalAlertLevel,
  sanitizeOperationalAlertPolicy,
} from "@/lib/operations/operational-alert-policy";
import { buildOperationalDelayAlerts } from "@/lib/operations/operational-delay-alerts";

test("operational alert policy keeps KDS defaults, table defaults and external channels off", () => {
  assert.equal(DEFAULT_OPERATIONAL_ALERT_POLICY.stations.kitchen.attentionMinutes, 8);
  assert.equal(DEFAULT_OPERATIONAL_ALERT_POLICY.stations.kitchen.criticalMinutes, 15);
  assert.equal(DEFAULT_OPERATIONAL_ALERT_POLICY.tableService.attentionMinutes, 20);
  assert.equal(DEFAULT_OPERATIONAL_ALERT_POLICY.tableService.criticalMinutes, 30);
  assert.equal(DEFAULT_OPERATIONAL_ALERT_POLICY.notificationChannels.inApp, true);
  assert.equal(DEFAULT_OPERATIONAL_ALERT_POLICY.notificationChannels.whatsapp, false);
});

test("sanitizer enforces critical after attention and bounded escalation", () => {
  const policy = sanitizeOperationalAlertPolicy({
    stations: {
      kitchen: { attentionMinutes: 20, criticalMinutes: 10, escalationMinutes: 999 },
    },
    tableService: { attentionMinutes: 25, criticalMinutes: 20, escalationMinutes: 999 },
    notificationChannels: { email: true },
  });
  assert.equal(policy.stations.kitchen.attentionMinutes, 20);
  assert.equal(policy.stations.kitchen.criticalMinutes, 21);
  assert.equal(policy.stations.kitchen.escalationMinutes, 120);
  assert.equal(policy.tableService.attentionMinutes, 25);
  assert.equal(policy.tableService.criticalMinutes, 26);
  assert.equal(policy.tableService.escalationMinutes, 120);
  assert.equal(policy.notificationChannels.email, true);
  assert.equal(policy.notificationChannels.inApp, true);
});

test("custom thresholds drive attention, critical and escalation", () => {
  const policy = sanitizeOperationalAlertPolicy({
    stations: { bar: { attentionMinutes: 5, criticalMinutes: 10, escalationMinutes: 4 } },
  });
  assert.equal(resolveOperationalAlertLevel(4 * 60_000, "bar", policy), "normal");
  assert.equal(resolveOperationalAlertLevel(5 * 60_000, "bar", policy), "attention");
  assert.equal(resolveOperationalAlertLevel(10 * 60_000, "bar", policy), "critical");
  assert.equal(isOperationalAlertEscalated(13 * 60_000, "bar", policy), false);
  assert.equal(isOperationalAlertEscalated(14 * 60_000, "bar", policy), true);
});

test("alert evaluator applies restaurant policy and flags escalated incidents", () => {
  const nowMs = 1_800_000;
  const policy = sanitizeOperationalAlertPolicy({
    stations: { kitchen: { attentionMinutes: 5, criticalMinutes: 10, escalationMinutes: 2 } },
  });
  const alerts = buildOperationalDelayAlerts({
    restaurantId: "r1",
    nowMs,
    policy,
    orders: [{
      id: "o1",
      restaurantId: "r1",
      table: "Mesa 7",
      status: "open",
      items: [{ status: "sent", station: "kitchen", sentAt: nowMs - 13 * 60_000 }],
    }],
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.kind, "production_delay");
  assert.equal(alerts[0]?.level, "critical");
  assert.equal(alerts[0]?.escalated, true);
  assert.equal(alerts[0]?.thresholdMinutes, 10);
  assert.equal(alerts[0]?.escalationAfterMinutes, 12);
});

test("table service alert starts at first real sent line and ignores draft autosave", () => {
  const nowMs = 3_600_000;
  const policy = sanitizeOperationalAlertPolicy({
    stations: {
      kitchen: { attentionMinutes: 90, criticalMinutes: 120, escalationMinutes: 10 },
      bar: { attentionMinutes: 90, criticalMinutes: 120, escalationMinutes: 10 },
      cocktail: { attentionMinutes: 90, criticalMinutes: 120, escalationMinutes: 10 },
    },
    tableService: { attentionMinutes: 20, criticalMinutes: 30, escalationMinutes: 10 },
  });

  const draftOnly = buildOperationalDelayAlerts({
    restaurantId: "r1",
    nowMs,
    policy,
    orders: [{
      id: "draft",
      restaurantId: "r1",
      table: "Mesa 2",
      status: "open",
      items: [{ status: "pending", station: "kitchen", createdAt: nowMs - 45 * 60_000 }],
    }],
  });
  assert.deepEqual(draftOnly, []);

  const alerts = buildOperationalDelayAlerts({
    restaurantId: "r1",
    nowMs,
    policy,
    orders: [{
      id: "o2",
      restaurantId: "r1",
      table: "Mesa 2",
      status: "sent",
      items: [
        { status: "served", station: "kitchen", sentAt: nowMs - 31 * 60_000 },
        { status: "sent", station: "bar", sentAt: nowMs - 5 * 60_000 },
      ],
    }],
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.kind, "table_service_duration");
  assert.equal(alerts[0]?.station, "table");
  assert.equal(alerts[0]?.level, "critical");
  assert.equal(alerts[0]?.elapsedMinutes, 31);
  assert.equal(alerts[0]?.delayedLineCount, 0);
});

test("table service alert uses order sentAt only as legacy fallback", () => {
  const nowMs = 3_600_000;
  const policy = sanitizeOperationalAlertPolicy({
    tableService: { attentionMinutes: 20, criticalMinutes: 30, escalationMinutes: 10 },
  });
  const alerts = buildOperationalDelayAlerts({
    restaurantId: "r1",
    nowMs,
    policy,
    orders: [{
      id: "legacy",
      restaurantId: "r1",
      table: "Mesa 8",
      status: "sent",
      sentAt: nowMs - 21 * 60_000,
      items: [],
    }],
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.kind, "table_service_duration");
  assert.equal(alerts[0]?.level, "attention");
});

test("closed tables do not keep table-duration incidents alive", () => {
  const nowMs = 3_600_000;
  const alerts = buildOperationalDelayAlerts({
    restaurantId: "r1",
    nowMs,
    orders: [{
      id: "closed",
      restaurantId: "r1",
      table: "Mesa 9",
      status: "closed",
      sentAt: nowMs - 60 * 60_000,
      items: [{ status: "served", sentAt: nowMs - 60 * 60_000 }],
    }],
  });
  assert.deepEqual(alerts, []);
});

test("disabled alert policy suppresses all alerts", () => {
  const policy = sanitizeOperationalAlertPolicy({ enabled: false });
  const alerts = buildOperationalDelayAlerts({
    restaurantId: "r1",
    nowMs: 1_000_000,
    policy,
    orders: [{
      id: "o1",
      restaurantId: "r1",
      items: [{ status: "sent", station: "kitchen", sentAt: 0 }],
    }],
  });
  assert.deepEqual(alerts, []);
});
