import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  mergeOrderItemsForPersist,
  selectDraftPersistableFirestoreItems,
} from "@/lib/firestore/merge-order-items-for-persist";

describe("selectDraftPersistableFirestoreItems", () => {
  test("orden vacía → vacío", () => {
    assert.deepEqual(selectDraftPersistableFirestoreItems([]), []);
  });

  test("una línea pending nueva se conserva", () => {
    const items = [
      { id: "a", productId: "p1", quantity: 1, status: "pending" },
    ];
    assert.deepEqual(selectDraftPersistableFirestoreItems(items), items);
  });

  test("enviada + pending → solo pending", () => {
    const pending = {
      id: "new-1",
      productId: "p2",
      quantity: 1,
      status: "pending",
    };
    const items = [
      { id: "sent-1", productId: "p1", quantity: 1, status: "sent" },
      pending,
    ];
    assert.deepEqual(selectDraftPersistableFirestoreItems(items), [pending]);
  });

  test("solo enviadas → vacío (batch draft)", () => {
    const items = [
      { id: "s1", productId: "p1", quantity: 1, status: "sent" },
      { id: "s2", productId: "p2", quantity: 2, status: "served" },
    ];
    assert.deepEqual(selectDraftPersistableFirestoreItems(items), []);
  });
});

describe("mergeOrderItemsForPersist draft vacío / shrink", () => {
  test("1. pending [A] → [] elimina A", () => {
    const server = [
      { id: "A", productId: "p1", quantity: 1, status: "pending", total: 5 },
    ];
    const merged = mergeOrderItemsForPersist(server, []);
    assert.deepEqual(merged, []);
  });

  test("2. pending [A qty 2] → [A qty 1]", () => {
    const server = [
      { id: "A", productId: "p1", quantity: 2, status: "pending", total: 10 },
    ];
    const local = [
      { id: "A", productId: "p1", quantity: 1, status: "pending", total: 5 },
    ];
    const merged = mergeOrderItemsForPersist(server, local);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.id, "A");
    assert.equal(merged[0]?.quantity, 1);
  });

  test("3. pending [A qty 1] → []", () => {
    const server = [
      { id: "A", productId: "p1", quantity: 1, status: "pending", total: 5 },
    ];
    assert.deepEqual(mergeOrderItemsForPersist(server, []), []);
  });

  test("4. A pending + B sent, local [] → solo B sent", () => {
    const server = [
      { id: "A", productId: "p1", quantity: 1, status: "pending", total: 5 },
      { id: "B", productId: "p2", quantity: 1, status: "sent", total: 7 },
    ];
    const merged = mergeOrderItemsForPersist(server, []);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.id, "B");
    assert.equal(merged[0]?.status, "sent");
  });

  test("5. A prepared remoto + A pending local → no degrada prepared", () => {
    const server = [
      {
        id: "A",
        productId: "p1",
        quantity: 1,
        status: "prepared",
        preparedAt: 100,
        total: 5,
      },
    ];
    const local = [
      { id: "A", productId: "p1", quantity: 1, status: "pending", total: 5 },
    ];
    const merged = mergeOrderItemsForPersist(server, local);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.status, "prepared");
    assert.equal(merged[0]?.preparedAt, 100);
  });
});
