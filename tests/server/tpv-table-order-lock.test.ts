import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isActiveTpvOrderStatus,
  isTerminalTpvOrderStatus,
} from "@/lib/server/tpv/is-active-tpv-order-status";
import {
  assertTableOrderLockIntegrity,
  filterActiveOrdersForTable,
  tableOrderLockDocumentId,
} from "@/lib/server/tpv/table-order-lock";

describe("isActiveTpvOrderStatus", () => {
  test("null/empty count as active", () => {
    assert.equal(isActiveTpvOrderStatus(null), true);
    assert.equal(isActiveTpvOrderStatus(""), true);
    assert.equal(isActiveTpvOrderStatus("open"), true);
    assert.equal(isActiveTpvOrderStatus("sent"), true);
    assert.equal(isActiveTpvOrderStatus("pending"), true);
  });

  test("terminal statuses", () => {
    for (const st of ["closed", "paid", "cancelled", "canceled", "cancelado", "merged"]) {
      assert.equal(isTerminalTpvOrderStatus(st), true);
      assert.equal(isActiveTpvOrderStatus(st), false);
    }
  });
});

describe("tableOrderLockDocumentId", () => {
  test("stable for safe ids", () => {
    assert.equal(tableOrderLockDocumentId("mesa-1"), "mesa-1");
    assert.equal(tableOrderLockDocumentId("mesa-1"), tableOrderLockDocumentId("mesa-1"));
  });

  test("hashes unsafe ids deterministically", () => {
    const a = tableOrderLockDocumentId("mesa/with/slash");
    const b = tableOrderLockDocumentId("mesa/with/slash");
    assert.equal(a, b);
    assert.notEqual(a, "mesa/with/slash");
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  test("different tables do not collide trivially", () => {
    assert.notEqual(tableOrderLockDocumentId("mesa-1"), tableOrderLockDocumentId("mesa-2"));
    assert.notEqual(
      tableOrderLockDocumentId("a/b"),
      tableOrderLockDocumentId("a\\b"),
    );
  });
});

describe("assertTableOrderLockIntegrity", () => {
  test("detects tenant/table mismatch", () => {
    assert.equal(
      assertTableOrderLockIntegrity(
        { restaurantId: "r1", tableId: "t1", orderId: "o1" },
        "r1",
        "t1",
      ),
      null,
    );
    assert.equal(
      assertTableOrderLockIntegrity(
        { restaurantId: "rX", tableId: "t1", orderId: "o1" },
        "r1",
        "t1",
      )?.code,
      "LOCK_TENANT_MISMATCH",
    );
    assert.equal(
      assertTableOrderLockIntegrity(
        { restaurantId: "r1", tableId: "tX", orderId: "o1" },
        "r1",
        "t1",
      )?.code,
      "LOCK_TABLE_MISMATCH",
    );
  });
});

describe("filterActiveOrdersForTable", () => {
  test("filters by tenant, table and status", () => {
    const docs = [
      { id: "a", data: () => ({ restaurantId: "r1", tableId: "t1", status: "open" }) },
      { id: "b", data: () => ({ restaurantId: "r1", tableId: "t1", status: "closed" }) },
      { id: "c", data: () => ({ restaurantId: "r2", tableId: "t1", status: "open" }) },
      { id: "d", data: () => ({ restaurantId: "r1", tableId: "t2", status: "sent" }) },
    ];
    const active = filterActiveOrdersForTable(docs, "r1", "t1");
    assert.deepEqual(
      active.map((o) => o.id),
      ["a"],
    );
  });
});
