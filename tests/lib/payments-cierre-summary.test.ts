import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { countDistinctPaidSales } from "../../lib/analytics/sales-payment-analytics";
import { summarizePaymentsForCierre } from "../../lib/payments/summarizePaymentsForCierre";

test("la pantalla de ventas diferencia carga y error sin mostrar UID de camarero", () => {
  const page = readFileSync("app/dashboard/analisis/ventas/page.tsx", "utf8");

  assert.match(page, /Cargando cobros confirmados/);
  assert.match(page, /No se pudieron cargar los cobros/);
  assert.doesNotMatch(page, /p\.waiterEmail \|\| p\.waiterId/);
  assert.doesNotMatch(page, /: id}/);
});

test("dos cobros parciales de un pedido cuentan como un único ticket", () => {
  assert.equal(
    countDistinctPaidSales([
      { id: "payment-1", orderId: "order-1", ticketNumber: "T-1" },
      { id: "payment-2", orderId: "order-1", ticketNumber: "T-2" },
      { id: "payment-3", orderId: "order-2", ticketNumber: "T-3" },
    ]),
    2,
  );
});

test("el cierre no confunde efectivo entregado con dinero cobrado", () => {
  const summary = summarizePaymentsForCierre([
    {
      status: "paid",
      paymentMethod: "cash",
      finalTotal: 30,
      received: 50,
      change: 20,
    },
  ]);

  assert.equal(summary.totals.totalVentas, 30);
  assert.equal(summary.totals.totalCobrado, 30);
  assert.equal(summary.byMethod.cash, 30);
});

test("el cierre añade la propina al importe retenido sin inflar la venta", () => {
  const summary = summarizePaymentsForCierre([
    {
      status: "paid",
      paymentMethod: "card",
      finalTotal: 30,
      received: 35,
      tip: 5,
    },
  ]);

  assert.equal(summary.totals.totalVentas, 30);
  assert.equal(summary.totals.totalPropinas, 5);
  assert.equal(summary.totals.totalCobrado, 35);
  assert.equal(summary.byMethod.card, 30);
});
