import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import type { ModifierStockConsumptionWarning } from "@/lib/inventory/stock-movement-types";

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

const SECOND_WARNING: ModifierStockConsumptionWarning = {
  orderId: "order-1",
  lineId: "line-2",
  groupId: "grp-2",
  optionId: "opt-2",
  reason: "UNKNOWN_PRODUCT_UNIT",
  inventoryProductId: "inv-2",
  requestedQuantity: 2,
  unit: "unit",
};

function mockApiFetch(payload: Record<string, unknown> & { ok?: boolean }) {
  return async () =>
    new Response(JSON.stringify(payload), {
      status: payload.ok === false ? 409 : 200,
      headers: { "Content-Type": "application/json" },
    });
}

type TpvMutationsViaApi = typeof import("@/lib/firestore/tpv-mutations-via-api");

let createOpenOrderViaApi: TpvMutationsViaApi["createOpenOrderViaApi"];
let upsertSaleLinesViaApi: TpvMutationsViaApi["upsertSaleLinesViaApi"];
let transitionLineStatusViaApi: TpvMutationsViaApi["transitionLineStatusViaApi"];
let transitionLineQuantityViaApi: TpvMutationsViaApi["transitionLineQuantityViaApi"];

describe("tpv client adapters propagate inventoryWarnings (6C2.3-CLIENT)", () => {
  before(async () => {
    const mod = await import("@/lib/firestore/tpv-mutations-via-api");
    createOpenOrderViaApi = mod.createOpenOrderViaApi;
    upsertSaleLinesViaApi = mod.upsertSaleLinesViaApi;
    transitionLineStatusViaApi = mod.transitionLineStatusViaApi;
    transitionLineQuantityViaApi = mod.transitionLineQuantityViaApi;
  });

  test("create-open conserva un warning completo sin transformarlo", async () => {
    const result = await createOpenOrderViaApi(
      {
        tableId: "mesa-1",
        lines: [{ lineId: "line-1", productId: "prod-1", quantity: 1 }],
        idempotencyKey: "client-create-warning",
      },
      {
        apiFetch: mockApiFetch({
          ok: true,
          orderId: "order-create",
          total: 12,
          inventoryWarnings: [SAMPLE_WARNING],
        }),
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.orderId, "order-create");
    assert.equal(result.total, 12);
    assert.deepEqual(result.inventoryWarnings, [SAMPLE_WARNING]);
  });

  test("upsert-sale-lines conserva un warning completo sin transformarlo", async () => {
    const result = await upsertSaleLinesViaApi(
      {
        orderId: "order-upsert",
        lines: [{ lineId: "line-1", productId: "prod-1", quantity: 2 }],
        idempotencyKey: "client-upsert-warning",
      },
      {
        apiFetch: mockApiFetch({
          ok: true,
          orderId: "order-upsert",
          total: 24,
          inventoryWarnings: [SAMPLE_WARNING],
        }),
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.orderId, "order-upsert");
    assert.equal(result.total, 24);
    assert.deepEqual(result.inventoryWarnings, [SAMPLE_WARNING]);
  });

  test("transition-line-status conserva un warning completo sin transformarlo", async () => {
    const result = await transitionLineStatusViaApi(
      {
        orderId: "order-status",
        lineId: "line-1",
        expectedStatus: "pending",
        nextStatus: "sent",
        idempotencyKey: "client-status-warning",
      },
      {
        apiFetch: mockApiFetch({
          ok: true,
          orderId: "order-status",
          lineId: "line-1",
          status: "sent",
          inventoryWarnings: [SAMPLE_WARNING],
        }),
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.orderId, "order-status");
    assert.equal(result.lineId, "line-1");
    assert.equal(result.status, "sent");
    assert.deepEqual(result.inventoryWarnings, [SAMPLE_WARNING]);
  });

  test("transition-line-quantity conserva un warning completo sin transformarlo", async () => {
    const result = await transitionLineQuantityViaApi(
      {
        orderId: "order-qty",
        lineId: "line-1",
        units: 1,
        expectedStatus: "pending",
        nextStatus: "sent",
        idempotencyKey: "client-qty-warning",
      },
      {
        apiFetch: mockApiFetch({
          ok: true,
          orderId: "order-qty",
          lineId: "line-1",
          advancedLineId: "line-1-adv",
          status: "sent",
          inventoryWarnings: [SAMPLE_WARNING],
        }),
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.orderId, "order-qty");
    assert.equal(result.lineId, "line-1");
    assert.equal(result.advancedLineId, "line-1-adv");
    assert.equal(result.status, "sent");
    assert.deepEqual(result.inventoryWarnings, [SAMPLE_WARNING]);
  });

  test("los cuatro adaptadores conservan inventoryWarnings vacío", async () => {
    const createResult = await createOpenOrderViaApi(
      {
        tableId: "mesa-empty",
        lines: [{ lineId: "line-1", productId: "prod-1", quantity: 1 }],
        idempotencyKey: "client-create-empty",
      },
      {
        apiFetch: mockApiFetch({
          ok: true,
          orderId: "order-empty",
          total: 0,
          inventoryWarnings: [],
        }),
      },
    );
    assert.equal(createResult.ok, true);
    if (createResult.ok) assert.deepEqual(createResult.inventoryWarnings, []);

    const upsertResult = await upsertSaleLinesViaApi(
      {
        orderId: "order-empty",
        lines: [{ lineId: "line-1", productId: "prod-1", quantity: 1 }],
        idempotencyKey: "client-upsert-empty",
      },
      {
        apiFetch: mockApiFetch({
          ok: true,
          orderId: "order-empty",
          total: 0,
          inventoryWarnings: [],
        }),
      },
    );
    assert.equal(upsertResult.ok, true);
    if (upsertResult.ok) assert.deepEqual(upsertResult.inventoryWarnings, []);

    const statusResult = await transitionLineStatusViaApi(
      {
        orderId: "order-empty",
        lineId: "line-1",
        expectedStatus: "pending",
        nextStatus: "sent",
        idempotencyKey: "client-status-empty",
      },
      {
        apiFetch: mockApiFetch({
          ok: true,
          orderId: "order-empty",
          lineId: "line-1",
          status: "sent",
          inventoryWarnings: [],
        }),
      },
    );
    assert.equal(statusResult.ok, true);
    if (statusResult.ok) assert.deepEqual(statusResult.inventoryWarnings, []);

    const qtyResult = await transitionLineQuantityViaApi(
      {
        orderId: "order-empty",
        lineId: "line-1",
        units: 1,
        expectedStatus: "pending",
        nextStatus: "sent",
        idempotencyKey: "client-qty-empty",
      },
      {
        apiFetch: mockApiFetch({
          ok: true,
          orderId: "order-empty",
          lineId: "line-1",
          advancedLineId: "line-1-adv",
          status: "sent",
          inventoryWarnings: [],
        }),
      },
    );
    assert.equal(qtyResult.ok, true);
    if (qtyResult.ok) assert.deepEqual(qtyResult.inventoryWarnings, []);
  });

  test("respuesta sin campo inventoryWarnings devuelve array vacío", async () => {
    const result = await createOpenOrderViaApi(
      {
        tableId: "mesa-missing",
        lines: [{ lineId: "line-1", productId: "prod-1", quantity: 1 }],
        idempotencyKey: "client-create-missing-field",
      },
      {
        apiFetch: mockApiFetch({
          ok: true,
          orderId: "order-missing-field",
          total: 5,
        }),
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.inventoryWarnings, []);
  });

  test("conserva orden y contenido del array recibido", async () => {
    const warnings = [SECOND_WARNING, SAMPLE_WARNING];
    const result = await createOpenOrderViaApi(
      {
        tableId: "mesa-order",
        lines: [{ lineId: "line-1", productId: "prod-1", quantity: 1 }],
        idempotencyKey: "client-create-order",
      },
      {
        apiFetch: mockApiFetch({
          ok: true,
          orderId: "order-order",
          total: 30,
          inventoryWarnings: warnings,
        }),
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.inventoryWarnings, warnings);
    assert.notDeepEqual(result.inventoryWarnings, [SAMPLE_WARNING, SECOND_WARNING]);
  });

  test("errores y conflictos mantienen contrato ApiFail sin inventoryWarnings", async () => {
    const conflict = await createOpenOrderViaApi(
      {
        tableId: "mesa-conflict",
        lines: [{ lineId: "line-1", productId: "prod-1", quantity: 1 }],
        idempotencyKey: "client-create-conflict",
      },
      {
        apiFetch: mockApiFetch({
          ok: false,
          error: "IDEMPOTENCY_CONFLICT",
          details: null,
          orderId: "order-conflict",
          inventoryWarnings: [SAMPLE_WARNING],
        }),
      },
    );
    assert.equal(conflict.ok, false);
    if (conflict.ok) return;
    assert.equal(conflict.error, "IDEMPOTENCY_CONFLICT");
    assert.equal("inventoryWarnings" in conflict, false);

    const transitionError = await transitionLineStatusViaApi(
      {
        orderId: "order-status",
        lineId: "line-1",
        expectedStatus: "pending",
        nextStatus: "sent",
        idempotencyKey: "client-status-error",
      },
      {
        apiFetch: mockApiFetch({
          ok: false,
          error: "TRANSITION_FAILED",
        }),
      },
    );
    assert.equal(transitionError.ok, false);
    if (transitionError.ok) return;
    assert.equal(transitionError.error, "TRANSITION_FAILED");
    assert.equal("inventoryWarnings" in transitionError, false);
  });
});
