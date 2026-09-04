import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOperationalDelayAlerts,
  readOperationalTimestampMs,
  type OperationalOrderRecord,
} from "../../lib/operations/operational-delay-alerts";

const NOW = Date.UTC(2026, 8, 4, 18, 0, 0);

function order(
  overrides: Partial<OperationalOrderRecord> = {},
): OperationalOrderRecord {
  return {
    id: "order-1",
    restaurantId: "rest-1",
    table: "Mesa 7",
    status: "open",
    items: [],
    ...overrides,
  };
}

function line({
  minutes,
  status = "sent",
  station = "kitchen",
  id = "line-1",
}: {
  minutes: number;
  status?: string;
  station?: "kitchen" | "bar" | "cocktail" | "none";
  id?: string;
}) {
  return {
    id,
    name: "Producto",
    qty: 1,
    status,
    station,
    sentAt: NOW - minutes * 60_000,
  };
}

test("aísla alertas por restaurante e ignora pedidos terminales", () => {
  const alerts = buildOperationalDelayAlerts({
    restaurantId: "rest-1",
    nowMs: NOW,
    orders: [
      order({ items: [line({ minutes: 16 })] }),
      order({
        id: "foreign",
        restaurantId: "rest-2",
        items: [line({ minutes: 30 })],
      }),
      order({ id: "paid", status: "paid", items: [line({ minutes: 30 })] }),
      order({
        id: "cancelled",
        status: "cancelled",
        items: [line({ minutes: 30 })],
      }),
      order({ id: "closed", status: "closed", items: [line({ minutes: 30 })] }),
    ],
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.orderId, "order-1");
  assert.equal(alerts[0]?.restaurantId, "rest-1");
  assert.equal(alerts[0]?.level, "critical");
});

test("respeta exactamente los umbrales SLA existentes por estación", () => {
  const alerts = buildOperationalDelayAlerts({
    restaurantId: "rest-1",
    nowMs: NOW,
    orders: [
      order({ id: "k-normal", items: [line({ minutes: 7.99 })] }),
      order({ id: "k-attention", items: [line({ minutes: 8 })] }),
      order({ id: "k-critical", items: [line({ minutes: 15 })] }),
      order({ id: "b-attention", items: [line({ minutes: 3, station: "bar" })] }),
      order({ id: "b-critical", items: [line({ minutes: 6, station: "bar" })] }),
      order({
        id: "c-critical",
        items: [line({ minutes: 6, station: "cocktail" })],
      }),
    ],
  });

  assert.equal(alerts.some((alert) => alert.orderId === "k-normal"), false);
  assert.equal(
    alerts.find((alert) => alert.orderId === "k-attention")?.level,
    "attention",
  );
  assert.equal(
    alerts.find((alert) => alert.orderId === "k-critical")?.level,
    "critical",
  );
  assert.equal(
    alerts.find((alert) => alert.orderId === "b-attention")?.thresholdMinutes,
    3,
  );
  assert.equal(
    alerts.find((alert) => alert.orderId === "b-critical")?.thresholdMinutes,
    6,
  );
  assert.equal(
    alerts.find((alert) => alert.orderId === "c-critical")?.stationLabel,
    "Coctelería",
  );
});

test("agrupa por pedido y estación usando la línea más antigua", () => {
  const alerts = buildOperationalDelayAlerts({
    restaurantId: "rest-1",
    nowMs: NOW,
    orders: [
      order({
        items: [
          line({ minutes: 9, id: "k1" }),
          line({ minutes: 16, id: "k2" }),
          line({ minutes: 4, id: "b1", station: "bar" }),
        ],
      }),
    ],
  });

  assert.equal(alerts.length, 2);
  const kitchen = alerts.find((alert) => alert.station === "kitchen");
  const bar = alerts.find((alert) => alert.station === "bar");
  assert.equal(kitchen?.delayedLineCount, 2);
  assert.equal(kitchen?.elapsedMinutes, 16);
  assert.equal(kitchen?.level, "critical");
  assert.equal(bar?.delayedLineCount, 1);
  assert.equal(bar?.level, "attention");
});

test("solo incluye líneas realmente en producción", () => {
  const alerts = buildOperationalDelayAlerts({
    restaurantId: "rest-1",
    nowMs: NOW,
    orders: [
      order({
        items: [
          line({ minutes: 20, id: "sent", status: "sent" }),
          line({ minutes: 20, id: "preparing", status: "preparing" }),
          line({ minutes: 20, id: "prepared", status: "prepared" }),
          line({ minutes: 20, id: "served", status: "served" }),
          line({ minutes: 20, id: "pending", status: "pending" }),
          line({ minutes: 20, id: "none", station: "none" }),
        ],
      }),
    ],
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.delayedLineCount, 2);
});

test("ordena críticos antes que atención y los más retrasados primero", () => {
  const alerts = buildOperationalDelayAlerts({
    restaurantId: "rest-1",
    nowMs: NOW,
    orders: [
      order({ id: "attention", items: [line({ minutes: 9 })] }),
      order({ id: "critical-16", items: [line({ minutes: 16 })] }),
      order({ id: "critical-25", items: [line({ minutes: 25 })] }),
    ],
  });

  assert.deepEqual(
    alerts.map((alert) => alert.orderId),
    ["critical-25", "critical-16", "attention"],
  );
});

test("lee timestamps compatibles con Firestore y descarta valores inválidos", () => {
  assert.equal(readOperationalTimestampMs(new Date(NOW)), NOW);
  assert.equal(
    readOperationalTimestampMs({ seconds: NOW / 1000, nanoseconds: 0 }),
    NOW,
  );
  assert.equal(readOperationalTimestampMs({ toMillis: () => NOW }), NOW);
  assert.equal(readOperationalTimestampMs({ toDate: () => new Date(NOW) }), NOW);
  assert.equal(readOperationalTimestampMs("2026-09-04"), null);
});
