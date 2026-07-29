import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, FieldValue, type Firestore as AdminFirestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import { handleCancelLines, handleCreateOpenOrder, handleTransitionLineQuantity, handleTransitionLineStatus, handleUpsertSaleLines } from "@/lib/server/tpv/handle-tpv-order-mutations";
import { stablePayloadHash, canonicalSerialize, readInventoryWarningsFromIdempotencyResult } from "@/lib/server/tpv/tpv-idempotency";
import { isAllowedKdsLineStatusTransition } from "@/lib/server/tpv/line-status-transitions";
import { computeOrderEconomics } from "@/lib/server/tpv/compute-order-economics";

const RESTAURANT_A = "rest-a-tpv";
const RESTAURANT_B = "rest-b-tpv-price";
const MANAGER_UID = "manager-tpv-a";

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

async function seedBasicTableAndProduct(tableId = "mesa-1", productId = "prod-1") {
  await adminDb.collection("tables").doc(tableId).set({
    restaurantId: RESTAURANT_A,
    name: tableId,
  });
  await adminDb
    .collection("restaurants")
    .doc(RESTAURANT_A)
    .collection("products")
    .doc(productId)
    .set({
      name: "Café",
      price: 2.5,
      active: true,
      tipoVenta: "carta",
    });
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
    await seedBasicTableAndProduct();
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
    await seedBasicTableAndProduct();
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

  test("undefined serializes distinctly from literal string", () => {
    assert.notEqual(canonicalSerialize(undefined), canonicalSerialize("__undefined__"));
  });

  test("create-open with operatorAssignment sets assignedAt via Admin SDK", async () => {
    await seedBasicTableAndProduct("mesa-op-create");
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
});
