import assert from "node:assert/strict";
import test from "node:test";
import {
  computeTablesReadyToClose,
  isOrderReadyToClose,
} from "@/lib/kds/table-ready-to-close";

test("una comanda vacía no marca una mesa libre como lista para cerrar", () => {
  const order = { status: "open", tableId: "mesa-7", items: [] };
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
