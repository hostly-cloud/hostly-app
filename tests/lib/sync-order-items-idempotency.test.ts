import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  syncOrderItemsViaApi,
  type SyncOrderItemsViaApiDeps,
} from "@/lib/firestore/sync-order-items-via-api";

const line = {
  id: "line-1",
  productId: "product-1",
  quantity: 1,
  status: "pending",
};

type CreateOpen = NonNullable<
  SyncOrderItemsViaApiDeps["createOpenOrderViaApi"]
>;

function recorder(keys: string[]): CreateOpen {
  return async (params) => {
    keys.push(params.idempotencyKey ?? "");
    return {
      ok: true as const,
      orderId: "order-1",
      total: 10,
      inventoryWarnings: [],
    };
  };
}

describe("TPV create-open idempotency", () => {
  test("draft autosave and immediate send never share an idempotency key", async () => {
    const keys: string[] = [];
    const deps: SyncOrderItemsViaApiDeps = {
      createOpenOrderViaApi: recorder(keys),
    };

    const draft = await syncOrderItemsViaApi(
      {
        operation: "create_open",
        tableId: "table-1",
        items: [line],
        markSent: false,
      },
      deps,
    );
    const sent = await syncOrderItemsViaApi(
      {
        operation: "create_open",
        tableId: "table-1",
        items: [line],
        markSent: true,
      },
      deps,
    );

    assert.equal(draft.ok, true);
    assert.equal(sent.ok, true);
    assert.equal(keys.length, 2);
    assert.notEqual(keys[0], keys[1]);
    assert.match(keys[0]!, /:pending:/);
    assert.match(keys[1]!, /:sent:/);
  });

  test("retries of the same semantic create remain stable", async () => {
    const keys: string[] = [];
    const deps: SyncOrderItemsViaApiDeps = {
      createOpenOrderViaApi: recorder(keys),
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await syncOrderItemsViaApi(
        {
          operation: "create_open",
          tableId: " table-1 ",
          items: [line],
          markSent: true,
        },
        deps,
      );
    }

    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.match(keys[0]!, /^sync-create-open:table-1:sent:/);
  });
});
