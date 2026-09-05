import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOperationalDelayAlerts,
  readOperationalTimestampMs,
  type OperationalDelayAlert,
  type OperationalOrderRecord,
} from "../../lib/operations/operational-delay-alerts";

const NOW = Date.UTC(2026, 8, 4, 18, 0, 0);

function order(overrides: Partial<OperationalOrderRecord> = {}): OperationalOrderRecord {
  return {
    id: "order-1",
    restaurantId: "rest-1",
    table: "Mesa 7",
    status: "open",
    items: [],
    ...overrides,
  };
}

function line(minutes: number, station: "kitchen" | "bar" | "cocktail" | "none" = "kitchen", status = "sent", id = "line-1") {
  return { id, name: "Producto", qty: 1, status, station, sentAt: NOW - minutes * 60_000 };
}

function productionAlerts(alerts: OperationalDelayAlert[]): OperationalDelayAlert[] {
  return alerts.filter((alert) => alert.kind === "production_delay");
}

test("aísla por restaurante e ignora pedidos terminales", () => {
  const alerts = productionAlerts(buildOperationalDelayAlerts({
    restaurantId: "rest-1",
    nowMs: NOW,
    orders: [
      order({ items: [line(16)] }),
      order({ id: "foreign", restaurantId: "rest-2", items: [line(30)] }),
      order({ id: "paid", status: "paid", items: [line(30)] }),
      order({ id: "cancelled", status: "cancelled", items: [line(30)] }),
      order({ id: "closed", status: "closed", items: [line(30)] }),
    ],
  }));
  assert.deepEqual(alerts.map((alert) => alert.orderId), ["order-1"]);
  assert.equal(alerts[0]?.level, "critical");
});

test("respeta los umbrales SLA de cada estación", () => {
  const alerts = productionAlerts(buildOperationalDelayAlerts({
    restaurantId: "rest-1",
    nowMs: NOW,
    orders: [
      order({ id: "k-normal", items: [line(7.99)] }),
      order({ id: "k-attention", items: [line(8)] }),
      order({ id: "k-critical", items: [line(15)] }),
      order({ id: "b-attention", items: [line(3, "bar")] }),
      order({ id: "b-critical", items: [line(6, "bar")] }),
      order({ id: "c-critical", items: [line(6, "cocktail")] }),
    ],
  }));
  assert.equal(alerts.some((alert) => alert.orderId === "k-normal"), false);
  assert.equal(alerts.find((a) => a.orderId === "k-attention")?.level, "attention");
  assert.equal(alerts.find((a) => a.orderId === "k-critical")?.level, "critical");
  assert.equal(alerts.find((a) => a.orderId === "b-attention")?.thresholdMinutes, 3);
  assert.equal(alerts.find((a) => a.orderId === "b-critical")?.thresholdMinutes, 6);
  assert.equal(alerts.find((a) => a.orderId === "c-critical")?.stationLabel, "Coctelería");
});

test("agrupa por pedido y estación y usa la línea más antigua", () => {
  const alerts = productionAlerts(buildOperationalDelayAlerts({
    restaurantId: "rest-1",
    nowMs: NOW,
    orders: [order({ items: [line(9, "kitchen", "sent", "k1"), line(16, "kitchen", "sent", "k2"), line(4, "bar", "sent", "b1")] })],
  }));
  assert.equal(alerts.length, 2);
  const kitchen = alerts.find((a) => a.station === "kitchen");
  assert.equal(kitchen?.delayedLineCount, 2);
  assert.equal(kitchen?.elapsedMinutes, 16);
  assert.equal(kitchen?.level, "critical");
});

test("solo incluye líneas en producción y excluye destino none", () => {
  const alerts = productionAlerts(buildOperationalDelayAlerts({
    restaurantId: "rest-1",
    nowMs: NOW,
    orders: [order({ items: [line(20, "kitchen", "sent", "s"), line(20, "kitchen", "preparing", "p"), line(20, "kitchen", "prepared", "ready"), line(20, "kitchen", "served", "done"), line(20, "none", "sent", "none")] })],
  }));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.delayedLineCount, 2);
});

test("prioriza críticos y después mayor espera", () => {
  const alerts = productionAlerts(buildOperationalDelayAlerts({
    restaurantId: "rest-1",
    nowMs: NOW,
    orders: [order({ id: "attention", items: [line(9)] }), order({ id: "critical-16", items: [line(16)] }), order({ id: "critical-25", items: [line(25)] })],
  }));
  assert.deepEqual(alerts.map((a) => a.orderId), ["critical-25", "critical-16", "attention"]);
});

test("acepta timestamps compatibles con Firestore", () => {
  assert.equal(readOperationalTimestampMs(new Date(NOW)), NOW);
  assert.equal(readOperationalTimestampMs({ seconds: NOW / 1000, nanoseconds: 0 }), NOW);
  assert.equal(readOperationalTimestampMs({ toMillis: () => NOW }), NOW);
  assert.equal(readOperationalTimestampMs({ toDate: () => new Date(NOW) }), NOW);
  assert.equal(readOperationalTimestampMs("invalid"), null);
});
