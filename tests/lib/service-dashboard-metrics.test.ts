import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildServiceDashboardMetrics } from "../../lib/operacion/service-dashboard-metrics";

const day = new Date(2026, 8, 1, 12, 0, 0);
const at = (hour: number, minute = 0) => new Date(2026, 8, 1, hour, minute).getTime();

describe("service dashboard metrics", () => {
  test("cuenta comandas y líneas de producción, no documentos como si fueran líneas", () => {
    const metrics = buildServiceDashboardMetrics(
      [
        {
          id: "order-1",
          createdAt: at(10),
          tableName: "Mesa 4",
          items: [
            {
              status: "served",
              sentAt: at(10),
              preparedAt: at(10, 10),
              servedAt: at(10, 15),
            },
            {
              status: "prepared",
              sentAt: at(10, 5),
              preparedAt: at(10, 15),
            },
            { status: "pending" },
          ],
        },
      ],
      day,
      at(12),
    );

    assert.equal(metrics.orderCount, 1);
    assert.equal(metrics.lineCount, 2);
    assert.equal(metrics.prepared, 1);
    assert.equal(metrics.served, 1);
    assert.equal(metrics.avgPrepMinutes, 10);
    assert.equal(metrics.avgServeMinutes, 5);
  });

  test("ignora actividad de otros días y líneas todavía no enviadas", () => {
    const metrics = buildServiceDashboardMetrics(
      [
        {
          id: "order-outside",
          createdAt: new Date(2026, 7, 31, 23, 59).getTime(),
          items: [{ status: "sent", sentAt: new Date(2026, 7, 31, 23, 59).getTime() }],
        },
        {
          id: "order-pending",
          createdAt: at(11),
          items: [{ status: "pending" }],
        },
      ],
      day,
      at(12),
    );

    assert.equal(metrics.orderCount, 0);
    assert.equal(metrics.lineCount, 0);
  });

  test("agrupa retrasos por comanda y calcula el ranking con preparación real", () => {
    const metrics = buildServiceDashboardMetrics(
      [
        {
          id: "order-1",
          tableId: "table-1",
          tableName: "Mesa 1",
          items: [
            { status: "served", sentAt: at(9), preparedAt: at(9, 25), servedAt: at(9, 30) },
            { status: "prepared", sentAt: at(9, 5), preparedAt: at(9, 35) },
          ],
        },
      ],
      day,
      at(12),
    );

    assert.equal(metrics.delayedLineCount, 2);
    assert.deepEqual(metrics.delayedOrders[0], {
      orderId: "order-1",
      tableId: "table-1",
      tableName: "Mesa 1",
      delayedLines: 2,
      maxDelayMinutes: 30,
    });
    assert.deepEqual(metrics.slowestTables[0], {
      tableName: "Mesa 1",
      avgPrepMinutes: 28,
      completedLines: 2,
    });
  });

  test("solo trata una línea enviada como retraso activo en el día actual", () => {
    const now = at(12);
    const order = {
      id: "order-active",
      tableName: "Barra",
      items: [{ status: "sent", sentAt: at(11, 35) }],
    };

    assert.equal(buildServiceDashboardMetrics([order], day, now).delayedLineCount, 1);
    assert.equal(
      buildServiceDashboardMetrics(
        [order],
        new Date(2026, 7, 31, 12),
        now,
      ).delayedLineCount,
      0,
    );
  });
});
