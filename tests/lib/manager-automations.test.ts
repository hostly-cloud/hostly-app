import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManagerAutomationCopy,
  managerAutomationPriority,
  resolveManagerAutomationStage,
  shouldReopenManagerAutomation,
} from "@/lib/operations/manager-automations";
import type { OperationalAlertCenterAlert } from "@/lib/server/operations/operational-alert-center";

function alert(overrides: Partial<OperationalAlertCenterAlert> = {}): OperationalAlertCenterAlert {
  return {
    id: "order-1:kitchen:1",
    incidentId: "order-1__kitchen__1",
    incidentStatus: "open",
    snoozedUntilMs: null,
    kind: "production_delay",
    orderId: "order-1",
    restaurantId: "restaurant-1",
    tableLabel: "Mesa 7",
    station: "kitchen",
    stationLabel: "Cocina",
    stationHref: "/dashboard/operacion/cocina",
    level: "attention",
    escalated: false,
    elapsedMs: 12 * 60_000,
    elapsedMinutes: 12,
    oldestSentAtMs: 1,
    delayedLineCount: 2,
    thresholdMinutes: 10,
    criticalThresholdMinutes: 20,
    escalationAfterMinutes: 30,
    ...overrides,
  };
}

test("manager automation maps operational stages to bounded priorities", () => {
  assert.equal(resolveManagerAutomationStage(alert()), "attention");
  assert.equal(managerAutomationPriority("attention"), "medium");
  assert.equal(resolveManagerAutomationStage(alert({ level: "critical" })), "critical");
  assert.equal(managerAutomationPriority("critical"), "high");
  assert.equal(resolveManagerAutomationStage(alert({ escalated: true })), "escalated");
  assert.equal(managerAutomationPriority("escalated"), "urgent");
});

test("manager automation prepares navigation without mutating operational state", () => {
  const copy = buildManagerAutomationCopy(alert());
  assert.equal(copy.title, "Mesa 7: retraso en Cocina");
  assert.equal(copy.action.kind, "navigate");
  assert.equal(copy.action.href, "/dashboard/operacion/cocina");
  assert.equal(copy.action.label, "Abrir Cocina");
  assert.match(copy.detail, /2 líneas llevan/);
});

test("table service automation prepares a TPV review", () => {
  const copy = buildManagerAutomationCopy(alert({
    kind: "table_service_duration",
    station: "table",
    stationLabel: "Mesa",
    stationHref: "/dashboard/operacion/tpv",
    elapsedMinutes: 95,
    delayedLineCount: 1,
  }));
  assert.equal(copy.title, "Mesa 7: servicio prolongado");
  assert.equal(copy.action.href, "/dashboard/operacion/tpv");
  assert.equal(copy.action.label, "Abrir TPV");
});

test("acknowledged automation only reopens when the incident worsens", () => {
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
