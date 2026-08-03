import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  ensureTableGroupLineOrigin,
  withTableGroupLineOrigin,
} from "@/lib/server/tpv/table-group-order-utils";

describe("withTableGroupLineOrigin", () => {
  test("1. primer stamp añade provenance", () => {
    const stamped = withTableGroupLineOrigin({ id: "l1", quantity: 2 }, "mesa-1", "ord-1");
    assert.equal(stamped.tableGroupSourceTableId, "mesa-1");
    assert.equal(stamped.tableGroupSourceOrderId, "ord-1");
    assert.equal(stamped.quantity, 2);
  });
});

describe("ensureTableGroupLineOrigin", () => {
  test("2. provenance válida no se modifica en re-merge", () => {
    const prior = withTableGroupLineOrigin({ id: "l1", quantity: 1, price: 5 }, "mesa-1", "ord-1");
    const kept = ensureTableGroupLineOrigin(prior, "mesa-2", "ord-2");
    assert.equal(kept.tableGroupSourceTableId, "mesa-1");
    assert.equal(kept.tableGroupSourceOrderId, "ord-1");
    assert.equal(kept.quantity, 1);
    assert.equal(kept.price, 5);
    assert.equal(kept, prior);
  });

  test("3. tercer stamp conserva la más antigua", () => {
    const a = ensureTableGroupLineOrigin({ id: "l1" }, "mesa-1", "ord-1");
    const b = ensureTableGroupLineOrigin(a, "mesa-2", "ord-2");
    const c = ensureTableGroupLineOrigin(b, "mesa-3", "ord-3");
    assert.equal(c.tableGroupSourceTableId, "mesa-1");
    assert.equal(c.tableGroupSourceOrderId, "ord-1");
  });

  test("4. línea sin provenance se completa", () => {
    const filled = ensureTableGroupLineOrigin({ id: "l1", status: "pending" }, "mesa-A", "ord-A");
    assert.equal(filled.tableGroupSourceTableId, "mesa-A");
    assert.equal(filled.tableGroupSourceOrderId, "ord-A");
    assert.equal(filled.status, "pending");
  });

  test("5. provenance parcial completa solo el campo ausente", () => {
    const onlyTable = ensureTableGroupLineOrigin(
      { id: "l1", tableGroupSourceTableId: "mesa-1" },
      "mesa-2",
      "ord-2",
    );
    assert.equal(onlyTable.tableGroupSourceTableId, "mesa-1");
    assert.equal(onlyTable.tableGroupSourceOrderId, "ord-2");

    const onlyOrder = ensureTableGroupLineOrigin(
      { id: "l1", tableGroupSourceOrderId: "ord-1" },
      "mesa-2",
      "ord-2",
    );
    assert.equal(onlyOrder.tableGroupSourceTableId, "mesa-2");
    assert.equal(onlyOrder.tableGroupSourceOrderId, "ord-1");
  });

  test("6. strings vacíos / no-string se tratan como ausentes", () => {
    const filled = ensureTableGroupLineOrigin(
      {
        id: "l1",
        tableGroupSourceTableId: "  ",
        tableGroupSourceOrderId: 12 as unknown as string,
      },
      "mesa-x",
      "ord-x",
    );
    assert.equal(filled.tableGroupSourceTableId, "mesa-x");
    assert.equal(filled.tableGroupSourceOrderId, "ord-x");
  });

  test("7. no inventa origen si source vacío y no hay existente", () => {
    const item: Record<string, unknown> = { id: "l1", status: "sent" };
    const same = ensureTableGroupLineOrigin(item, "  ", "");
    assert.equal(same, item);
    assert.equal(same.tableGroupSourceTableId, undefined);
    assert.equal(same.tableGroupSourceOrderId, undefined);
  });

  test("8. no cambia qty, precio, estado ni routing", () => {
    const base = {
      id: "l1",
      quantity: 3,
      price: 7.5,
      total: 22.5,
      status: "sent",
      stationId: "kitchen",
      productId: "prod-1",
    };
    const out = ensureTableGroupLineOrigin(base, "mesa-9", "ord-9");
    assert.equal(out.quantity, 3);
    assert.equal(out.price, 7.5);
    assert.equal(out.total, 22.5);
    assert.equal(out.status, "sent");
    assert.equal(out.stationId, "kitchen");
    assert.equal(out.productId, "prod-1");
  });

  test("9. mesa distinta no contamina provenance ya válida", () => {
    const prior = withTableGroupLineOrigin({ id: "l1" }, "mesa-side", "ord-side");
    const kept = ensureTableGroupLineOrigin(prior, "mesa-main", "ord-main");
    assert.equal(kept.tableGroupSourceTableId, "mesa-side");
    assert.equal(kept.tableGroupSourceOrderId, "ord-side");
  });
});

describe("merge handler wiring — ensureTableGroupLineOrigin", () => {
  test("10. handle-merge usa ensure y no with al estampar líneas", () => {
    const src = readFileSync("lib/server/tpv/handle-merge-table-group-orders.ts", "utf8");
    assert.match(src, /ensureTableGroupLineOrigin/);
    assert.doesNotMatch(src, /withTableGroupLineOrigin/);
  });
});
