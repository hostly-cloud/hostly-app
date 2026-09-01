import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPaidVentasSource,
  buildVentasOrdersAdapter,
} from "../../components/analysis/utils/ventas";

test("ventas usa únicamente cobros confirmados y conserva la zona del pedido", () => {
  const source = buildPaidVentasSource(
    [
      {
        id: "payment-internal-id",
        orderId: "order-1",
        status: "paid",
        finalTotal: 18.5,
        total: 20,
        ticketNumber: "T-20260901-001",
        createdAt: 1_788_240_000_000,
      },
      {
        id: "pending-payment",
        orderId: "order-1",
        status: "pending",
        finalTotal: 7,
      },
    ],
    [{ id: "order-1", zoneName: "Terraza" }],
  );

  assert.equal(source.length, 1);
  assert.equal(source[0]?.zoneName, "Terraza");

  const ventas = buildVentasOrdersAdapter(source);
  assert.deepEqual(ventas, [
    {
      total: 18.5,
      createdAt: 1_788_240_000_000,
      ticketNumber: "T-20260901-001",
      zoneName: "Terraza",
    },
  ]);
});

test("ventas no expone el identificador interno cuando falta el número de ticket", () => {
  const ventas = buildVentasOrdersAdapter([
    {
      id: "payment-internal-id",
      status: "paid",
      finalTotal: 9,
      createdAt: 1_788_240_000_000,
    },
  ]);

  assert.equal(ventas[0]?.ticketNumber, null);
  assert.equal("id" in (ventas[0] ?? {}), false);
});
