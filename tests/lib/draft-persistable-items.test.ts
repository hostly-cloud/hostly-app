import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { selectDraftPersistableFirestoreItems } from "@/lib/firestore/merge-order-items-for-persist";

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

  test("varias pending nuevas se conservan", () => {
    const items = [
      { id: "a", productId: "p1", quantity: 1, status: "pending" },
      { id: "b", productId: "p2", quantity: 2, status: "new" },
    ];
    assert.equal(selectDraftPersistableFirestoreItems(items).length, 2);
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

  test("varias enviadas + varias pending → solo pending", () => {
    const items = [
      { id: "s1", productId: "p1", quantity: 1, status: "sent" },
      { id: "s2", productId: "p2", quantity: 1, status: "prepared" },
      { id: "n1", productId: "p3", quantity: 1, status: "pending" },
      { id: "n2", productId: "p4", quantity: 3, status: "pending" },
    ];
    const out = selectDraftPersistableFirestoreItems(items);
    assert.deepEqual(
      out.map((i) => i.id),
      ["n1", "n2"],
    );
  });

  test("solo enviadas → vacío (no-op seguro)", () => {
    const items = [
      { id: "s1", productId: "p1", quantity: 1, status: "sent" },
      { id: "s2", productId: "p2", quantity: 2, status: "served" },
    ];
    assert.deepEqual(selectDraftPersistableFirestoreItems(items), []);
  });

  test("cancelled / preparing / served no se reabren", () => {
    const items = [
      { id: "c1", productId: "p1", quantity: 1, status: "cancelled" },
      { id: "p1", productId: "p2", quantity: 1, status: "preparing" },
      { id: "sv1", productId: "p3", quantity: 1, status: "served" },
      { id: "ok", productId: "p4", quantity: 1, status: "pending" },
    ];
    const out = selectDraftPersistableFirestoreItems(items);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.id, "ok");
  });

  test("cantidad > 1 y mismo producto con lineId distintos", () => {
    const items = [
      { id: "a", productId: "same", quantity: 3, status: "sent" },
      { id: "b", productId: "same", quantity: 2, status: "pending" },
    ];
    const out = selectDraftPersistableFirestoreItems(items);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.id, "b");
    assert.equal(out[0]?.quantity, 2);
  });
});
