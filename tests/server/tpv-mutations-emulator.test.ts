import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore as getAdminFirestore, type Firestore as AdminFirestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import type { AuthenticatedRestaurantContext, AuthenticatedRestaurantDependencies, AuthTokenVerifier } from "@/lib/server/auth/require-authenticated-restaurant";
import { handleCancelLines, handleCreateOpenOrder, handleAssignTableOperator, handleTransitionLineQuantity, handleTransitionLineStatus, handleUpsertSaleLines } from "@/lib/server/tpv/handle-tpv-order-mutations";
import { handleSyncOrderItemsRequest } from "@/lib/server/tpv/handle-sync-order-items-request";
import { handleChargeOrder } from "@/lib/server/tpv/handle-tpv-payment-mutations";
import { handleMergeTableGroupOrders } from "@/lib/server/tpv/handle-merge-table-group-orders";
import { handleCompLine, handleRemoveLineUnit, handleCloseOrder, handleReopenOrder, handleFinalizeTableAfterPayment } from "@/lib/server/tpv/handle-tpv-order-lifecycle";
import { stablePayloadHash, canonicalSerialize, readInventoryWarningsFromIdempotencyResult } from "@/lib/server/tpv/tpv-idempotency";
import { computeSplitEqualAmount } from "@/lib/server/tpv/split-payment-amounts";
import { isAllowedKdsLineStatusTransition } from "@/lib/server/tpv/line-status-transitions";
import { computeOrderEconomics } from "@/lib/server/tpv/compute-order-economics";
import {
  buildModifierSaleAggregatedReversalFingerprint,
  buildModifierSaleAggregatedReversalV3MovementId,
  MODIFIER_SALE_REVERSAL_SCHEMA_V3,
} from "@/lib/inventory/modifier-sale-movement-identity";
import { buildModifierReversalOperationIdempotencyKey } from "@/lib/server/tpv/plan-modifier-stock-reversal";
import type { Firestore as ClientFirestore } from "firebase/firestore";
import {
  assignTableOperatorOnFirstOpen,
  setAssignTableOperatorViaApiForTests,
} from "@/lib/firestore/table-operator-assignment";

const RESTAURANT_A = "rest-a-tpv";
const RESTAURANT_B = "rest-b-tpv-price";
const MANAGER_UID = "manager-tpv-a";
const CLIENT_DB_STUB = {} as ClientFirestore;

let testEnv: RulesTestEnvironment;
let adminApp: App;
let adminDb: AdminFirestore;

function authCtx(role = "manager"): AuthenticatedRestaurantContext {
  return {
    uid: MANAGER_UID,
    email: "manager@example.test",
    emailVerified: true,
    restaurantId: RESTAURANT_A,
    role,
    canManageUsers: true,
    db: adminDb,
  };
}

function syncRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/tpv/orders/sync-items", {
    method: "POST",
    headers: {
      Authorization: "Bearer waiter-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function syncDependencies(): AuthenticatedRestaurantDependencies {
  const auth: AuthTokenVerifier = {
    async verifyIdToken(token, checkRevoked) {
      assert.equal(checkRevoked, true);
      if (token !== "waiter-token") throw new Error("INVALID_TOKEN");
      return {
        uid: MANAGER_UID,
        email: "manager@example.test",
        email_verified: true,
      };
    },
  };
  return { auth, db: adminDb };
}

async function seedWaiterProfile() {
  const profile = {
    uid: MANAGER_UID,
    email: "manager@example.test",
    restaurantId: RESTAURANT_A,
    restaurantName: "Restaurante A",
    role: "waiter",
    status: "active",
  };
  await Promise.all([
    adminDb.collection("users").doc(MANAGER_UID).set(profile),
    adminDb.collection("usuarios").doc(MANAGER_UID).set(profile),
  ]);
}

type InvalidStockModifierFixture = {
  tableId: string;
  invProductId: string;
  groupId: string;
  optionId: string;
  productId: string;
  lineId: string;
};

async function seedInvalidCurrentStockModifierFixture(fixture: InvalidStockModifierFixture) {
  await adminDb.collection("tables").doc(fixture.tableId).set({
    restaurantId: RESTAURANT_A,
    name: fixture.tableId,
  });
  await adminDb
    .collection("restaurants")
    .doc(RESTAURANT_A)
    .collection("products")
    .doc(fixture.invProductId)
    .set({
      name: "Inventario stock inválido",
      active: true,
      inventory: { enabled: true, unit: "unit" },
    });
  await adminDb
    .collection("restaurants")
    .doc(RESTAURANT_A)
    .collection("modifierGroups")
    .doc(fixture.groupId)
    .set({
      name: "Mixer invalid stock",
      type: "mixer",
      active: true,
      options: [
        {
          id: fixture.optionId,
          name: "Cola",
          priceDelta: 0,
          active: true,
          inventoryProductId: fixture.invProductId,
          inventoryProductName: "Inventario stock inválido",
          inventoryQuantity: 1,
          inventoryUnit: "unit",
        },
      ],
    });
  await adminDb
    .collection("restaurants")
    .doc(RESTAURANT_A)
    .collection("products")
    .doc(fixture.productId)
    .set({
      name: "Whisky",
      price: 12,
      active: true,
      visibleOnMenu: true,
      modifierGroupIds: [fixture.groupId],
    });
}

async function countStockMovementsForOrder(orderId: string): Promise<number> {
  const snap = await adminDb
    .collection("restaurants")
    .doc(RESTAURANT_A)
    .collection("stockMovements")
    .where("orderId", "==", orderId)
    .get();
  return snap.size;
}

describe("tpv mutations emulator", () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-hostly-tpv-mutations",
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
    adminApp = initializeApp({ projectId: "demo-hostly-tpv-mutations" }, "tpv-mutations-admin");
    adminDb = getAdminFirestore(adminApp);
    adminDb.settings({ ignoreUndefinedProperties: true });
  });

  after(async () => {
    await testEnv.cleanup();
    await deleteApp(adminApp);
  });

  test("create-open + charge uses discounts in final total", async () => {
    await adminDb.collection("tables").doc("mesa-1").set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 1",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-1")
      .set({
        name: "Café",
        price: 2.5,
        active: true,
        tipoVenta: "carta",
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: "mesa-1",
      lines: [{ lineId: "line-1", productId: "prod-1", quantity: 2 }],
      markSent: true,
      idempotencyKey: "create-1",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    await adminDb.collection("orders").doc(created.orderId).update({
      discountPercent: 10,
    });

    const charged = await handleChargeOrder(authCtx("waiter"), {
      orderId: created.orderId,
      paymentMethod: "cash",
      type: "table_amount",
      amount: 4.5,
      idempotencyKey: "charge-1",
    });
    assert.equal("paymentId" in charged, true);
    if (!("paymentId" in charged)) return;
    assert.equal(charged.amount, 4.5);

    const payment = (
      await adminDb.collection("payments").doc(charged.paymentId).get()
    ).data();
    assert.equal(payment?.accountFinalTotal, 4.5);
  });

  test("kitchen cannot transition to cancelled", async () => {
    assert.equal(isAllowedKdsLineStatusTransition("sent", "cancelled"), false);
    await adminDb.collection("orders").doc("order-kds").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "sent",
      items: [{ id: "line-1", status: "sent", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const denied = await handleTransitionLineStatus(authCtx("kitchen"), {
      orderId: "order-kds",
      lineId: "line-1",
      expectedStatus: "sent",
      nextStatus: "cancelled",
    });
    assert.equal("error" in denied, true);
    if ("error" in denied) assert.equal(denied.error, "KDS_CANNOT_CANCEL");
  });

  test("waiter cancels via cancel-lines", async () => {
    await adminDb.collection("orders").doc("order-cancel").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "sent",
      items: [{ id: "line-1", status: "sent", quantity: 1, price: 8, total: 8 }],
      total: 8,
    });
    const result = await handleCancelLines(authCtx("waiter"), {
      orderId: "order-cancel",
      lineIds: ["line-1"],
    });
    assert.equal("cancelledLineIds" in result, true);
    const order = (await adminDb.collection("orders").doc("order-cancel").get()).data();
    const items = order?.items as Array<Record<string, unknown>>;
    assert.equal(String(items?.[0]?.status), "cancelled");
  });

  test("computeOrderEconomics applies percent discount", () => {
    const economics = computeOrderEconomics(
      { discountPercent: 10 },
      [{ id: "a", status: "sent", quantity: 1, price: 100, total: 100 }],
    );
    assert.equal(economics.finalTotal, 90);
  });

  test("idempotent create-open returns same order", async () => {
    const intent = {
      tableId: "mesa-1",
      lines: [{ lineId: "line-x", productId: "prod-1", quantity: 1 }],
      idempotencyKey: "idem-create-2",
    };
    const first = await handleCreateOpenOrder(authCtx(), intent);
    const second = await handleCreateOpenOrder(authCtx(), intent);
    assert.equal("orderId" in first, true);
    assert.equal("orderId" in second, true);
    if ("orderId" in first && "orderId" in second) {
      assert.equal(first.orderId, second.orderId);
    }
  });

  test("merge table group is idempotent", async () => {
    await adminDb.collection("tables").doc("mesa-a").set({ restaurantId: RESTAURANT_A, name: "A" });
    await adminDb.collection("tables").doc("mesa-b").set({ restaurantId: RESTAURANT_A, name: "B" });
    await adminDb.collection("orders").doc("order-a").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-a",
      status: "open",
      items: [{ id: "la-1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
      createdAt: 1,
    });
    await adminDb.collection("orders").doc("order-b").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-b",
      status: "open",
      items: [{ id: "lb-1", status: "pending", quantity: 1, price: 3, total: 3 }],
      total: 3,
      createdAt: 2,
    });
    const intent = {
      mainTableId: "mesa-a",
      memberTableIds: ["mesa-a", "mesa-b"],
      idempotencyKey: "merge-1",
    };
    const first = await handleMergeTableGroupOrders(authCtx(), intent);
    const second = await handleMergeTableGroupOrders(authCtx(), intent);
    assert.equal("merged" in first, true);
    assert.equal("merged" in second, true);
    if ("merged" in first && "merged" in second) {
      assert.equal(first.merged, true);
      assert.equal(second.destOrderId, first.destOrderId);
    }
  });

  test("transition line quantity is idempotent with stable advanced id", async () => {
    await adminDb.collection("orders").doc("order-split-qty").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "sent",
      items: [{ id: "line-1", status: "sent", quantity: 3, price: 10, total: 30 }],
      total: 30,
    });
    const intent = {
      orderId: "order-split-qty",
      lineId: "line-1",
      units: 1,
      expectedStatus: "sent",
      nextStatus: "prepared",
      idempotencyKey: "split-qty-1",
    };
    const first = await handleTransitionLineQuantity(authCtx("kitchen"), intent);
    const second = await handleTransitionLineQuantity(authCtx("kitchen"), intent);
    assert.equal("advancedLineId" in first, true);
    assert.equal("advancedLineId" in second, true);
    if ("advancedLineId" in first && "advancedLineId" in second) {
      assert.equal(first.advancedLineId, second.advancedLineId);
    }
  });

  test("charge rejects contradictory tableId", async () => {
    await adminDb.collection("orders").doc("order-table-mismatch").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "sent",
      items: [{ id: "line-1", status: "sent", quantity: 1, price: 10, total: 10 }],
      total: 10,
    });
    const denied = await handleChargeOrder(authCtx("waiter"), {
      orderId: "order-table-mismatch",
      tableId: "mesa-2",
      paymentMethod: "cash",
      type: "table_amount",
      amount: 10,
    });
    assert.equal("error" in denied, true);
    if ("error" in denied) assert.equal(denied.error, "TABLE_ORDER_MISMATCH");
  });

  test("remove line unit decrements quantity", async () => {
    await adminDb.collection("orders").doc("order-remove").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "sent",
      items: [{ id: "line-1", status: "sent", quantity: 2, price: 5, total: 10 }],
      total: 10,
    });
    const result = await handleRemoveLineUnit(authCtx("waiter"), {
      orderId: "order-remove",
      lineId: "line-1",
    });
    assert.equal("total" in result, true);
    const order = (await adminDb.collection("orders").doc("order-remove").get()).data();
    const items = order?.items as Array<Record<string, unknown>>;
    assert.equal(items?.[0]?.quantity, 1);
  });

  test("comp line requires discount capability", async () => {
    await adminDb.collection("orders").doc("order-comp").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "sent",
      items: [{ id: "line-1", status: "sent", quantity: 1, price: 12, total: 12 }],
      total: 12,
    });
    const denied = await handleCompLine(authCtx("waiter"), {
      orderId: "order-comp",
      lineId: "line-1",
      comped: true,
    });
    assert.equal("error" in denied, true);
    const allowed = await handleCompLine(authCtx("manager"), {
      orderId: "order-comp",
      lineId: "line-1",
      comped: true,
    });
    assert.equal("isComped" in allowed, true);
  });

  test("nested idempotency hash is stable", () => {
    const a = stablePayloadHash({
      lines: [{ lineId: "l1", modifiers: [{ groupId: "g1", optionId: "o1" }] }],
      orderId: "o1",
    });
    const b = stablePayloadHash({
      orderId: "o1",
      lines: [{ modifiers: [{ optionId: "o1", groupId: "g1" }], lineId: "l1" }],
    });
    assert.equal(a, b);
  });

  test("15-16. categoría canónica en restaurantes e ignora shadow en restaurants", async () => {
    await adminDb.collection("tables").doc("mesa-mod").set({
      restaurantId: RESTAURANT_A,
      name: "Mesa mod",
    });
    await adminDb
      .collection("restaurantes")
      .doc(RESTAURANT_A)
      .collection("cartaCategorias")
      .doc("cat-mod")
      .set({
        name: "Bebidas",
        isActive: true,
        modifierGroupIds: ["grp-format"],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("cartaCategorias")
      .doc("cat-mod")
      .set({
        name: "Shadow",
        isActive: true,
        modifierGroupIds: ["grp-shadow"],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc("grp-format")
      .set({
        name: "Formato",
        type: "format",
        active: true,
        required: true,
        minSelected: 1,
        maxSelected: 1,
        options: [{ id: "opt-normal", name: "Normal", priceDelta: 0, active: true }],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc("grp-shadow")
      .set({
        name: "Shadow",
        type: "custom",
        active: true,
        options: [{ id: "opt-shadow", name: "Shadow", priceDelta: 99, active: true }],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-mod")
      .set({
        name: "Cola",
        price: 3,
        active: true,
        visibleOnMenu: true,
        categoryId: "cat-mod",
        tipoVenta: "bebida",
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: "mesa-mod",
      lines: [
        {
          lineId: "line-mod",
          productId: "prod-mod",
          quantity: 1,
          selectedModifiers: [{ groupId: "grp-format", optionId: "opt-normal" }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-mod-canonical",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const shadowDenied = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: "mesa-mod",
      lines: [
        {
          lineId: "line-shadow",
          productId: "prod-mod",
          quantity: 1,
          selectedModifiers: [{ groupId: "grp-shadow", optionId: "opt-shadow" }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-mod-shadow-deny",
    });
    assert.equal("error" in shadowDenied, true);
    if ("error" in shadowDenied) {
      assert.equal(shadowDenied.error, "MODIFIER_GROUP_NOT_ALLOWED");
    }
  });

  test("17. multi-tenant usa priceDelta del tenant autenticado", async () => {
    const sharedGroupId = "grp-shared-price";
    const sharedOptionId = "opt-shared";
    for (const [restaurantId, delta, tableId, productId, lineId, key] of [
      [RESTAURANT_A, 1.25, "mesa-price-a", "prod-price-a", "line-price-a", "price-a"] as const,
      [RESTAURANT_B, 4.5, "mesa-price-b", "prod-price-b", "line-price-b", "price-b"] as const,
    ]) {
      await adminDb.collection("tables").doc(tableId).set({ restaurantId, name: tableId });
      await adminDb
        .collection("restaurants")
        .doc(restaurantId)
        .collection("modifierGroups")
        .doc(sharedGroupId)
        .set({
          name: "Suplemento",
          type: "addon",
          active: true,
          options: [{ id: sharedOptionId, name: "Extra", priceDelta: delta, active: true }],
        });
      await adminDb
        .collection("restaurants")
        .doc(restaurantId)
        .collection("products")
        .doc(productId)
        .set({
          name: "Producto",
          price: 10,
          active: true,
          visibleOnMenu: true,
          modifierGroupIds: [sharedGroupId],
        });
      const created = await handleCreateOpenOrder(
        { ...authCtx("waiter"), restaurantId },
        {
          tableId,
          lines: [
            {
              lineId,
              productId,
              quantity: 1,
              selectedModifiers: [{ groupId: sharedGroupId, optionId: sharedOptionId }],
            },
          ],
          markSent: true,
          idempotencyKey: key,
        },
      );
      assert.equal("orderId" in created, true);
      if (!("orderId" in created)) return;
      const orderSnap = await adminDb.collection("orders").doc(created.orderId).get();
      const items = orderSnap.data()?.items as Array<Record<string, unknown>> | undefined;
      const modifiers = items?.[0]?.selectedModifiers as Array<Record<string, unknown>> | undefined;
      assert.equal(modifiers?.[0]?.priceDelta, delta);
    }
  });

  test("18. venta sin selección no se bloquea por grupo inactivo o vacío referenciado", async () => {
    await adminDb.collection("tables").doc("mesa-empty-ref").set({
      restaurantId: RESTAURANT_A,
      name: "Mesa empty ref",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc("grp-inactive-ref")
      .set({
        name: "Inactivo",
        type: "custom",
        active: false,
        required: true,
        options: [{ id: "opt-i", name: "I", priceDelta: 0, active: true }],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc("grp-empty-ref")
      .set({
        name: "Vacío",
        type: "custom",
        active: true,
        required: true,
        minSelected: 1,
        options: [{ id: "opt-dead", name: "Dead", priceDelta: 0, active: false }],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-empty-ref")
      .set({
        name: "Plato",
        price: 8,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: ["grp-inactive-ref", "grp-empty-ref"],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: "mesa-empty-ref",
      lines: [{ lineId: "line-empty-ref", productId: "prod-empty-ref", quantity: 1 }],
      markSent: true,
      idempotencyKey: "create-empty-ref",
    });
    assert.equal("orderId" in created, true);
  });

  test("6C1-11. modificar modifierGroup después de crear la order no altera el snapshot", async () => {
    await adminDb.collection("tables").doc("mesa-inv-snap").set({
      restaurantId: RESTAURANT_A,
      name: "Mesa inv snap",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("inv-cola-a")
      .set({
        name: "Cola A",
        active: true,
        inventory: { enabled: true, unit: "unit", currentStock: 100 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc("grp-inv-snap")
      .set({
        name: "Mixer snap",
        type: "mixer",
        active: true,
        options: [
          {
            id: "opt-cola",
            name: "Cola",
            priceDelta: 1,
            active: true,
            inventoryProductId: "inv-cola-a",
            inventoryProductName: "Cola A",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-inv-snap")
      .set({
        name: "Ballantines",
        price: 10,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: ["grp-inv-snap"],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: "mesa-inv-snap",
      lines: [
        {
          lineId: "line-inv-snap",
          productId: "prod-inv-snap",
          quantity: 3,
          selectedModifiers: [{ groupId: "grp-inv-snap", optionId: "opt-cola" }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-inv-snap",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc("grp-inv-snap")
      .set({
        name: "Mixer snap",
        type: "mixer",
        active: true,
        options: [
          {
            id: "opt-cola",
            name: "Cola",
            priceDelta: 99,
            active: true,
            inventoryProductId: "inv-cola-changed",
            inventoryProductName: "Cola cambiada",
            inventoryQuantity: 5,
            inventoryUnit: "l",
          },
        ],
      });

    const orderSnap = await adminDb.collection("orders").doc(created.orderId).get();
    const items = orderSnap.data()?.items as Array<Record<string, unknown>> | undefined;
    const mods = items?.[0]?.selectedModifiers as Array<Record<string, unknown>> | undefined;
    assert.equal(mods?.[0]?.inventoryProductId, "inv-cola-a");
    assert.equal(mods?.[0]?.inventoryProductName, "Cola A");
    assert.equal(mods?.[0]?.inventoryQuantity, 1);
    assert.equal(mods?.[0]?.inventoryUnit, "unit");
    assert.equal(mods?.[0]?.priceDelta, 1);
    assert.equal(items?.[0]?.quantity, 3);
  });

  test("6C1-12. tenant A y tenant B conservan metadata de su propio catálogo", async () => {
    const sharedGroupId = "grp-inv-shared";
    const sharedOptionId = "opt-shared-inv";
    for (const [restaurantId, productId, inventoryProductId, tableId, lineId, key] of [
      [RESTAURANT_A, "prod-inv-a", "inv-tenant-a", "mesa-inv-a", "line-inv-a", "inv-meta-a"] as const,
      [RESTAURANT_B, "prod-inv-b", "inv-tenant-b", "mesa-inv-b", "line-inv-b", "inv-meta-b"] as const,
    ]) {
      await adminDb.collection("tables").doc(tableId).set({ restaurantId, name: tableId });
      await adminDb
        .collection("restaurants")
        .doc(restaurantId)
        .collection("products")
        .doc(inventoryProductId)
        .set({
          name: `Refresco ${restaurantId}`,
          active: true,
          inventory: { enabled: true, unit: "unit", currentStock: 100 },
        });
      await adminDb
        .collection("restaurants")
        .doc(restaurantId)
        .collection("modifierGroups")
        .doc(sharedGroupId)
        .set({
          name: "Mixer tenant",
          type: "mixer",
          active: true,
          options: [
            {
              id: sharedOptionId,
              name: "Cola",
              priceDelta: 0,
              active: true,
              inventoryProductId,
              inventoryProductName: `Refresco ${restaurantId}`,
              inventoryQuantity: 1,
              inventoryUnit: "unit",
            },
          ],
        });
      await adminDb
        .collection("restaurants")
        .doc(restaurantId)
        .collection("products")
        .doc(productId)
        .set({
          name: "Whisky",
          price: 12,
          active: true,
          visibleOnMenu: true,
          modifierGroupIds: [sharedGroupId],
        });
      const created = await handleCreateOpenOrder(
        { ...authCtx("waiter"), restaurantId },
        {
          tableId,
          lines: [
            {
              lineId,
              productId,
              quantity: 1,
              selectedModifiers: [{ groupId: sharedGroupId, optionId: sharedOptionId }],
            },
          ],
          markSent: true,
          idempotencyKey: key,
        },
      );
      assert.equal("orderId" in created, true);
      if (!("orderId" in created)) return;
      const orderSnap = await adminDb.collection("orders").doc(created.orderId).get();
      const items = orderSnap.data()?.items as Array<Record<string, unknown>> | undefined;
      const mods = items?.[0]?.selectedModifiers as Array<Record<string, unknown>> | undefined;
      assert.equal(mods?.[0]?.inventoryProductId, inventoryProductId);
      assert.equal(mods?.[0]?.inventoryProductName, `Refresco ${restaurantId}`);
      assert.equal(mods?.[0]?.inventoryQuantity, 1);
      assert.equal(mods?.[0]?.inventoryUnit, "unit");

      const orderItemsSnap = await adminDb
        .collection("orderItems")
        .where("restaurantId", "==", restaurantId)
        .where("orderId", "==", created.orderId)
        .get();
      assert.equal(orderItemsSnap.empty, false);
      const projectedMods = orderItemsSnap.docs[0]?.data()?.selectedModifiers as
        | Array<Record<string, unknown>>
        | undefined;
      assert.equal(projectedMods?.[0]?.inventoryProductId, inventoryProductId);
    }
  });

  test("6C2. create-open sent aplica modifier_sale y stock en la misma transacción", async () => {
    const invProductId = "inv-cola-6c2";
    const groupId = "grp-mixer-6c2";
    const optionId = "opt-cola";
    await adminDb.collection("tables").doc("mesa-6c2").set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 10 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Coca-Cola inventario",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c2")
      .set({
        name: "Ballantines",
        price: 12,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: "mesa-6c2",
      lines: [
        {
          lineId: "line-6c2",
          productId: "prod-6c2",
          quantity: 3,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c2-stock",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const orderSnap = await adminDb.collection("orders").doc(created.orderId).get();
    const mods = (orderSnap.data()?.items as Array<Record<string, unknown>> | undefined)?.[0]
      ?.selectedModifiers as Array<Record<string, unknown>> | undefined;
    assert.equal(mods?.[0]?.inventoryProductId, invProductId);
    assert.equal(mods?.[0]?.inventoryQuantity, 1);

    const movementsSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .get();
    assert.equal(movementsSnap.size, 1);
    const movement = movementsSnap.docs[0]?.data();
    assert.equal(movement?.type, "modifier_sale");
    assert.equal(movement?.applied, true);
    assert.equal(movement?.quantityDelta, -3);
    assert.equal(movement?.stockBefore, 10);
    assert.equal(movement?.stockAfter, 7);

    const invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    const currentStock = (invSnap.data()?.inventory as Record<string, unknown> | undefined)
      ?.currentStock;
    assert.equal(currentStock, 7);
  });

  test("6C2R. cancel-lines revierte modifier stock y retry no duplica", async () => {
    const invProductId = "inv-cola-6c2r-cancel";
    const groupId = "grp-mixer-6c2r-cancel";
    const optionId = "opt-cola-6c2r-cancel";
    const tableId = "mesa-6c2r-cancel";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2R cancel",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 10 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Coca-Cola inventario",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c2r-cancel")
      .set({
        name: "Ballantines",
        price: 12,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: [
        {
          lineId: "line-6c2r-cancel",
          productId: "prod-6c2r-cancel",
          quantity: 2,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c2r-cancel",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const cancelled = await handleCancelLines(authCtx("waiter"), {
      orderId: created.orderId,
      lineIds: ["line-6c2r-cancel"],
    });
    assert.equal("orderId" in cancelled, true);

    const invAfterCancel = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal(
      (invAfterCancel.data()?.inventory as Record<string, unknown> | undefined)?.currentStock,
      10,
    );

    const movementsAfterCancel = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .get();
    const types = movementsAfterCancel.docs.map((d) => d.data().type).sort();
    assert.equal(types.filter((t) => t === "modifier_sale").length, 1);
    const reversalDocs = movementsAfterCancel.docs.filter((d) => d.data().type === "modifier_sale_reversal");
    assert.equal(reversalDocs.length, 1);
    assert.equal(reversalDocs[0]?.data().reversedSaleUnits, 2);
    assert.equal(reversalDocs[0]?.data().movementSchemaVersion, MODIFIER_SALE_REVERSAL_SCHEMA_V3);

    const cancelledAgain = await handleCancelLines(authCtx("waiter"), {
      orderId: created.orderId,
      lineIds: ["line-6c2r-cancel"],
    });
    assert.equal("orderId" in cancelledAgain, true);

    const movementsAfterRetry = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .get();
    assert.equal(
      movementsAfterRetry.docs.filter((d) => d.data().type === "modifier_sale_reversal").length,
      1,
    );
    const invAfterRetry = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal(
      (invAfterRetry.data()?.inventory as Record<string, unknown> | undefined)?.currentStock,
      10,
    );
  });

  test("6C2R. remove-line-unit parcial + cancel restante revierte sin sobrecompensar", async () => {
    const invProductId = "inv-cola-6c2r-remove";
    const groupId = "grp-mixer-6c2r-remove";
    const optionId = "opt-cola-6c2r-remove";
    const tableId = "mesa-6c2r-remove";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2R remove",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 10 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Coca-Cola inventario",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c2r-remove")
      .set({
        name: "Ballantines",
        price: 12,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: [
        {
          lineId: "line-6c2r-remove",
          productId: "prod-6c2r-remove",
          quantity: 3,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c2r-remove",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const removed = await handleRemoveLineUnit(authCtx("waiter"), {
      orderId: created.orderId,
      lineId: "line-6c2r-remove",
      idempotencyKey: "remove-6c2r-1",
    });
    assert.equal("orderId" in removed, true);

    let invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal((invSnap.data()?.inventory as Record<string, unknown>)?.currentStock, 8);

    const removedAgain = await handleRemoveLineUnit(authCtx("waiter"), {
      orderId: created.orderId,
      lineId: "line-6c2r-remove",
      idempotencyKey: "remove-6c2r-1",
    });
    assert.equal("orderId" in removedAgain, true);
    invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal((invSnap.data()?.inventory as Record<string, unknown>)?.currentStock, 8);

    const removedSecond = await handleRemoveLineUnit(authCtx("waiter"), {
      orderId: created.orderId,
      lineId: "line-6c2r-remove",
      idempotencyKey: "remove-6c2r-2",
    });
    assert.equal("orderId" in removedSecond, true);
    invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal((invSnap.data()?.inventory as Record<string, unknown>)?.currentStock, 9);

    const cancelled = await handleCancelLines(authCtx("waiter"), {
      orderId: created.orderId,
      lineIds: ["line-6c2r-remove"],
    });
    assert.equal("orderId" in cancelled, true);
    invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal((invSnap.data()?.inventory as Record<string, unknown>)?.currentStock, 10);

    const movements = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .get();
    const saleQty = movements.docs
      .filter((d) => d.data().type === "modifier_sale")
      .reduce((s, d) => s + Number(d.data().quantityDelta || 0), 0);
    const revQty = movements.docs
      .filter((d) => d.data().type === "modifier_sale_reversal")
      .reduce((s, d) => s + Number(d.data().quantityDelta || 0), 0);
    assert.equal(saleQty, -3);
    assert.equal(revQty, 3);
  });

  test("6C2R. dos líneas mismo modificador: cancelar solo la segunda revierte su occurrence global", async () => {
    const invProductId = "inv-cola-6c2r-dual";
    const groupId = "grp-mixer-6c2r-dual";
    const optionId = "opt-cola-6c2r-dual";
    const tableId = "mesa-6c2r-dual";
    const lineA = "line-6c2r-dual-a";
    const lineB = "line-6c2r-dual-b";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2R dual",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 10 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Coca-Cola inventario",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c2r-dual")
      .set({
        name: "Refresco",
        price: 3,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: [
        {
          lineId: lineA,
          productId: "prod-6c2r-dual",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
        {
          lineId: lineB,
          productId: "prod-6c2r-dual",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c2r-dual",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const invAfterSend = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal(
      (invAfterSend.data()?.inventory as Record<string, unknown> | undefined)?.currentStock,
      8,
    );

    const salesAfterSend = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .where("type", "==", "modifier_sale")
      .get();
    assert.equal(salesAfterSend.docs.length, 2);
    const saleByLine = new Map(
      salesAfterSend.docs.map((doc) => [String(doc.data().lineId ?? doc.data().sentSegmentLineId), doc]),
    );
    assert.equal(saleByLine.get(lineA)?.data().selectionOccurrence, 0);
    assert.equal(saleByLine.get(lineB)?.data().selectionOccurrence, 1);

    const cancelled = await handleCancelLines(authCtx("waiter"), {
      orderId: created.orderId,
      lineIds: [lineB],
    });
    assert.equal("orderId" in cancelled, true);

    const invAfterCancelB = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal(
      (invAfterCancelB.data()?.inventory as Record<string, unknown> | undefined)?.currentStock,
      9,
    );

    const reversalsAfterB = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .where("type", "==", "modifier_sale_reversal")
      .get();
    assert.equal(reversalsAfterB.docs.length, 1);
    assert.equal(reversalsAfterB.docs[0]?.data().lineId, lineB);
    assert.equal(reversalsAfterB.docs[0]?.data().selectionOccurrence, 1);

    const cancelledA = await handleCancelLines(authCtx("waiter"), {
      orderId: created.orderId,
      lineIds: [lineA],
    });
    assert.equal("orderId" in cancelledA, true);

    const invFinal = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal(
      (invFinal.data()?.inventory as Record<string, unknown> | undefined)?.currentStock,
      10,
    );

    const allMovements = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .get();
    assert.equal(allMovements.docs.filter((d) => d.data().type === "modifier_sale").length, 2);
    assert.equal(
      allMovements.docs.filter((d) => d.data().type === "modifier_sale_reversal").length,
      2,
    );

    const cancelledBRetry = await handleCancelLines(authCtx("waiter"), {
      orderId: created.orderId,
      lineIds: [lineB],
    });
    assert.equal("orderId" in cancelledBRetry, true);
    const movementsAfterRetry = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .get();
    assert.equal(
      movementsAfterRetry.docs.filter((d) => d.data().type === "modifier_sale_reversal").length,
      2,
    );
  });

  test("6C2R. documento de reversión corrupto aborta cancel-lines sin tocar orden ni stock", async () => {
    const invProductId = "inv-cola-6c2r-corrupt";
    const groupId = "grp-mixer-6c2r-corrupt";
    const optionId = "opt-cola-6c2r-corrupt";
    const tableId = "mesa-6c2r-corrupt";
    const lineId = "line-6c2r-corrupt";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2R corrupt",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 10 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Coca-Cola inventario",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c2r-corrupt")
      .set({
        name: "Refresco",
        price: 3,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: [
        {
          lineId,
          productId: "prod-6c2r-corrupt",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c2r-corrupt",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const saleSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .where("type", "==", "modifier_sale")
      .limit(1)
      .get();
    assert.equal(saleSnap.docs.length, 1);
    const saleDoc = saleSnap.docs[0]!;
    const operationIdempotencyKey = buildModifierReversalOperationIdempotencyKey({
      operationKind: "cancel_lines",
      restaurantId: RESTAURANT_A,
      orderId: created.orderId,
      lineId,
      beforeRemaining: 1,
      afterRemaining: 0,
    });
    const corruptReversalId = buildModifierSaleAggregatedReversalV3MovementId({
      restaurantId: RESTAURANT_A,
      orderId: created.orderId,
      sentSegmentLineId: lineId,
      reversalOfMovementId: saleDoc.id,
      operationIdempotencyKey,
      schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .doc(corruptReversalId)
      .set({
        restaurantId: RESTAURANT_A,
        orderId: created.orderId,
        lineId,
        sentSegmentLineId: lineId,
        type: "modifier_sale_reversal",
        source: "modifier_sale_reversal",
        applied: false,
        productId: invProductId,
        modifierGroupId: groupId,
        modifierOptionId: optionId,
        reversalOfMovementId: saleDoc.id,
        selectionOccurrence: 0,
        operationIdempotencyKey,
        movementSchemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
        quantityDelta: 0,
        inventoryQuantityPerUnit: 1,
        unit: "unit",
        reversedSaleUnits: 1,
        idempotencyKey: corruptReversalId,
        movementFingerprint: "corrupt",
        productName: "Coca-Cola inventario",
      });

    const cancelled = await handleCancelLines(authCtx("waiter"), {
      orderId: created.orderId,
      lineIds: [lineId],
    });
    assert.equal("error" in cancelled, true);
    if (!("error" in cancelled)) return;
    assert.equal(cancelled.status, 409);
    assert.equal(cancelled.error, "STOCK_MOVEMENT_ID_CONFLICT");

    const orderSnap = await adminDb.collection("orders").doc(created.orderId).get();
    const line = (orderSnap.data()?.items as Array<Record<string, unknown>> | undefined)?.find(
      (row) => row.id === lineId,
    );
    assert.equal(line?.status, "sent");

    const invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal(
      (invSnap.data()?.inventory as Record<string, unknown> | undefined)?.currentStock,
      9,
    );

    const corruptSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .doc(corruptReversalId)
      .get();
    assert.equal(corruptSnap.data()?.applied, false);
    assert.equal(corruptSnap.data()?.quantityDelta, 0);

    const reversals = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .where("type", "==", "modifier_sale_reversal")
      .get();
    assert.equal(reversals.docs.length, 1);
    assert.equal(reversals.docs[0]?.id, corruptReversalId);
  });

  test("6C2R-CODEX-46. movimiento original corrupto en id determinista aborta cancel-lines", async () => {
    const invProductId = "inv-cola-6c2r-corrupt-original";
    const groupId = "grp-mixer-6c2r-corrupt-original";
    const optionId = "opt-cola-6c2r-corrupt-original";
    const tableId = "mesa-6c2r-corrupt-original";
    const lineId = "line-6c2r-corrupt-original";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2R corrupt original",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 10 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Coca-Cola inventario",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c2r-corrupt-original")
      .set({
        name: "Refresco",
        price: 3,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: [
        {
          lineId,
          productId: "prod-6c2r-corrupt-original",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c2r-corrupt-original",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const saleSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .where("type", "==", "modifier_sale")
      .limit(1)
      .get();
    assert.equal(saleSnap.docs.length, 1);
    const saleDoc = saleSnap.docs[0]!;
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .doc(saleDoc.id)
      .update({ applied: false, quantityDelta: 0 });

    const cancelled = await handleCancelLines(authCtx("waiter"), {
      orderId: created.orderId,
      lineIds: [lineId],
    });
    assert.equal("error" in cancelled, true);
    if (!("error" in cancelled)) return;
    assert.equal(cancelled.status, 409);
    assert.equal(cancelled.error, "STOCK_MOVEMENT_ID_CONFLICT");

    const orderSnap = await adminDb.collection("orders").doc(created.orderId).get();
    const line = (orderSnap.data()?.items as Array<Record<string, unknown>> | undefined)?.find(
      (row) => row.id === lineId,
    );
    assert.equal(line?.status, "sent");
  });

  test("6C2R-BLOCK2-48. original con type corrupto en id determinista aborta cancel-lines", async () => {
    const invProductId = "inv-cola-6c2r-type-corrupt";
    const groupId = "grp-mixer-6c2r-type-corrupt";
    const optionId = "opt-cola-6c2r-type-corrupt";
    const tableId = "mesa-6c2r-type-corrupt";
    const lineId = "line-6c2r-type-corrupt";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2R type corrupt",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 10 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Coca-Cola inventario",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c2r-type-corrupt")
      .set({
        name: "Refresco",
        price: 3,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: [
        {
          lineId,
          productId: "prod-6c2r-type-corrupt",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c2r-type-corrupt",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const saleSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .where("type", "==", "modifier_sale")
      .limit(1)
      .get();
    assert.equal(saleSnap.docs.length, 1);
    const saleDoc = saleSnap.docs[0]!;
    const corruptPayload = { ...(saleDoc.data() as Record<string, unknown>), type: "manual_adjustment" };
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .doc(saleDoc.id)
      .set(corruptPayload);

    const stockBefore = (
      await adminDb
        .collection("restaurants")
        .doc(RESTAURANT_A)
        .collection("products")
        .doc(invProductId)
        .get()
    ).data()?.inventory as { currentStock?: number } | undefined;

    const cancelled = await handleCancelLines(authCtx("waiter"), {
      orderId: created.orderId,
      lineIds: [lineId],
    });
    assert.equal("error" in cancelled, true);
    if (!("error" in cancelled)) return;
    assert.equal(cancelled.status, 409);
    assert.equal(cancelled.error, "STOCK_MOVEMENT_ID_CONFLICT");

    const orderSnap = await adminDb.collection("orders").doc(created.orderId).get();
    const line = (orderSnap.data()?.items as Array<Record<string, unknown>> | undefined)?.find(
      (row) => row.id === lineId,
    );
    assert.equal(line?.status, "sent");

    const stockAfter = (
      await adminDb
        .collection("restaurants")
        .doc(RESTAURANT_A)
        .collection("products")
        .doc(invProductId)
        .get()
    ).data()?.inventory as { currentStock?: number } | undefined;
    assert.equal(stockAfter?.currentStock, stockBefore?.currentStock);

    const corruptSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .doc(saleDoc.id)
      .get();
    assert.equal(corruptSnap.data()?.type, "manual_adjustment");
  });

  test("6C2R-CODEX-47. retry con ledger global sobre-revertido aborta", async () => {
    const invProductId = "inv-cola-6c2r-over-revert";
    const groupId = "grp-mixer-6c2r-over-revert";
    const optionId = "opt-cola-6c2r-over-revert";
    const tableId = "mesa-6c2r-over-revert";
    const lineId = "line-6c2r-over-revert";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2R over revert",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 10 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Coca-Cola inventario",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c2r-over-revert")
      .set({
        name: "Refresco",
        price: 3,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: [
        {
          lineId,
          productId: "prod-6c2r-over-revert",
          quantity: 5,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c2r-over-revert",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const removed = await handleRemoveLineUnit(authCtx("waiter"), {
      orderId: created.orderId,
      lineId,
      idempotencyKey: "remove-over-revert-1",
    });
    assert.equal("orderId" in removed, true);

    const saleSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .where("type", "==", "modifier_sale")
      .limit(1)
      .get();
    assert.equal(saleSnap.docs.length, 1);
    const saleDoc = saleSnap.docs[0]!;

    const ghostKey = "ghost-over-revert-5";
    const ghostId = buildModifierSaleAggregatedReversalV3MovementId({
      restaurantId: RESTAURANT_A,
      orderId: created.orderId,
      sentSegmentLineId: lineId,
      reversalOfMovementId: saleDoc.id,
      operationIdempotencyKey: ghostKey,
      schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
    });
    const ghostUnits = 5;
    const ghostQuantityDelta = ghostUnits;
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .doc(ghostId)
      .set({
        restaurantId: RESTAURANT_A,
        orderId: created.orderId,
        lineId,
        sentSegmentLineId: lineId,
        type: "modifier_sale_reversal",
        source: "modifier_sale_reversal",
        applied: true,
        productId: invProductId,
        modifierGroupId: groupId,
        modifierOptionId: optionId,
        reversalOfMovementId: saleDoc.id,
        selectionOccurrence: 0,
        operationIdempotencyKey: ghostKey,
        movementSchemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
        quantityDelta: ghostQuantityDelta,
        inventoryQuantityPerUnit: 1,
        unit: "unit",
        reversedSaleUnits: ghostUnits,
        idempotencyKey: ghostId,
        movementFingerprint: buildModifierSaleAggregatedReversalFingerprint({
          schemaVersion: MODIFIER_SALE_REVERSAL_SCHEMA_V3,
          reversedSaleUnits: ghostUnits,
          inventoryQuantityPerUnit: 1,
          inventoryUnit: "unit",
          quantityDelta: ghostQuantityDelta,
        }),
        productName: "Coca-Cola inventario",
      });

    const retried = await handleRemoveLineUnit(authCtx("waiter"), {
      orderId: created.orderId,
      lineId,
      idempotencyKey: "remove-over-revert-2",
    });
    assert.equal("error" in retried, true);
    if (!("error" in retried)) return;
    assert.equal(retried.status, 409);
    assert.equal(retried.error, "STOCK_MOVEMENT_ID_CONFLICT");
  });

  test("6C2R-BLOCK1-33. pedido 20 lineas cancela linea intermedia con movimiento exacto", async () => {
    const invProductId = "inv-cola-6c2r-scale20";
    const groupId = "grp-mixer-6c2r-scale20";
    const optionId = "opt-cola-6c2r-scale20";
    const tableId = "mesa-6c2r-scale20";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2R scale20",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 100 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Coca-Cola inventario",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c2r-scale20")
      .set({
        name: "Refresco",
        price: 3,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const lineIds = Array.from({ length: 20 }, (_, index) => `line-scale20-${index}`);
    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: lineIds.map((lineId) => ({
        lineId,
        productId: "prod-6c2r-scale20",
        quantity: 1,
        selectedModifiers: [{ groupId, optionId }],
      })),
      markSent: true,
      idempotencyKey: "create-6c2r-scale20",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const targetLineId = lineIds[10]!;
    const salesBefore = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .where("type", "==", "modifier_sale")
      .get();
    assert.equal(salesBefore.docs.length, 20);
    const targetSale = salesBefore.docs.find((doc) => doc.data().lineId === targetLineId);
    assert.ok(targetSale);

    const cancelled = await handleCancelLines(authCtx("waiter"), {
      orderId: created.orderId,
      lineIds: [targetLineId],
    });
    assert.equal("orderId" in cancelled, true);

    const reversals = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .where("type", "==", "modifier_sale_reversal")
      .get();
    assert.equal(reversals.docs.length, 1);
    assert.equal(reversals.docs[0]?.data().reversalOfMovementId, targetSale!.id);
    assert.equal(reversals.docs[0]?.data().lineId, targetLineId);

    const invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal(
      (invSnap.data()?.inventory as Record<string, unknown> | undefined)?.currentStock,
      81,
    );
  });

  test("6C2R-BLOCK1-37. dos lineas mismo modificador cancela solo la segunda", async () => {
    const invProductId = "inv-cola-6c2r-two-lines";
    const groupId = "grp-mixer-6c2r-two-lines";
    const optionId = "opt-cola-6c2r-two-lines";
    const tableId = "mesa-6c2r-two-lines";
    const lineA = "line-two-lines-a";
    const lineB = "line-two-lines-b";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2R two lines",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 50 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Coca-Cola inventario",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c2r-two-lines")
      .set({
        name: "Refresco",
        price: 3,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: [
        {
          lineId: lineA,
          productId: "prod-6c2r-two-lines",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
        {
          lineId: lineB,
          productId: "prod-6c2r-two-lines",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c2r-two-lines",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const sales = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .where("type", "==", "modifier_sale")
      .get();
    const saleB = sales.docs.find((doc) => doc.data().lineId === lineB);
    assert.ok(saleB);

    const cancelled = await handleCancelLines(authCtx("waiter"), {
      orderId: created.orderId,
      lineIds: [lineB],
    });
    assert.equal("orderId" in cancelled, true);

    const reversals = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .where("type", "==", "modifier_sale_reversal")
      .get();
    assert.equal(reversals.docs.length, 1);
    assert.equal(reversals.docs[0]?.data().reversalOfMovementId, saleB!.id);
    assert.equal(reversals.docs[0]?.data().lineId, lineB);
  });

  test("6C2R. producto inactivo aborta cancel-lines sin modificar orden ni stock", async () => {
    const invProductId = "inv-cola-6c2r-inactive";
    const groupId = "grp-mixer-6c2r-inactive";
    const optionId = "opt-cola-6c2r-inactive";
    const tableId = "mesa-6c2r-inactive";
    const lineId = "line-6c2r-inactive";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2R inactive",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 10 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Coca-Cola inventario",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c2r-inactive")
      .set({
        name: "Refresco",
        price: 3,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: [
        {
          lineId,
          productId: "prod-6c2r-inactive",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c2r-inactive",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set(
        {
          name: "Coca-Cola inventario",
          active: false,
          inventory: { enabled: true, unit: "ud", currentStock: 9 },
        },
        { merge: true },
      );

    const cancelled = await handleCancelLines(authCtx("waiter"), {
      orderId: created.orderId,
      lineIds: [lineId],
    });
    assert.equal("error" in cancelled, true);
    if (!("error" in cancelled)) return;
    assert.equal(cancelled.status, 409);
    assert.equal(cancelled.error, "MODIFIER_REVERSAL_PRODUCT_INACTIVE");

    const orderSnap = await adminDb.collection("orders").doc(created.orderId).get();
    const line = (orderSnap.data()?.items as Array<Record<string, unknown>> | undefined)?.find(
      (row) => row.id === lineId,
    );
    assert.equal(line?.status, "sent");

    const invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal(
      (invSnap.data()?.inventory as Record<string, unknown> | undefined)?.currentStock,
      9,
    );

    const reversals = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .where("type", "==", "modifier_sale_reversal")
      .get();
    assert.equal(reversals.docs.length, 0);
  });

  test("6C2R. cancel pending rechazado; tenant mismatch no toca stock", async () => {
    const invProductId = "inv-cola-6c2r-tenant";
    const groupId = "grp-mixer-6c2r-tenant";
    const optionId = "opt-cola-6c2r-tenant";
    const tablePending = "mesa-6c2r-pending";
    const tableSent = "mesa-6c2r-tenant";
    await adminDb.collection("tables").doc(tablePending).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2R pending",
    });
    await adminDb.collection("tables").doc(tableSent).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2R tenant",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 10 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Coca-Cola inventario",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c2r-tenant")
      .set({
        name: "Ballantines",
        price: 12,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const pending = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: tablePending,
      lines: [
        {
          lineId: "line-6c2r-pending",
          productId: "prod-6c2r-tenant",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: false,
      idempotencyKey: "create-6c2r-pending",
    });
    assert.equal("orderId" in pending, true);
    if (!("orderId" in pending)) return;

    const cancelPending = await handleCancelLines(authCtx("waiter"), {
      orderId: pending.orderId,
      lineIds: ["line-6c2r-pending"],
    });
    assert.equal("error" in cancelPending, true);
    if ("error" in cancelPending) {
      assert.equal(cancelPending.error, "LINE_NOT_CANCELABLE");
    }
    const pendingMovements = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", pending.orderId)
      .get();
    assert.equal(pendingMovements.size, 0);

    const sent = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: tableSent,
      lines: [
        {
          lineId: "line-6c2r-tenant-sent",
          productId: "prod-6c2r-tenant",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c2r-tenant-sent",
    });
    assert.equal("orderId" in sent, true);
    if (!("orderId" in sent)) return;

    const foreignCtx = { ...authCtx("waiter"), restaurantId: RESTAURANT_B };
    const foreignCancel = await handleCancelLines(foreignCtx, {
      orderId: sent.orderId,
      lineIds: ["line-6c2r-tenant-sent"],
    });
    assert.equal("error" in foreignCancel, true);
    if ("error" in foreignCancel) {
      assert.equal(foreignCancel.error, "TENANT_MISMATCH");
    }

    const invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal((invSnap.data()?.inventory as Record<string, unknown>)?.currentStock, 9);
  });

  test("6C2.2-21. currentStock inválido envía order, warning, sin modifier_sale ni cambio de stock", async () => {
    const invProductId = "inv-bad-stock-6c22";
    const groupId = "grp-bad-stock-6c22";
    const optionId = "opt-bad-stock";
    const tableId = "mesa-bad-stock-6c22";
    const idempotencyKey = "create-6c22-bad-stock";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa bad stock",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Inventario stock inválido",
        active: true,
        inventory: { enabled: true, unit: "unit" },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer bad stock",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Inventario stock inválido",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-bad-stock-6c22")
      .set({
        name: "Whisky",
        price: 12,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: [
        {
          lineId: "line-bad-stock",
          productId: "prod-bad-stock-6c22",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey,
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    assert.equal(created.inventoryWarnings.length, 1);
    assert.equal(created.inventoryWarnings[0]?.reason, "INVALID_CURRENT_STOCK");

    const orderSnap = await adminDb.collection("orders").doc(created.orderId).get();
    assert.equal(orderSnap.data()?.status, "sent");

    const orderItemsSnap = await adminDb
      .collection("orderItems")
      .where("restaurantId", "==", RESTAURANT_A)
      .where("orderId", "==", created.orderId)
      .get();
    assert.equal(orderItemsSnap.empty, false);

    const movementsSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .get();
    assert.equal(movementsSnap.size, 0);

    const invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal(
      (invSnap.data()?.inventory as Record<string, unknown> | undefined)?.currentStock,
      undefined,
    );

    const idemSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("tpvIdempotency")
      .doc(idempotencyKey)
      .get();
    const warnings = (idemSnap.data()?.result as Record<string, unknown> | undefined)
      ?.inventoryWarnings as Array<Record<string, unknown>> | undefined;
    assert.equal(warnings?.[0]?.reason, "INVALID_CURRENT_STOCK");
  });

  test("6C2.2-22. unidad inválida envía order, warning, sin modifier_sale ni cambio de stock", async () => {
    const invProductId = "inv-bad-unit-6c22";
    const groupId = "grp-bad-unit-6c22";
    const optionId = "opt-bad-unit";
    const tableId = "mesa-bad-unit-6c22";
    const idempotencyKey = "create-6c22-bad-unit";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa bad unit",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Inventario unidad inválida",
        active: true,
        inventory: { enabled: true, currentStock: 5, unit: "parsec" },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer bad unit",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Inventario unidad inválida",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-bad-unit-6c22")
      .set({
        name: "Gin",
        price: 11,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: [
        {
          lineId: "line-bad-unit",
          productId: "prod-bad-unit-6c22",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey,
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    assert.equal(created.inventoryWarnings.length, 1);
    assert.equal(created.inventoryWarnings[0]?.reason, "UNKNOWN_PRODUCT_UNIT");

    const orderSnap = await adminDb.collection("orders").doc(created.orderId).get();
    assert.equal(orderSnap.data()?.status, "sent");

    const orderItemsSnap = await adminDb
      .collection("orderItems")
      .where("restaurantId", "==", RESTAURANT_A)
      .where("orderId", "==", created.orderId)
      .get();
    assert.equal(orderItemsSnap.empty, false);

    const movementsSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .get();
    assert.equal(movementsSnap.size, 0);

    const invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal(
      (invSnap.data()?.inventory as Record<string, unknown> | undefined)?.currentStock,
      5,
    );

    const idemSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("tpvIdempotency")
      .doc(idempotencyKey)
      .get();
    const warnings = (idemSnap.data()?.result as Record<string, unknown> | undefined)
      ?.inventoryWarnings as Array<Record<string, unknown>> | undefined;
    assert.equal(warnings?.[0]?.reason, "UNKNOWN_PRODUCT_UNIT");
  });

  test("6C2.2-23. currentStock 0 con unidad válida aplica movimiento y permite stock negativo", async () => {
    const invProductId = "inv-zero-stock-6c22";
    const groupId = "grp-zero-stock-6c22";
    const optionId = "opt-zero-stock";
    const tableId = "mesa-zero-stock-6c22";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa zero stock",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Inventario zero",
        active: true,
        inventory: { enabled: true, unit: "unit", currentStock: 0 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer zero",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Inventario zero",
            inventoryQuantity: 2,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-zero-stock-6c22")
      .set({
        name: "Ron",
        price: 9,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines: [
        {
          lineId: "line-zero-stock",
          productId: "prod-zero-stock-6c22",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c22-zero-stock",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const movementsSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .where("orderId", "==", created.orderId)
      .get();
    assert.equal(movementsSnap.size, 1);
    const movement = movementsSnap.docs[0]?.data();
    assert.equal(movement?.stockBefore, 0);
    assert.equal(movement?.stockAfter, -2);

    const invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .get();
    assert.equal(
      (invSnap.data()?.inventory as Record<string, unknown> | undefined)?.currentStock,
      -2,
    );
  });

  test("6C2.3-1. create-open retry rehydrates inventoryWarnings without recalc or new movements", async () => {
    const fixture = {
      tableId: "mesa-6c23-create",
      invProductId: "inv-6c23-create",
      groupId: "grp-6c23-create",
      optionId: "opt-6c23-create",
      productId: "prod-6c23-create",
      lineId: "line-6c23-create",
    };
    const idempotencyKey = "create-6c23-invalid-stock";
    await seedInvalidCurrentStockModifierFixture(fixture);
    const intent = {
      tableId: fixture.tableId,
      lines: [
        {
          lineId: fixture.lineId,
          productId: fixture.productId,
          quantity: 1,
          selectedModifiers: [{ groupId: fixture.groupId, optionId: fixture.optionId }],
        },
      ],
      markSent: true,
      idempotencyKey,
    };
    const first = await handleCreateOpenOrder(authCtx("waiter"), intent);
    assert.equal("orderId" in first, true);
    if (!("orderId" in first)) return;
    assert.equal(first.inventoryWarnings.length, 1);
    assert.equal(first.inventoryWarnings[0]?.reason, "INVALID_CURRENT_STOCK");
    assert.equal(await countStockMovementsForOrder(first.orderId), 0);

    const second = await handleCreateOpenOrder(authCtx("waiter"), intent);
    assert.equal("orderId" in second, true);
    if (!("orderId" in second)) return;
    assert.equal(second.orderId, first.orderId);
    assert.deepEqual(second.inventoryWarnings, first.inventoryWarnings);
    assert.equal(await countStockMovementsForOrder(first.orderId), 0);
  });

  test("6C2.3-2. upsert-sale-lines retry rehydrates inventoryWarnings without recalc", async () => {
    const fixture = {
      tableId: "mesa-6c23-upsert",
      invProductId: "inv-6c23-upsert",
      groupId: "grp-6c23-upsert",
      optionId: "opt-6c23-upsert",
      productId: "prod-6c23-upsert",
      lineId: "line-6c23-upsert",
    };
    const idempotencyKey = "upsert-6c23-invalid-stock";
    await seedInvalidCurrentStockModifierFixture(fixture);
    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: fixture.tableId,
      lines: [
        {
          lineId: fixture.lineId,
          productId: fixture.productId,
          quantity: 1,
          selectedModifiers: [{ groupId: fixture.groupId, optionId: fixture.optionId }],
        },
      ],
      markSent: false,
      idempotencyKey: "create-pending-6c23-upsert",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const upsertIntent = {
      orderId: created.orderId,
      lines: [
        {
          lineId: fixture.lineId,
          productId: fixture.productId,
          quantity: 1,
          selectedModifiers: [{ groupId: fixture.groupId, optionId: fixture.optionId }],
        },
      ],
      markSent: true,
      idempotencyKey,
    };
    const first = await handleUpsertSaleLines(authCtx("waiter"), upsertIntent);
    assert.equal("orderId" in first, true);
    if (!("orderId" in first)) return;
    assert.equal(first.inventoryWarnings.length, 1);
    assert.equal(first.inventoryWarnings[0]?.reason, "INVALID_CURRENT_STOCK");
    assert.equal(await countStockMovementsForOrder(first.orderId), 0);

    const second = await handleUpsertSaleLines(authCtx("waiter"), upsertIntent);
    assert.equal("orderId" in second, true);
    if (!("orderId" in second)) return;
    assert.deepEqual(second.inventoryWarnings, first.inventoryWarnings);
    assert.equal(await countStockMovementsForOrder(first.orderId), 0);
  });

  test("6C2.3-3. transition-line-status retry rehydrates inventoryWarnings without recalc", async () => {
    const fixture = {
      tableId: "mesa-6c23-status",
      invProductId: "inv-6c23-status",
      groupId: "grp-6c23-status",
      optionId: "opt-6c23-status",
      productId: "prod-6c23-status",
      lineId: "line-6c23-status",
    };
    const idempotencyKey = "status-6c23-invalid-stock";
    await seedInvalidCurrentStockModifierFixture(fixture);
    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: fixture.tableId,
      lines: [
        {
          lineId: fixture.lineId,
          productId: fixture.productId,
          quantity: 1,
          selectedModifiers: [{ groupId: fixture.groupId, optionId: fixture.optionId }],
        },
      ],
      markSent: false,
      idempotencyKey: "create-pending-6c23-status",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const intent = {
      orderId: created.orderId,
      lineId: fixture.lineId,
      expectedStatus: "pending",
      nextStatus: "sent",
      idempotencyKey,
    };
    const first = await handleTransitionLineStatus(authCtx("kitchen"), intent);
    assert.equal("orderId" in first, true);
    if (!("orderId" in first)) return;
    assert.equal(first.inventoryWarnings.length, 1);
    assert.equal(first.inventoryWarnings[0]?.reason, "INVALID_CURRENT_STOCK");
    assert.equal(await countStockMovementsForOrder(first.orderId), 0);

    const second = await handleTransitionLineStatus(authCtx("kitchen"), intent);
    assert.equal("orderId" in second, true);
    if (!("orderId" in second)) return;
    assert.deepEqual(second.inventoryWarnings, first.inventoryWarnings);
    assert.equal(await countStockMovementsForOrder(first.orderId), 0);
  });

  test("6C2.3-4. transition-line-quantity retry rehydrates inventoryWarnings without recalc", async () => {
    const fixture = {
      tableId: "mesa-6c23-qty",
      invProductId: "inv-6c23-qty",
      groupId: "grp-6c23-qty",
      optionId: "opt-6c23-qty",
      productId: "prod-6c23-qty",
      lineId: "line-6c23-qty",
    };
    const idempotencyKey = "qty-6c23-invalid-stock";
    await seedInvalidCurrentStockModifierFixture(fixture);
    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: fixture.tableId,
      lines: [
        {
          lineId: fixture.lineId,
          productId: fixture.productId,
          quantity: 3,
          selectedModifiers: [{ groupId: fixture.groupId, optionId: fixture.optionId }],
        },
      ],
      markSent: false,
      idempotencyKey: "create-pending-6c23-qty",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const intent = {
      orderId: created.orderId,
      lineId: fixture.lineId,
      units: 1,
      expectedStatus: "pending",
      nextStatus: "sent",
      idempotencyKey,
    };
    const first = await handleTransitionLineQuantity(authCtx("kitchen"), intent);
    assert.equal("advancedLineId" in first, true);
    if (!("advancedLineId" in first)) return;
    assert.equal(first.inventoryWarnings.length, 1);
    assert.equal(first.inventoryWarnings[0]?.reason, "INVALID_CURRENT_STOCK");
    assert.equal(await countStockMovementsForOrder(first.orderId), 0);

    const second = await handleTransitionLineQuantity(authCtx("kitchen"), intent);
    assert.equal("advancedLineId" in second, true);
    if (!("advancedLineId" in second)) return;
    assert.equal(second.advancedLineId, first.advancedLineId);
    assert.deepEqual(second.inventoryWarnings, first.inventoryWarnings);
    assert.equal(await countStockMovementsForOrder(first.orderId), 0);
  });

  test("6C2.3-5. catalog fix between retries keeps original inventoryWarnings snapshot", async () => {
    const fixture = {
      tableId: "mesa-6c23-catalog",
      invProductId: "inv-6c23-catalog",
      groupId: "grp-6c23-catalog",
      optionId: "opt-6c23-catalog",
      productId: "prod-6c23-catalog",
      lineId: "line-6c23-catalog",
    };
    const idempotencyKey = "create-6c23-catalog-fix";
    await seedInvalidCurrentStockModifierFixture(fixture);
    const intent = {
      tableId: fixture.tableId,
      lines: [
        {
          lineId: fixture.lineId,
          productId: fixture.productId,
          quantity: 1,
          selectedModifiers: [{ groupId: fixture.groupId, optionId: fixture.optionId }],
        },
      ],
      markSent: true,
      idempotencyKey,
    };
    const first = await handleCreateOpenOrder(authCtx("waiter"), intent);
    assert.equal("orderId" in first, true);
    if (!("orderId" in first)) return;
    assert.equal(first.inventoryWarnings[0]?.reason, "INVALID_CURRENT_STOCK");

    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(fixture.invProductId)
      .set(
        {
          name: "Inventario stock inválido",
          active: true,
          inventory: { enabled: true, unit: "unit", currentStock: 99 },
        },
        { merge: true },
      );

    const second = await handleCreateOpenOrder(authCtx("waiter"), intent);
    assert.equal("orderId" in second, true);
    if (!("orderId" in second)) return;
    assert.deepEqual(second.inventoryWarnings, first.inventoryWarnings);
    assert.equal(await countStockMovementsForOrder(first.orderId), 0);
    const invSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(fixture.invProductId)
      .get();
    assert.equal(
      (invSnap.data()?.inventory as Record<string, unknown> | undefined)?.currentStock,
      99,
    );
  });

  test("6C2.3-6. valid stock retry returns empty inventoryWarnings arrays", async () => {
    const invProductId = "inv-6c23-empty";
    const groupId = "grp-6c23-empty";
    const optionId = "opt-6c23-empty";
    const tableId = "mesa-6c23-empty";
    const idempotencyKey = "create-6c23-empty-warnings";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa empty warnings",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId)
      .set({
        name: "Inventario ok",
        active: true,
        inventory: { enabled: true, unit: "unit", currentStock: 10 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId)
      .set({
        name: "Mixer ok",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId,
            inventoryProductName: "Inventario ok",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c23-empty")
      .set({
        name: "Gin",
        price: 11,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupId],
      });
    const intent = {
      tableId,
      lines: [
        {
          lineId: "line-6c23-empty",
          productId: "prod-6c23-empty",
          quantity: 1,
          selectedModifiers: [{ groupId, optionId }],
        },
      ],
      markSent: true,
      idempotencyKey,
    };
    const first = await handleCreateOpenOrder(authCtx("waiter"), intent);
    assert.equal("orderId" in first, true);
    if (!("orderId" in first)) return;
    assert.deepEqual(first.inventoryWarnings, []);

    const second = await handleCreateOpenOrder(authCtx("waiter"), intent);
    assert.equal("orderId" in second, true);
    if (!("orderId" in second)) return;
    assert.deepEqual(second.inventoryWarnings, []);
    assert.equal(await countStockMovementsForOrder(first.orderId), 1);
  });

  test("6C2.3-7. multiple inventoryWarnings keep deterministic order on retry", async () => {
    const tableId = "mesa-6c23-multi";
    const lineId = "line-6c23-multi";
    const groupA = "grp-6c23-multi-a";
    const groupB = "grp-6c23-multi-b";
    const optionA = "opt-6c23-multi-a";
    const optionB = "opt-6c23-multi-b";
    const invBadStock = "inv-6c23-multi-stock";
    const invBadUnit = "inv-6c23-multi-unit";
    const idempotencyKey = "create-6c23-multi-warnings";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa multi warnings",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invBadStock)
      .set({
        name: "Inv bad stock",
        active: true,
        inventory: { enabled: true, unit: "unit" },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invBadUnit)
      .set({
        name: "Inv bad unit",
        active: true,
        inventory: { enabled: true, currentStock: 4, unit: "parsec" },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupA)
      .set({
        name: "Mixer A",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionA,
            name: "A",
            priceDelta: 0,
            active: true,
            inventoryProductId: invBadStock,
            inventoryProductName: "Inv bad stock",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupB)
      .set({
        name: "Mixer B",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionB,
            name: "B",
            priceDelta: 0,
            active: true,
            inventoryProductId: invBadUnit,
            inventoryProductName: "Inv bad unit",
            inventoryQuantity: 1,
            inventoryUnit: "unit",
          },
        ],
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c23-multi")
      .set({
        name: "Combo",
        price: 15,
        active: true,
        visibleOnMenu: true,
        modifierGroupIds: [groupA, groupB],
      });
    const intent = {
      tableId,
      lines: [
        {
          lineId,
          productId: "prod-6c23-multi",
          quantity: 1,
          selectedModifiers: [
            { groupId: groupB, optionId: optionB },
            { groupId: groupA, optionId: optionA },
          ],
        },
      ],
      markSent: true,
      idempotencyKey,
    };
    const first = await handleCreateOpenOrder(authCtx("waiter"), intent);
    assert.equal("orderId" in first, true);
    if (!("orderId" in first)) return;
    assert.equal(first.inventoryWarnings.length, 2);
    assert.equal(first.inventoryWarnings[0]?.reason, "INVALID_CURRENT_STOCK");
    assert.equal(first.inventoryWarnings[1]?.reason, "UNKNOWN_PRODUCT_UNIT");

    const second = await handleCreateOpenOrder(authCtx("waiter"), intent);
    assert.equal("orderId" in second, true);
    if (!("orderId" in second)) return;
    assert.deepEqual(second.inventoryWarnings, first.inventoryWarnings);
    assert.equal(second.inventoryWarnings.length, 2);
  });

  test("6C2.3-8. same idempotencyKey with different payload returns conflict", async () => {
    const tableA = "mesa-6c23-conflict-a";
    const tableB = "mesa-6c23-conflict-b";
    const idempotencyKey = "create-6c23-conflict";
    await adminDb.collection("tables").doc(tableA).set({ restaurantId: RESTAURANT_A, name: "A" });
    await adminDb.collection("tables").doc(tableB).set({ restaurantId: RESTAURANT_A, name: "B" });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c23-conflict")
      .set({ name: "Agua", price: 2, active: true, visibleOnMenu: true });

    const first = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: tableA,
      lines: [{ lineId: "line-conflict", productId: "prod-6c23-conflict", quantity: 1 }],
      idempotencyKey,
    });
    assert.equal("orderId" in first, true);

    const conflict = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: tableB,
      lines: [{ lineId: "line-conflict", productId: "prod-6c23-conflict", quantity: 1 }],
      idempotencyKey,
    });
    assert.equal("error" in conflict, true);
    if ("error" in conflict) assert.equal(conflict.error, "IDEMPOTENCY_CONFLICT");
  });

  test("6C2.3-9. legacy idempotency result without inventoryWarnings rehydrates as empty array", async () => {
    const tableId = "mesa-6c23-legacy";
    const orderId = "order-6c23-legacy";
    const idempotencyKey = "create-6c23-legacy";
    await adminDb.collection("tables").doc(tableId).set({
      restaurantId: RESTAURANT_A,
      name: "Mesa legacy",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-6c23-legacy")
      .set({ name: "Agua", price: 2, active: true, visibleOnMenu: true });
    await adminDb.collection("orders").doc(orderId).set({
      restaurantId: RESTAURANT_A,
      tableId,
      status: "open",
      items: [{ id: "line-legacy", status: "pending", quantity: 1, productId: "prod-6c23-legacy", price: 2, total: 2 }],
      total: 2,
    });
    const lines = [{ lineId: "line-legacy", productId: "prod-6c23-legacy", quantity: 1 }];
    const payloadHash = stablePayloadHash({ tableId, lines, markSent: false });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("tpvIdempotency")
      .doc(idempotencyKey)
      .set({
        kind: "create_open_order",
        payloadHash,
        result: { orderId, total: 2 },
        createdAt: FieldValue.serverTimestamp(),
      });

    const rehydrated = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId,
      lines,
      idempotencyKey,
    });
    assert.equal("orderId" in rehydrated, true);
    if (!("orderId" in rehydrated)) return;
    assert.equal(rehydrated.orderId, orderId);
    assert.deepEqual(rehydrated.inventoryWarnings, []);
    assert.deepEqual(
      readInventoryWarningsFromIdempotencyResult({ orderId, total: 2 }),
      [],
    );
  });

  test("upsert preserves omitted pending lines", async () => {
    await adminDb.collection("orders").doc("order-upsert").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "open",
      items: [
        { id: "line-keep", status: "pending", quantity: 1, productId: "prod-1", price: 5, total: 5 },
        { id: "line-update", status: "pending", quantity: 1, productId: "prod-1", price: 5, total: 5 },
      ],
      total: 10,
    });
    const result = await handleUpsertSaleLines(authCtx("waiter"), {
      orderId: "order-upsert",
      lines: [{ lineId: "line-update", productId: "prod-1", quantity: 2 }],
    });
    assert.equal("items" in result, true);
    if ("items" in result) {
      assert.equal(result.items.length, 2);
    }
  });

  test("close rejects unpaid open order", async () => {
    await adminDb.collection("orders").doc("order-unpaid-close").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "open",
      items: [{ id: "l1", status: "sent", quantity: 1, price: 12, total: 12 }],
      total: 12,
    });
    const denied = await handleCloseOrder(authCtx("waiter"), { orderId: "order-unpaid-close" });
    assert.equal("error" in denied, true);
    if ("error" in denied) assert.equal(denied.error, "UNPAID_BALANCE");
  });

  test("reopen rejects paid order without refund", async () => {
    await adminDb.collection("orders").doc("order-paid-reopen").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "paid",
      items: [{ id: "l1", status: "sent", quantity: 1, price: 10, total: 10 }],
      total: 10,
    });
    const denied = await handleReopenOrder(authCtx("manager"), { orderId: "order-paid-reopen" });
    assert.equal("error" in denied, true);
    if ("error" in denied) assert.equal(denied.error, "REOPEN_REQUIRES_REFUND");
  });

  test("finalize table rejects unpaid balance", async () => {
    await adminDb.collection("tables").doc("mesa-fin").set({ restaurantId: RESTAURANT_A, status: "occupied" });
    await adminDb.collection("orders").doc("order-fin").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-fin",
      status: "sent",
      items: [{ id: "l1", status: "sent", quantity: 1, price: 8, total: 8 }],
      total: 8,
    });
    const denied = await handleFinalizeTableAfterPayment(authCtx("waiter"), { tableId: "mesa-fin" });
    assert.equal("error" in denied, true);
    if ("error" in denied) assert.equal(denied.error, "TABLE_HAS_UNPAID_ORDERS");
  });

  test("split_equal uses original final total not remaining", () => {
    const part1 = computeSplitEqualAmount(10, 1, 3, []);
    const part2 = computeSplitEqualAmount(10, 2, 3, [
      { status: "paid", type: "split_equal", part: 1, totalParts: 3, amount: 3.33 },
    ]);
    assert.equal(part1, 3.33);
    assert.equal(part2, 3.33);
    const part3 = computeSplitEqualAmount(10, 3, 3, [
      { status: "paid", type: "split_equal", part: 1, totalParts: 3, amount: 3.33 },
      { status: "paid", type: "split_equal", part: 2, totalParts: 3, amount: 3.33 },
    ]);
    assert.equal(part3, 3.34);
  });

  test("undefined serializes distinctly from literal string", () => {
    assert.notEqual(canonicalSerialize(undefined), canonicalSerialize("__undefined__"));
  });

  test("comp line not found returns 404", async () => {
    await adminDb.collection("orders").doc("order-comp-miss").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "open",
      items: [{ id: "exists", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const denied = await handleCompLine(authCtx("manager"), {
      orderId: "order-comp-miss",
      lineId: "missing",
      comped: true,
    });
    assert.equal("error" in denied, true);
    if ("error" in denied) assert.equal(denied.error, "LINE_NOT_FOUND");
  });

  test("create-open with operatorAssignment sets assignedAt via Admin SDK", async () => {
    await adminDb.collection("tables").doc("mesa-op-create").set({
      restaurantId: RESTAURANT_A,
      name: "Op create",
    });
    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: "mesa-op-create",
      lines: [{ lineId: "op-line-1", productId: "prod-1", quantity: 1 }],
      operatorAssignment: {
        assignedOperatorId: "op-create-1",
        assignedOperatorName: "Operador Create",
      },
      idempotencyKey: "create-op-assign-1",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const order = (await adminDb.collection("orders").doc(created.orderId).get()).data();
    assert.equal(order?.assignedOperatorId, "op-create-1");
    assert.equal(order?.assignedOperatorName, "Operador Create");
    assert.ok(order?.assignedAt != null);
    assert.equal(typeof (order?.assignedAt as { toDate?: () => Date }).toDate, "function");
  });

  test("assign-table-operator with omitted orderId assigns table only when no active orders", async () => {
    await adminDb.collection("tables").doc("mesa-op-zero").set({
      restaurantId: RESTAURANT_A,
      name: "Zero active",
    });
    await adminDb.collection("orders").doc("order-op-paid").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-zero",
      status: "paid",
      items: [{ id: "l1", status: "sent", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const result = await handleAssignTableOperator(authCtx("waiter"), {
      tableId: "mesa-op-zero",
      assignedOperatorId: "op-zero",
      assignedOperatorName: "Op Zero",
    });
    assert.equal("assigned" in result, true);
    if (!("assigned" in result)) return;
    assert.equal(result.assigned, true);
    assert.equal(result.orderId, undefined);
    const table = (await adminDb.collection("tables").doc("mesa-op-zero").get()).data();
    assert.equal(table?.assignedOperatorId, "op-zero");
    const paidOrder = (await adminDb.collection("orders").doc("order-op-paid").get()).data();
    assert.equal(paidOrder?.assignedOperatorId, undefined);
  });

  test("assign-table-operator with omitted orderId assigns table and single active order", async () => {
    await adminDb.collection("tables").doc("mesa-op-one").set({
      restaurantId: RESTAURANT_A,
      name: "One active",
    });
    await adminDb.collection("orders").doc("order-op-one").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-one",
      status: "open",
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const result = await handleAssignTableOperator(authCtx("waiter"), {
      tableId: "mesa-op-one",
      assignedOperatorId: "op-one",
      assignedOperatorName: "Op One",
    });
    assert.equal("assigned" in result, true);
    if (!("assigned" in result)) return;
    assert.equal(result.assigned, true);
    assert.equal(result.orderId, "order-op-one");
    const table = (await adminDb.collection("tables").doc("mesa-op-one").get()).data();
    const order = (await adminDb.collection("orders").doc("order-op-one").get()).data();
    assert.equal(table?.assignedOperatorId, "op-one");
    assert.equal(order?.assignedOperatorId, "op-one");
  });

  test("assign-table-operator with omitted orderId rejects multiple active orders", async () => {
    await adminDb.collection("tables").doc("mesa-op-multi").set({
      restaurantId: RESTAURANT_A,
      name: "Multi active",
    });
    await adminDb.collection("orders").doc("order-op-multi-a").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-multi",
      status: "open",
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    await adminDb.collection("orders").doc("order-op-multi-b").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-multi",
      status: "sent",
      items: [{ id: "l2", status: "sent", quantity: 1, price: 3, total: 3 }],
      total: 3,
    });
    const denied = await handleAssignTableOperator(authCtx("waiter"), {
      tableId: "mesa-op-multi",
      assignedOperatorId: "op-multi",
      assignedOperatorName: "Op Multi",
    });
    assert.equal("error" in denied, true);
    if ("error" in denied) assert.equal(denied.error, "MULTIPLE_ACTIVE_ORDERS");
    const table = (await adminDb.collection("tables").doc("mesa-op-multi").get()).data();
    assert.equal(table?.assignedOperatorId, undefined);
  });

  test("assign-table-operator updates table and order atomically for explicit open order", async () => {
    await adminDb.collection("tables").doc("mesa-op-assign").set({
      restaurantId: RESTAURANT_A,
      name: "Op assign",
    });
    await adminDb.collection("orders").doc("order-op-assign").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-assign",
      status: "open",
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const result = await handleAssignTableOperator(authCtx("waiter"), {
      tableId: "mesa-op-assign",
      orderId: "order-op-assign",
      assignedOperatorId: "waiter-op-a",
      assignedOperatorName: "Waiter Op A",
    });
    assert.equal("assigned" in result, true);
    if (!("assigned" in result)) return;
    assert.equal(result.assigned, true);
    const table = (await adminDb.collection("tables").doc("mesa-op-assign").get()).data();
    const order = (await adminDb.collection("orders").doc("order-op-assign").get()).data();
    assert.equal(table?.assignedOperatorId, "waiter-op-a");
    assert.equal(order?.assignedOperatorId, "waiter-op-a");
    assert.ok(table?.assignedAt != null);
    assert.ok(order?.assignedAt != null);
  });

  test("assign-table-operator accepts explicit sent order", async () => {
    await adminDb.collection("tables").doc("mesa-op-sent").set({
      restaurantId: RESTAURANT_A,
      name: "Sent",
    });
    await adminDb.collection("orders").doc("order-op-sent").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-sent",
      status: "sent",
      items: [{ id: "l1", status: "sent", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const result = await handleAssignTableOperator(authCtx("waiter"), {
      tableId: "mesa-op-sent",
      orderId: "order-op-sent",
      assignedOperatorId: "op-sent",
      assignedOperatorName: "Op Sent",
    });
    assert.equal("assigned" in result, true);
    if (!("assigned" in result)) return;
    assert.equal(result.assigned, true);
    const order = (await adminDb.collection("orders").doc("order-op-sent").get()).data();
    assert.equal(order?.assignedOperatorId, "op-sent");
  });

  test("assign-table-operator rejects explicit terminal orders", async () => {
    const terminalStatuses = ["paid", "closed", "merged", "cancelled"] as const;
    for (const status of terminalStatuses) {
      const tableId = `mesa-op-${status}`;
      const orderId = `order-op-${status}`;
      await adminDb.collection("tables").doc(tableId).set({
        restaurantId: RESTAURANT_A,
        name: status,
      });
      await adminDb.collection("orders").doc(orderId).set({
        restaurantId: RESTAURANT_A,
        tableId,
        status,
        items: [{ id: "l1", status: "sent", quantity: 1, price: 5, total: 5 }],
        total: 5,
      });
      const denied = await handleAssignTableOperator(authCtx("waiter"), {
        tableId,
        orderId,
        assignedOperatorId: "op-terminal",
        assignedOperatorName: "Op Terminal",
      });
      assert.equal("error" in denied, true);
      if ("error" in denied) assert.equal(denied.error, "ORDER_NOT_ACTIVE");
      const order = (await adminDb.collection("orders").doc(orderId).get()).data();
      assert.equal(order?.assignedOperatorId, undefined);
    }
  });

  test("assign-table-operator completes table when order already assigned", async () => {
    await adminDb.collection("tables").doc("mesa-op-order-only").set({
      restaurantId: RESTAURANT_A,
      name: "Order only",
    });
    await adminDb.collection("orders").doc("order-op-order-only").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-order-only",
      status: "open",
      assignedOperatorId: "shared-op",
      assignedOperatorName: "Shared Op",
      assignedAt: Date.now(),
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const result = await handleAssignTableOperator(authCtx("waiter"), {
      tableId: "mesa-op-order-only",
      orderId: "order-op-order-only",
      assignedOperatorId: "shared-op",
      assignedOperatorName: "Shared Op",
    });
    assert.equal("assigned" in result, true);
    if (!("assigned" in result)) return;
    assert.equal(result.assigned, true);
    const table = (await adminDb.collection("tables").doc("mesa-op-order-only").get()).data();
    assert.equal(table?.assignedOperatorId, "shared-op");
  });

  test("assign-table-operator completes order when table already assigned", async () => {
    await adminDb.collection("tables").doc("mesa-op-table-only").set({
      restaurantId: RESTAURANT_A,
      assignedOperatorId: "shared-op",
      assignedOperatorName: "Shared Op",
      assignedAt: Date.now(),
    });
    await adminDb.collection("orders").doc("order-op-table-only").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-table-only",
      status: "open",
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const result = await handleAssignTableOperator(authCtx("waiter"), {
      tableId: "mesa-op-table-only",
      orderId: "order-op-table-only",
      assignedOperatorId: "shared-op",
      assignedOperatorName: "Shared Op",
    });
    assert.equal("assigned" in result, true);
    if (!("assigned" in result)) return;
    assert.equal(result.assigned, true);
    const order = (await adminDb.collection("orders").doc("order-op-table-only").get()).data();
    assert.equal(order?.assignedOperatorId, "shared-op");
  });

  test("assign-table-operator allows retry for same operator", async () => {
    await adminDb.collection("tables").doc("mesa-op-retry").set({
      restaurantId: RESTAURANT_A,
      assignedOperatorId: "same-op",
      assignedOperatorName: "Same Op",
      assignedAt: Date.now(),
    });
    await adminDb.collection("orders").doc("order-op-retry").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-retry",
      status: "open",
      assignedOperatorId: "same-op",
      assignedOperatorName: "Same Op",
      assignedAt: Date.now(),
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const result = await handleAssignTableOperator(authCtx("waiter"), {
      tableId: "mesa-op-retry",
      orderId: "order-op-retry",
      assignedOperatorId: "same-op",
      assignedOperatorName: "Same Op",
    });
    assert.equal("assigned" in result, true);
    if ("assigned" in result) assert.equal(result.assigned, false);
  });

  test("assign-table-operator rejects overwrite by another operator", async () => {
    await adminDb.collection("tables").doc("mesa-op-deny").set({
      restaurantId: RESTAURANT_A,
      assignedOperatorId: "op-locked",
      assignedOperatorName: "Locked",
      assignedAt: Date.now(),
    });
    await adminDb.collection("orders").doc("order-op-deny").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-deny",
      status: "open",
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const denied = await handleAssignTableOperator(authCtx("waiter"), {
      tableId: "mesa-op-deny",
      orderId: "order-op-deny",
      assignedOperatorId: "op-other",
      assignedOperatorName: "Other",
    });
    assert.equal("error" in denied, true);
    if ("error" in denied) assert.equal(denied.error, "OPERATOR_ALREADY_ASSIGNED");
  });

  test("assign-table-operator concurrent requests keep table and order coherent", async () => {
    await adminDb.collection("tables").doc("mesa-op-concurrent").set({
      restaurantId: RESTAURANT_A,
      name: "Concurrent",
    });
    await adminDb.collection("orders").doc("order-op-concurrent").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-concurrent",
      status: "open",
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const ctx = authCtx("waiter");
    const [first, second] = await Promise.all([
      handleAssignTableOperator(ctx, {
        tableId: "mesa-op-concurrent",
        orderId: "order-op-concurrent",
        assignedOperatorId: "op-a",
        assignedOperatorName: "Op A",
      }),
      handleAssignTableOperator(ctx, {
        tableId: "mesa-op-concurrent",
        orderId: "order-op-concurrent",
        assignedOperatorId: "op-b",
        assignedOperatorName: "Op B",
      }),
    ]);
    const outcomes = [first, second];
    const successes = outcomes.filter(
      (outcome): outcome is { assigned: boolean; tableId: string; orderId?: string } =>
        "assigned" in outcome && outcome.assigned === true,
    );
    const conflicts = outcomes.filter(
      (outcome): outcome is { status: number; error: string } =>
        "error" in outcome && outcome.error === "OPERATOR_ALREADY_ASSIGNED",
    );
    assert.equal(successes.length, 1);
    assert.equal(conflicts.length, 1);
    const table = (await adminDb.collection("tables").doc("mesa-op-concurrent").get()).data();
    const order = (await adminDb.collection("orders").doc("order-op-concurrent").get()).data();
    assert.equal(table?.assignedOperatorId, order?.assignedOperatorId);
    assert.ok(table?.assignedOperatorId === "op-a" || table?.assignedOperatorId === "op-b");
  });

  test("assign-table-operator rejects foreign tenant order", async () => {
    await adminDb.collection("tables").doc("mesa-op-tenant").set({
      restaurantId: RESTAURANT_A,
      name: "Tenant",
    });
    await adminDb.collection("orders").doc("order-op-tenant").set({
      restaurantId: "rest-b-foreign",
      tableId: "mesa-op-tenant",
      status: "open",
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const denied = await handleAssignTableOperator(authCtx("waiter"), {
      tableId: "mesa-op-tenant",
      orderId: "order-op-tenant",
      assignedOperatorId: "op-x",
      assignedOperatorName: "Op X",
    });
    assert.equal("error" in denied, true);
    if ("error" in denied) assert.equal(denied.error, "TENANT_MISMATCH");
  });

  test("assign-table-operator requires tpv.sell", async () => {
    await adminDb.collection("tables").doc("mesa-op-cap").set({
      restaurantId: RESTAURANT_A,
      name: "Cap",
    });
    const denied = await handleAssignTableOperator(authCtx("viewer"), {
      tableId: "mesa-op-cap",
      assignedOperatorId: "op-x",
      assignedOperatorName: "Op X",
    });
    assert.equal("error" in denied, true);
    if ("error" in denied) assert.equal(denied.error, "TPV_SELL_REQUIRED");
  });

  test("assign-table-operator rolls back without partial order write", async () => {
    await adminDb.collection("tables").doc("mesa-op-tx").set({
      restaurantId: RESTAURANT_A,
      assignedOperatorId: "op-a",
      assignedOperatorName: "Op A",
      assignedAt: Date.now(),
    });
    await adminDb.collection("orders").doc("order-op-tx").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-tx",
      status: "open",
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const denied = await handleAssignTableOperator(authCtx("waiter"), {
      tableId: "mesa-op-tx",
      orderId: "order-op-tx",
      assignedOperatorId: "op-b",
      assignedOperatorName: "Op B",
    });
    assert.equal("error" in denied, true);
    const order = (await adminDb.collection("orders").doc("order-op-tx").get()).data();
    assert.equal(order?.assignedOperatorId, undefined);
  });

  test("assignTableOperatorOnFirstOpen delegates to API without client write-once preflight", async () => {
    type ApiParams = {
      tableId: string;
      assignedOperatorId: string;
      assignedOperatorName: string;
      orderId?: string;
    };
    let apiCallCount = 0;
    let lastParams: ApiParams | null = null;

    setAssignTableOperatorViaApiForTests(async (params) => {
      apiCallCount += 1;
      lastParams = params;
      return { ok: true as const, assigned: true, tableId: params.tableId };
    });
    try {
      await adminDb.collection("tables").doc("mesa-client-preflight").set({
        restaurantId: RESTAURANT_A,
        assignedOperatorId: "locked-op",
        assignedOperatorName: "Locked Op",
        assignedAt: Date.now(),
      });

      const assigned = await assignTableOperatorOnFirstOpen({
        db: CLIENT_DB_STUB,
        restaurantId: RESTAURANT_A,
        tableId: "mesa-client-preflight",
        operator: { assignedOperatorId: "real-op", assignedOperatorName: "Real Op" },
        tableAssignmentHint: {
          assignedOperatorId: "stale-op",
          assignedOperatorName: "Stale Op",
        },
      });

      assert.equal(apiCallCount, 1);
      assert.ok(lastParams);
      const capturedParams = lastParams as ApiParams;
      assert.equal(capturedParams.tableId, "mesa-client-preflight");
      assert.equal(capturedParams.assignedOperatorId, "real-op");
      assert.equal(capturedParams.assignedOperatorName, "Real Op");
      assert.equal("orderId" in capturedParams, false);
      assert.equal(assigned, true);
    } finally {
      setAssignTableOperatorViaApiForTests(null);
    }
  });

  test("assignTableOperatorOnFirstOpen returns false on server-side conflict without client preflight", async () => {
    let apiCallCount = 0;
    setAssignTableOperatorViaApiForTests(async () => {
      apiCallCount += 1;
      return { ok: false as const, error: "OPERATOR_ALREADY_ASSIGNED" };
    });
    try {
      const assigned = await assignTableOperatorOnFirstOpen({
        db: CLIENT_DB_STUB,
        restaurantId: RESTAURANT_A,
        tableId: "mesa-client-conflict",
        operator: { assignedOperatorId: "real-op", assignedOperatorName: "Real Op" },
        tableAssignmentHint: {
          assignedOperatorId: "stale-op",
          assignedOperatorName: "Stale Op",
        },
      });
      assert.equal(apiCallCount, 1);
      assert.equal(assigned, false);
    } finally {
      setAssignTableOperatorViaApiForTests(null);
    }
  });

  test("assignTableOperatorOnFirstOpen returns false on stable server retry", async () => {
    setAssignTableOperatorViaApiForTests(async (params) => ({
      ok: true as const,
      assigned: false,
      tableId: params.tableId,
    }));
    try {
      const assigned = await assignTableOperatorOnFirstOpen({
        db: CLIENT_DB_STUB,
        restaurantId: RESTAURANT_A,
        tableId: "mesa-client-retry",
        operator: { assignedOperatorId: "same-op", assignedOperatorName: "Same Op" },
      });
      assert.equal(assigned, false);
    } finally {
      setAssignTableOperatorViaApiForTests(null);
    }
  });

  test("assignTableOperatorOnFirstOpen skips API on invalid params", async () => {
    let apiCallCount = 0;
    setAssignTableOperatorViaApiForTests(async () => {
      apiCallCount += 1;
      return { ok: true as const, assigned: true, tableId: "unused" };
    });
    try {
      const assigned = await assignTableOperatorOnFirstOpen({
        db: CLIENT_DB_STUB,
        restaurantId: RESTAURANT_A,
        tableId: "",
        operator: { assignedOperatorId: "op-a", assignedOperatorName: "Op A" },
      });
      assert.equal(apiCallCount, 0);
      assert.equal(assigned, false);
    } finally {
      setAssignTableOperatorViaApiForTests(null);
    }
  });

  test("assign-table-operator repairs table for stale hint scenario without orderId", async () => {
    await adminDb.collection("tables").doc("mesa-hint-repair-server").set({
      restaurantId: RESTAURANT_A,
      name: "Hint repair server",
    });
    await adminDb.collection("orders").doc("order-hint-repair-server").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-hint-repair-server",
      status: "open",
      assignedOperatorId: "shared-op",
      assignedOperatorName: "Shared Op",
      assignedAt: Date.now(),
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const result = await handleAssignTableOperator(authCtx("waiter"), {
      tableId: "mesa-hint-repair-server",
      assignedOperatorId: "shared-op",
      assignedOperatorName: "Shared Op",
    });
    assert.equal("assigned" in result, true);
    if (!("assigned" in result)) return;
    assert.equal(result.assigned, true);
    assert.equal(result.orderId, "order-hint-repair-server");
    const table = (await adminDb.collection("tables").doc("mesa-hint-repair-server").get()).data();
    const order = (await adminDb.collection("orders").doc("order-hint-repair-server").get()).data();
    assert.equal(table?.assignedOperatorId, "shared-op");
    assert.equal(order?.assignedOperatorId, "shared-op");
  });

  test("assign-table-operator concurrent same operator yields one write and one stable retry", async () => {
    await adminDb.collection("tables").doc("mesa-op-same-concurrent").set({
      restaurantId: RESTAURANT_A,
      name: "Same concurrent",
    });
    await adminDb.collection("orders").doc("order-op-same-concurrent").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-same-concurrent",
      status: "open",
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const ctx = authCtx("waiter");
    const [first, second] = await Promise.all([
      handleAssignTableOperator(ctx, {
        tableId: "mesa-op-same-concurrent",
        orderId: "order-op-same-concurrent",
        assignedOperatorId: "same-op",
        assignedOperatorName: "Same Op",
      }),
      handleAssignTableOperator(ctx, {
        tableId: "mesa-op-same-concurrent",
        orderId: "order-op-same-concurrent",
        assignedOperatorId: "same-op",
        assignedOperatorName: "Same Op",
      }),
    ]);
    const outcomes = [first, second];
    const writes = outcomes.filter(
      (outcome): outcome is { assigned: boolean; tableId: string; orderId?: string } =>
        "assigned" in outcome && outcome.assigned === true,
    );
    const retries = outcomes.filter(
      (outcome): outcome is { assigned: boolean; tableId: string; orderId?: string } =>
        "assigned" in outcome && outcome.assigned === false,
    );
    assert.equal(writes.length, 1);
    assert.equal(retries.length, 1);
    const table = (await adminDb.collection("tables").doc("mesa-op-same-concurrent").get()).data();
    const order = (await adminDb.collection("orders").doc("order-op-same-concurrent").get()).data();
    assert.equal(table?.assignedOperatorId, "same-op");
    assert.equal(order?.assignedOperatorId, "same-op");
  });

  test("assign-table-operator without orderId resolves deterministically under concurrency", async () => {
    await adminDb.collection("tables").doc("mesa-op-resolve-concurrent").set({
      restaurantId: RESTAURANT_A,
      name: "Resolve concurrent",
    });
    await adminDb.collection("orders").doc("order-op-resolve-concurrent").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-resolve-concurrent",
      status: "open",
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const ctx = authCtx("waiter");
    const [first, second] = await Promise.all([
      handleAssignTableOperator(ctx, {
        tableId: "mesa-op-resolve-concurrent",
        assignedOperatorId: "resolve-op",
        assignedOperatorName: "Resolve Op",
      }),
      handleAssignTableOperator(ctx, {
        tableId: "mesa-op-resolve-concurrent",
        assignedOperatorId: "resolve-op",
        assignedOperatorName: "Resolve Op",
      }),
    ]);
    const outcomes = [first, second];
    assert.ok(outcomes.every((outcome) => "assigned" in outcome));
    const resolvedOrderIds = outcomes
      .filter((outcome): outcome is { assigned: boolean; tableId: string; orderId?: string } => "assigned" in outcome)
      .map((outcome) => outcome.orderId);
    assert.deepEqual(resolvedOrderIds, ["order-op-resolve-concurrent", "order-op-resolve-concurrent"]);
    const writes = outcomes.filter(
      (outcome): outcome is { assigned: boolean; tableId: string; orderId?: string } =>
        "assigned" in outcome && outcome.assigned === true,
    );
    const retries = outcomes.filter(
      (outcome): outcome is { assigned: boolean; tableId: string; orderId?: string } =>
        "assigned" in outcome && outcome.assigned === false,
    );
    assert.equal(writes.length, 1);
    assert.equal(retries.length, 1);
    const table = (await adminDb.collection("tables").doc("mesa-op-resolve-concurrent").get()).data();
    const order = (await adminDb.collection("orders").doc("order-op-resolve-concurrent").get()).data();
    assert.equal(table?.assignedOperatorId, "resolve-op");
    assert.equal(order?.assignedOperatorId, "resolve-op");
  });

  test("sync-order-items create_open uses Admin assignedAt sentinel", async () => {
    await seedWaiterProfile();
    await adminDb.collection("tables").doc("mesa-sync-op").set({
      restaurantId: RESTAURANT_A,
      name: "Sync op",
    });
    const created = await handleSyncOrderItemsRequest(
      syncRequest({
        operation: "create_open",
        tableId: "mesa-sync-op",
        tableLabel: "Sync op",
        operatorAssignment: {
          assignedOperatorId: "sync-op-1",
          assignedOperatorName: "Sync Op",
        },
        items: [
          {
            id: "line-sync-1",
            productId: "prod-1",
            name: "Cafe",
            qty: 1,
            status: "pending",
            price: 2,
            total: 2,
          },
        ],
      }),
      syncDependencies(),
    );
    assert.equal(created.status, 200);
    const body = (await created.json()) as { ok?: boolean; orderId?: string };
    assert.equal(body.ok, true);
    assert.equal(typeof body.orderId, "string");
    const order = (await adminDb.collection("orders").doc(String(body.orderId)).get()).data();
    assert.equal(order?.assignedOperatorId, "sync-op-1");
    assert.ok(order?.assignedAt != null);
    assert.equal(typeof (order?.assignedAt as { toDate?: () => Date }).toDate, "function");
  });

  test("orders server-write-only: client denied, Admin mutates, reads tenant-scoped", async () => {
    const waiterUid = "waiter-rules-1b";
    const foreignUid = "owner-b-rules-1b";
    const foreignRestaurant = "rest-b-rules-1b";
    const profileA = {
      uid: waiterUid,
      email: "waiter-rules-1b@example.test",
      restaurantId: RESTAURANT_A,
      restaurantName: "Restaurante A",
      role: "waiter",
      status: "active",
    };
    const profileB = {
      uid: foreignUid,
      email: "owner-b-rules-1b@example.test",
      restaurantId: foreignRestaurant,
      restaurantName: "Restaurante B",
      role: "owner",
      status: "active",
    };
    await Promise.all([
      adminDb.collection("users").doc(waiterUid).set(profileA),
      adminDb.collection("usuarios").doc(waiterUid).set(profileA),
      adminDb.collection("users").doc(foreignUid).set(profileB),
      adminDb.collection("usuarios").doc(foreignUid).set(profileB),
    ]);
    await adminDb.collection("tables").doc("mesa-rules-1b").set({
      restaurantId: RESTAURANT_A,
      name: "Rules 1B",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-rules-1b")
      .set({ name: "Cafe", price: 2, active: true, tipoVenta: "carta" });

    const created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: "mesa-rules-1b",
      lines: [{ lineId: "line-rules-1b", productId: "prod-rules-1b", quantity: 1 }],
      idempotencyKey: "rules-1b-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;

    const waiterClientDb = testEnv
      .authenticatedContext(waiterUid, { email: profileA.email })
      .firestore();
    const foreignClientDb = testEnv
      .authenticatedContext(foreignUid, { email: profileB.email })
      .firestore();

    await assertFails(
      setDoc(doc(waiterClientDb, "orders", "client-create-deny"), {
        restaurantId: RESTAURANT_A,
        tableId: "mesa-rules-1b",
        status: "open",
      }),
    );
    await assertFails(
      updateDoc(doc(waiterClientDb, "orders", created.orderId), {
        note: "client-deny",
        updatedAt: Date.now(),
      }),
    );

    await assertSucceeds(getDoc(doc(waiterClientDb, "orders", created.orderId)));
    await assertFails(getDoc(doc(foreignClientDb, "orders", created.orderId)));

    const upserted = await handleUpsertSaleLines(authCtx("waiter"), {
      orderId: created.orderId,
      lines: [{ lineId: "line-rules-1b", productId: "prod-rules-1b", quantity: 2 }],
    });
    assert.equal("orderId" in upserted, true);
    if (!("orderId" in upserted)) return;
    const orderAfter = (await adminDb.collection("orders").doc(created.orderId).get()).data();
    const items = orderAfter?.items as Array<Record<string, unknown>> | undefined;
    assert.equal(items?.[0]?.quantity, 2);
    await assertSucceeds(getDoc(doc(waiterClientDb, "orders", created.orderId)));
  });
});
