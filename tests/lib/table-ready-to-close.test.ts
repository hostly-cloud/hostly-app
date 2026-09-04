import assert from "node:assert/strict";
import test from "node:test";
import {
  computeTablesReadyToClose,
  isOrderReadyToClose,
  readTableReadyToCloseQuantity,
} from "@/lib/kds/table-ready-to-close";

test("una comanda vacía no marca una mesa libre como lista para cerrar", () => {
  const order = { status: "open", tableId: "mesa-7", items: [] };
  assert.equal(isOrderReadyToClose(order), false);
  assert.deepEqual([...computeTablesReadyToClose([order])], []);
});

test("líneas residuales con cantidad cero no marcan una mesa como lista", () => {
  const order = {
    status: "open",
    tableId: "mesa-7",
    items: [
      { qty: 0, status: "served" },
      { qty: -1, status: "cancelled" },
    ],
  };
  assert.equal(isOrderReadyToClose(order), false);
  assert.deepEqual([...computeTablesReadyToClose([order])], []);
});

test("normaliza cantidades legacy de Firestore sin convertir cero en uno", () => {
  assert.equal(readTableReadyToCloseQuantity("0"), 0);
  assert.equal(readTableReadyToCloseQuantity("2"), 2);
  assert.equal(readTableReadyToCloseQuantity(undefined), 1);
  assert.equal(readTableReadyToCloseQuantity("no-numérico"), 1);
});

test("las líneas con cantidad cero no ocultan una línea real ya servida", () => {
  const order = {
    status: "open",
    tableId: "mesa-1",
    items: [
      { qty: 1, status: "served" },
      { qty: 0, status: "pending" },
    ],
  };
  assert.equal(isOrderReadyToClose(order), true);
  assert.deepEqual([...computeTablesReadyToClose([order])], ["mesa-1"]);
});

test("una comanda con solo líneas canceladas no marca una mesa libre", () => {
  const order = {
    status: "open",
    tableId: "mesa-7",
    items: [
      { qty: 1, status: "cancelled" },
      { qty: 2, status: "cancelado" },
    ],
  };
  assert.equal(isOrderReadyToClose(order), false);
  assert.deepEqual([...computeTablesReadyToClose([order])], []);
});

test("solo marca lista cuando todas las líneas activas están servidas", () => {
  const orders = [
    {
      status: "open",
      tableId: "mesa-1",
      items: [{ status: "served" }, { status: "cancelled" }],
    },
    {
      status: "open",
      tableId: "mesa-2",
      items: [{ status: "prepared" }],
    },
  ];
  assert.deepEqual([...computeTablesReadyToClose(orders)], ["mesa-1"]);
});

test("un pedido bloqueante prevalece si una mesa tiene varios pedidos", () => {
  const orders = [
    { status: "open", tableId: "mesa-1", items: [{ status: "served" }] },
    { status: "active", tableId: "mesa-1", items: [{ status: "sent" }] },
  ];
  assert.deepEqual([...computeTablesReadyToClose(orders)], []);
});
