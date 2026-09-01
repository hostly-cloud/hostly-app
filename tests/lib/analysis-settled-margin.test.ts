import assert from "node:assert/strict";
import test from "node:test";
import { buildSettledMarginOrdersSource } from "../../components/analysis/utils/rentabilidad";
import {
  buildInventoryMarginAnalytics,
  normalizeInventoryMarginOrders,
} from "../../lib/analytics/inventory-margin-analytics";

const completeCost = (totalCost: number) => ({
  totalCost,
  recipeCost: totalCost,
  modifierCost: 0,
  missingCostItems: [],
  warnings: [],
  calculatedAt: 1,
});

test("rentabilidad excluye comandas abiertas, parciales y reabiertas", () => {
  const payments = [
    { orderId: "paid", status: "paid", finalTotal: 18, createdAt: 200 },
    { orderId: "partial", status: "paid", finalTotal: 5, createdAt: 201 },
    { orderId: "refunded", status: "refunded", finalTotal: 12, createdAt: 202 },
  ];
  const orders = [
    { id: "paid", status: "closed", createdAt: 100, items: [] },
    { id: "partial", status: "sent", createdAt: 101, items: [] },
    { id: "open", status: "open", createdAt: 102, items: [] },
    { id: "refunded", status: "sent", createdAt: 103, items: [] },
  ];

  const source = buildSettledMarginOrdersSource(payments, orders);

  assert.equal(source.length, 1);
  assert.equal(source[0]?.id, "paid");
  assert.equal(source[0]?.createdAt, 200);
  assert.equal(source[0]?.recognizedSalesTotal, 18);
});

test("rentabilidad reparte el cobro descontado entre líneas y conserva el coste", () => {
  const source = buildSettledMarginOrdersSource(
    [{ orderId: "order-1", status: "paid", finalTotal: 18, createdAt: 200 }],
    [
      {
        id: "order-1",
        status: "paid",
        items: [
          {
            id: "a",
            productId: "a",
            name: "A",
            total: 10,
            inventoryCost: completeCost(4),
          },
          {
            id: "b",
            productId: "b",
            name: "B",
            total: 10,
            inventoryCost: completeCost(6),
          },
        ],
      },
    ],
  );
  const analytics = buildInventoryMarginAnalytics(
    normalizeInventoryMarginOrders(source),
  );

  assert.equal(analytics.summary.salesTotal, 18);
  assert.equal(analytics.summary.costTotal, 10);
  assert.equal(analytics.summary.grossMargin, 8);
  assert.equal(
    analytics.byProduct[0]?.sales + analytics.byProduct[1]?.sales,
    18,
  );
});

test("rentabilidad suma cobros divididos de una misma venta", () => {
  const source = buildSettledMarginOrdersSource(
    [
      { orderId: "order-1", status: "paid", finalTotal: 7, createdAt: 200 },
      { orderId: "order-1", status: "paid", finalTotal: 11, createdAt: 300 },
    ],
    [{ id: "order-1", status: "closed", items: [] }],
  );

  assert.equal(source[0]?.recognizedSalesTotal, 18);
  assert.equal(source[0]?.createdAt, 300);
});

test("rentabilidad redondea a céntimos el ingreso reconocido", () => {
  const source = buildSettledMarginOrdersSource(
    [
      { orderId: "order-1", status: "paid", finalTotal: 0.1, createdAt: 200 },
      { orderId: "order-1", status: "paid", finalTotal: 0.2, createdAt: 300 },
    ],
    [{ id: "order-1", status: "paid", items: [] }],
  );

  assert.equal(source[0]?.recognizedSalesTotal, 0.3);
});
