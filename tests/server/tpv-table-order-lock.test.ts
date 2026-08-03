import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isActiveOrderStatus } from "@/lib/server/tpv/table-group-order-utils";
import {
  assertTableOrderLockIntegrity,
  assertTableOrderLockOwner,
  filterActiveOrdersForTable,
  sortTableIdsForLockAcquisition,
  tableOrderLockDocumentId,
} from "@/lib/server/tpv/table-order-lock";

describe("sortTableIdsForLockAcquisition", () => {
  test("deterministic lexicographic order and dedupe", () => {
    assert.deepEqual(sortTableIdsForLockAcquisition(["z", "a", "m", "a"]), ["a", "m", "z"]);
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

describe("filterActiveOrdersForTable (main open|sent)", () => {
  test("filters by tenant, table and active status", () => {
    const docs = [
      { id: "a", data: () => ({ restaurantId: "r1", tableId: "t1", status: "open" }) },
      { id: "b", data: () => ({ restaurantId: "r1", tableId: "t1", status: "closed" }) },
      { id: "c", data: () => ({ restaurantId: "r2", tableId: "t1", status: "open" }) },
      { id: "d", data: () => ({ restaurantId: "r1", tableId: "t2", status: "sent" }) },
      { id: "e", data: () => ({ restaurantId: "r1", tableId: "t1", status: "paid" }) },
    ];
    const active = filterActiveOrdersForTable(docs, "r1", "t1");
    assert.deepEqual(
      active.map((o) => o.id),
      ["a"],
    );
    assert.equal(isActiveOrderStatus("sent"), true);
    assert.equal(isActiveOrderStatus("paid"), false);
  });
});

describe("assertTableOrderLockOwner (upsert/persist)", () => {
  const base = { restaurantId: "r1", tableId: "t1", orderId: "o1" };

  test("ok when lock owns the order", () => {
    assert.equal(
      assertTableOrderLockOwner(
        { restaurantId: "r1", tableId: "t1", orderId: "o1" },
        base,
      ),
      null,
    );
  });

  test("conflict when lock missing, free, or owned by other order", () => {
    assert.equal(assertTableOrderLockOwner(null, base), "TABLE_ORDER_LOCK_CONFLICT");
    assert.equal(
      assertTableOrderLockOwner(
        { restaurantId: "r1", tableId: "t1", orderId: null },
        base,
      ),
      "TABLE_ORDER_LOCK_CONFLICT",
    );
    assert.equal(
      assertTableOrderLockOwner(
        { restaurantId: "r1", tableId: "t1", orderId: "other" },
        base,
      ),
      "TABLE_ORDER_LOCK_CONFLICT",
    );
  });

  test("tenant/table mismatch without leaking foreign ids to callers", () => {
    assert.equal(
      assertTableOrderLockOwner(
        { restaurantId: "rX", tableId: "t1", orderId: "o1" },
        base,
      ),
      "LOCK_TENANT_MISMATCH",
    );
    assert.equal(
      assertTableOrderLockOwner(
        { restaurantId: "r1", tableId: "tX", orderId: "o1" },
        base,
      ),
      "LOCK_TABLE_MISMATCH",
    );
  });
});
