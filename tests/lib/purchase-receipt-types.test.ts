import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPurchaseReceiptLinesFromOrder,
  PurchaseReceiptFromOrderError,
} from "../../lib/purchases/purchase-receipt-types";
import type { PurchaseOrderDocument } from "../../lib/purchases/purchase-order-types";

function order(): PurchaseOrderDocument {
  return {
    id: "po-1",
    restaurantId: "restaurant-1",
    status: "ordered",
    source: "manual",
    supplierName: "Proveedor principal",
    createdAt: 1,
    updatedAt: 1,
    totalEstimatedCost: 20,
    lines: [
      {
        productId: "p-1",
        productName: "Tomate",
        quantity: 10,
        unit: "kg",
        receivedQuantity: 2,
        estimatedUnitCost: 2,
        estimatedTotalCost: 20,
      },
    ],
  };
}

test("agrega entradas duplicadas del mismo producto antes de crear la recepción", () => {
  const lines = buildPurchaseReceiptLinesFromOrder({
    order: order(),
    inputLines: [
      { productId: "p-1", quantity: 2 },
      { productId: "p-1", quantity: 3 },
    ],
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.quantity, 5);
  assert.equal(lines[0]?.previouslyReceivedQuantity, 2);
  assert.equal(lines[0]?.remainingAfterQuantity, 3);
});

test("rechaza cantidades agregadas superiores a lo pendiente", () => {
  assert.throws(
    () =>
      buildPurchaseReceiptLinesFromOrder({
        order: order(),
        inputLines: [
          { productId: "p-1", quantity: 5 },
          { productId: "p-1", quantity: 4 },
        ],
      }),
    (error: unknown) =>
      error instanceof PurchaseReceiptFromOrderError &&
      error.code === "quantity_exceeds_remaining",
  );
});

test("rechaza productos que no pertenecen al pedido", () => {
  assert.throws(
    () =>
      buildPurchaseReceiptLinesFromOrder({
        order: order(),
        inputLines: [{ productId: "p-otro", quantity: 1 }],
      }),
    (error: unknown) =>
      error instanceof PurchaseReceiptFromOrderError && error.code === "unknown_product",
  );
});

test("conserva coste estimado y proveedor para trazabilidad económica", () => {
  const lines = buildPurchaseReceiptLinesFromOrder({
    order: order(),
    inputLines: [{ productId: "p-1", quantity: 1 }],
  });

  assert.equal(lines[0]?.estimatedUnitCost, 2);
  assert.equal(lines[0]?.supplierName, "Proveedor principal");
});
