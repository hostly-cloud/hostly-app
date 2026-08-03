import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import type { ModifierStockConsumptionWarning } from "@/lib/inventory/stock-movement-types";
import type {
  SyncOrderItemsViaApiResult,
  SyncOrderItemsViaApiSuccess,
} from "@/lib/firestore/sync-order-items-via-api";

process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= "test-api-key";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??= "test.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= "test-project";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??= "test.appspot.com";
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??= "123456789";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??= "1:123456789:web:abc";

const SAMPLE_WARNING: ModifierStockConsumptionWarning = {
  orderId: "order-1",
  lineId: "line-1",
  groupId: "grp-1",
  optionId: "opt-1",
  reason: "INVALID_CURRENT_STOCK",
  inventoryProductId: "inv-1",
  requestedQuantity: 1,
  unit: "unit",
};

function assertSuccessResult(
  result: SyncOrderItemsViaApiResult,
): asserts result is SyncOrderItemsViaApiSuccess {
  assert.equal(result.ok, true);
}

function consumeSuccessWithoutCast(result: SyncOrderItemsViaApiSuccess) {
  const orderId: string = result.orderId;
  const total: number = result.total;
  const inventoryWarnings: ModifierStockConsumptionWarning[] = result.inventoryWarnings;
  return { orderId, total, inventoryWarnings };
}

type SyncOrderItemsViaApiModule = typeof import("@/lib/firestore/sync-order-items-via-api");

let syncOrderItemsViaApi: SyncOrderItemsViaApiModule["syncOrderItemsViaApi"];

describe("syncOrderItemsViaApi inventoryWarnings contract (6C2.3-CLIENT-WRAPPER)", () => {
  before(async () => {
    const mod = await import("@/lib/firestore/sync-order-items-via-api");
    syncOrderItemsViaApi = mod.syncOrderItemsViaApi;
  });

  test("el resultado exitoso expone inventoryWarnings tipado sin cast", async () => {
    const result = await syncOrderItemsViaApi(
      {
        operation: "create_open",
        tableId: "mesa-1",
        items: [{ id: "line-1", productId: "prod-1", quantity: 1 }],
      },
      {
        createOpenOrderViaApi: async () => ({
          ok: true,
          orderId: "order-create",
          total: 12,
          inventoryWarnings: [SAMPLE_WARNING],
        }),
      },
    );
    assertSuccessResult(result);
    const consumed = consumeSuccessWithoutCast(result);
    assert.equal(consumed.orderId, "order-create");
    assert.equal(consumed.total, 12);
    assert.deepEqual(consumed.inventoryWarnings, [SAMPLE_WARNING]);
  });

  test("create conserva el mismo array de inventoryWarnings", async () => {
    const warnings = [SAMPLE_WARNING];
    const result = await syncOrderItemsViaApi(
      {
        operation: "create_open",
        tableId: "mesa-create",
        items: [{ id: "line-1", productId: "prod-1", quantity: 1 }],
      },
      {
        createOpenOrderViaApi: async () => ({
          ok: true,
          orderId: "order-create",
          total: 9,
          inventoryWarnings: warnings,
        }),
      },
    );
    assertSuccessResult(result);
    assert.deepEqual(result.inventoryWarnings, warnings);
  });

  test("upsert conserva el mismo array de inventoryWarnings", async () => {
    const warnings = [SAMPLE_WARNING];
    const result = await syncOrderItemsViaApi(
      {
        operation: "persist_items",
        orderId: "order-upsert",
        items: [{ id: "line-1", productId: "prod-1", quantity: 2 }],
      },
      {
        upsertSaleLinesViaApi: async () => ({
          ok: true,
          orderId: "order-upsert",
          total: 18,
          inventoryWarnings: warnings,
        }),
      },
    );
    assertSuccessResult(result);
    assert.deepEqual(result.inventoryWarnings, warnings);
  });

  test("create conserva inventoryWarnings vacío", async () => {
    const result = await syncOrderItemsViaApi(
      {
        operation: "create_open",
        tableId: "mesa-empty",
        items: [{ id: "line-1", productId: "prod-1", quantity: 1 }],
      },
      {
        createOpenOrderViaApi: async () => ({
          ok: true,
          orderId: "order-empty",
          total: 0,
          inventoryWarnings: [],
        }),
      },
    );
    assertSuccessResult(result);
    assert.deepEqual(result.inventoryWarnings, []);
  });

  test("upsert conserva inventoryWarnings vacío", async () => {
    const result = await syncOrderItemsViaApi(
      {
        operation: "send_items",
        orderId: "order-empty",
        items: [{ id: "line-1", productId: "prod-1", quantity: 1 }],
      },
      {
        upsertSaleLinesViaApi: async () => ({
          ok: true,
          orderId: "order-empty",
          total: 5,
          inventoryWarnings: [],
        }),
      },
    );
    assertSuccessResult(result);
    assert.deepEqual(result.inventoryWarnings, []);
  });

  test("cancel_lines expone inventoryWarnings vacío y conserva orderId y total", async () => {
    const result = await syncOrderItemsViaApi(
      {
        operation: "cancel_lines",
        orderId: "order-cancel",
        cancelledLineIds: ["line-1"],
        items: [],
      },
      {
        cancelLinesViaApi: async () => ({
          ok: true,
          orderId: "order-cancel",
          total: 3,
          cancelledLineIds: ["line-1"],
        }),
      },
    );
    assertSuccessResult(result);
    assert.equal(result.orderId, "order-cancel");
    assert.equal(result.total, 3);
    assert.deepEqual(result.inventoryWarnings, []);
  });

  test("las ramas de error conservan su contrato sin inventoryWarnings", async () => {
    const missingTable = await syncOrderItemsViaApi({
      operation: "create_open",
      items: [{ id: "line-1", productId: "prod-1", quantity: 1 }],
    });
    assert.equal(missingTable.ok, false);
    if (missingTable.ok) return;
    assert.equal(missingTable.error, "TABLE_ID_REQUIRED");
    assert.equal("inventoryWarnings" in missingTable, false);

    const adapterError = await syncOrderItemsViaApi(
      {
        operation: "create_open",
        tableId: "mesa-error",
        items: [{ id: "line-1", productId: "prod-1", quantity: 1 }],
      },
      {
        createOpenOrderViaApi: async () => ({
          ok: false,
          error: "IDEMPOTENCY_CONFLICT",
          details: null,
        }),
      },
    );
    assert.equal(adapterError.ok, false);
    if (adapterError.ok) return;
    assert.equal(adapterError.error, "IDEMPOTENCY_CONFLICT");
    assert.equal("inventoryWarnings" in adapterError, false);
  });
});

describe("syncOrderItemsViaApi draft persist filters non-pending", () => {
  before(async () => {
    const mod = await import("@/lib/firestore/sync-order-items-via-api");
    syncOrderItemsViaApi = mod.syncOrderItemsViaApi;
  });

  test("persist_items solo envía líneas pending al upsert", async () => {
    let receivedLineIds: string[] = [];
    const result = await syncOrderItemsViaApi(
      {
        operation: "persist_items",
        orderId: "order-mixed",
        items: [
          { id: "sent-1", productId: "p1", quantity: 1, status: "sent" },
          { id: "pend-1", productId: "p2", quantity: 2, status: "pending" },
          { id: "canc-1", productId: "p3", quantity: 1, status: "cancelled" },
        ],
      },
      {
        upsertSaleLinesViaApi: async (params) => {
          receivedLineIds = params.lines.map((l) => l.lineId);
          assert.equal(params.markSent === true, false);
          return {
            ok: true,
            orderId: "order-mixed",
            total: 20,
            inventoryWarnings: [],
          };
        },
      },
    );
    assertSuccessResult(result);
    assert.deepEqual(receivedLineIds, ["pend-1"]);
  });

  test("persist_items solo enviadas es no-op sin llamar upsert", async () => {
    let upsertCalls = 0;
    const result = await syncOrderItemsViaApi(
      {
        operation: "persist_items",
        orderId: "order-sent-only",
        items: [
          { id: "sent-1", productId: "p1", quantity: 1, status: "sent" },
          { id: "sent-2", productId: "p2", quantity: 1, status: "prepared" },
        ],
      },
      {
        upsertSaleLinesViaApi: async () => {
          upsertCalls += 1;
          return {
            ok: true,
            orderId: "order-sent-only",
            total: 0,
            inventoryWarnings: [],
          };
        },
      },
    );
    assertSuccessResult(result);
    assert.equal(upsertCalls, 0);
    assert.equal(result.orderId, "order-sent-only");
    assert.deepEqual(result.inventoryWarnings, []);
  });

  test("send_items no filtra por status (caller pasa solo liberables)", async () => {
    let receivedLineIds: string[] = [];
    const result = await syncOrderItemsViaApi(
      {
        operation: "send_items",
        orderId: "order-send",
        items: [
          { id: "rel-1", productId: "p1", quantity: 1, status: "sent" },
          { id: "rel-2", productId: "p2", quantity: 2, status: "pending" },
        ],
      },
      {
        upsertSaleLinesViaApi: async (params) => {
          receivedLineIds = params.lines.map((l) => l.lineId);
          assert.equal(params.markSent, true);
          return {
            ok: true,
            orderId: "order-send",
            total: 12,
            inventoryWarnings: [],
          };
        },
      },
    );
    assertSuccessResult(result);
    assert.deepEqual(receivedLineIds, ["rel-1", "rel-2"]);
  });

  test("create_open draft filtra no-pending; create_open markSent no filtra", async () => {
    let draftIds: string[] = [];
    await syncOrderItemsViaApi(
      {
        operation: "create_open",
        tableId: "mesa-1",
        items: [
          { id: "s1", productId: "p1", quantity: 1, status: "sent" },
          { id: "n1", productId: "p2", quantity: 1, status: "pending" },
        ],
      },
      {
        createOpenOrderViaApi: async (params) => {
          draftIds = params.lines.map((l) => l.lineId);
          return {
            ok: true,
            orderId: "o-draft",
            total: 5,
            inventoryWarnings: [],
          };
        },
      },
    );
    assert.deepEqual(draftIds, ["n1"]);

    let sendIds: string[] = [];
    await syncOrderItemsViaApi(
      {
        operation: "create_open",
        tableId: "mesa-1",
        markSent: true,
        items: [
          { id: "rel-1", productId: "p1", quantity: 1, status: "sent" },
        ],
      },
      {
        createOpenOrderViaApi: async (params) => {
          sendIds = params.lines.map((l) => l.lineId);
          assert.equal(params.markSent, true);
          return {
            ok: true,
            orderId: "o-send",
            total: 5,
            inventoryWarnings: [],
          };
        },
      },
    );
    assert.deepEqual(sendIds, ["rel-1"]);
  });
});
