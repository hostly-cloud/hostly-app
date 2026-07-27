import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import {
  handleCancelLines,
  handleCreateOpenOrder,
  handleAssignTableOperator,
  handleTransitionLineQuantity,
  handleTransitionLineStatus,
  handleUpsertSaleLines,
} from "@/lib/server/tpv/handle-tpv-order-mutations";
import { handleChargeOrder } from "@/lib/server/tpv/handle-tpv-payment-mutations";
import { handleMergeTableGroupOrders } from "@/lib/server/tpv/handle-merge-table-group-orders";
import {
  handleCompLine,
  handleRemoveLineUnit,
  handleCloseOrder,
  handleReopenOrder,
  handleFinalizeTableAfterPayment,
} from "@/lib/server/tpv/handle-tpv-order-lifecycle";
import {
  stablePayloadHash,
  canonicalSerialize,
  readInventoryWarningsFromIdempotencyResult,
} from "@/lib/server/tpv/tpv-idempotency";
import { computeSplitEqualAmount } from "@/lib/server/tpv/split-payment-amounts";
import { isAllowedKdsLineStatusTransition } from "@/lib/server/tpv/line-status-transitions";
import { computeOrderEconomics } from "@/lib/server/tpv/compute-order-economics";

const PROJECT_ID = "demo-hostly-tpv-mutations";
const ADMIN_APP_NAME = "tpv-cross-handler-a19-diagnostic";
const RESTAURANT_A = "rest-a-tpv";
const RESTAURANT_B = "rest-b-tpv-price";
const MANAGER_UID = "manager-tpv-a";

type PairSnapshot = {
  table: Record<string, unknown>;
  order: Record<string, unknown> | null;
  tableUpdateTimeMillis: number | null;
  orderUpdateTimeMillis: number | null;
};

type StepObservation = {
  index: number;
  name: string;
  handler?: string;
  result: unknown;
  documentsUnchanged?: boolean;
  mesa1Snapshot?: Record<string, unknown> | null;
};

function readFirestoreEmulatorAddress(): { host: string; port: number } {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST?.trim() ?? "";
  if (emulatorHost) {
    const emulatorUrl = new URL(`http://${emulatorHost}`);
    const port = Number(emulatorUrl.port);
    assert.ok(emulatorUrl.hostname);
    assert.ok(Number.isInteger(port) && port > 0);
    return { host: emulatorUrl.hostname, port };
  }
  return { host: "127.0.0.1", port: 8080 };
}

let adminDbSingleton: Firestore | null = null;

function adminDbRef(): Firestore {
  assert.ok(adminDbSingleton);
  return adminDbSingleton;
}

function authCtx(role = "manager"): AuthenticatedRestaurantContext {
  return {
    uid: MANAGER_UID,
    email: "manager@example.test",
    emailVerified: true,
    restaurantId: RESTAURANT_A,
    role,
    canManageUsers: true,
    db: adminDbRef(),
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

async function seedInvalidCurrentStockModifierFixture(
  adminDb: Firestore,
  fixture: InvalidStockModifierFixture,
) {
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

async function countStockMovementsForOrder(
  adminDb: Firestore,
  orderId: string,
): Promise<number> {
  const snap = await adminDb
    .collection("restaurants")
    .doc(RESTAURANT_A)
    .collection("stockMovements")
    .where("orderId", "==", orderId)
    .get();
  return snap.size;
}

function readUpdateTimeMillis(snapshot: DocumentSnapshot): number | null {
  const updateTime = snapshot.updateTime;
  if (!updateTime) return null;
  return updateTime.toMillis();
}

async function snapshotPair(
  tableRef: DocumentReference,
  orderRef: DocumentReference | null,
): Promise<PairSnapshot> {
  const tableSnapshot = await tableRef.get();
  assert.equal(tableSnapshot.exists, true);
  let order: Record<string, unknown> | null = null;
  let orderUpdateTimeMillis: number | null = null;
  if (orderRef) {
    const orderSnapshot = await orderRef.get();
    assert.equal(orderSnapshot.exists, true);
    order = orderSnapshot.data()!;
    orderUpdateTimeMillis = readUpdateTimeMillis(orderSnapshot);
  }
  return {
    table: tableSnapshot.data()!,
    order,
    tableUpdateTimeMillis: readUpdateTimeMillis(tableSnapshot),
    orderUpdateTimeMillis,
  };
}

function assertPairUnchanged(before: PairSnapshot, after: PairSnapshot): void {
  assert.deepEqual(after.table, before.table);
  if (before.order && after.order) {
    assert.deepEqual(after.order, before.order);
  }
  if (
    before.tableUpdateTimeMillis != null &&
    after.tableUpdateTimeMillis != null
  ) {
    assert.equal(after.tableUpdateTimeMillis, before.tableUpdateTimeMillis);
  }
  if (
    before.orderUpdateTimeMillis != null &&
    after.orderUpdateTimeMillis != null
  ) {
    assert.equal(after.orderUpdateTimeMillis, before.orderUpdateTimeMillis);
  }
}

function observePromise<T>(
  promise: Promise<T>,
  bucket: { status?: string; value?: unknown; reason?: unknown },
): void {
  void promise.then(
    (value) => {
      bucket.status = "fulfilled";
      bucket.value = value;
    },
    (reason) => {
      bucket.status = "rejected";
      bucket.reason = reason;
    },
  );
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { value: error };
}

async function readMesa1Snapshot(adminDb: Firestore): Promise<Record<string, unknown> | null> {
  const snap = await adminDb.collection("tables").doc("mesa-1").get();
  return snap.exists ? snap.data()! : null;
}

test("cross-handler prefix 1-37 then assign A1-A13 and A19 same-operator contention", async () => {
  const firestoreRules = readFileSync("firestore.rules", "utf8");
  const timeline: string[] = ["imports-evaluated"];
  const steps: StepObservation[] = [];
  let rulesTestEnvironment: RulesTestEnvironment | undefined;
  let orderedAdminApp: App | undefined;
  let rulesCleanupCompleted = false;
  let adminDeleteCompleted = false;
  let settingsAppliedBeforeUse = false;
  let diagnostic: Record<string, unknown> | null = null;
  let mesa1AfterTest1: Record<string, unknown> | null = null;

  const logDiagnostic = (partial: Record<string, unknown>) => {
    console.log(
      `TPV_CROSS_HANDLER_A19_DIAGNOSTIC ${JSON.stringify({
        ...partial,
        timeline,
        steps,
        rulesCleanupCompleted,
        adminDeleteCompleted,
        appsAfterDelete: getApps().length,
        mesa1AfterTest1,
      })}`,
    );
  };

  const recordStep = (
    index: number,
    name: string,
    result: unknown,
    extra?: Partial<Omit<StepObservation, "index" | "name" | "result">>,
  ) => {
    steps.push({ index, name, result, ...extra });
  };

  try {
    const { host, port } = readFirestoreEmulatorAddress();
    rulesTestEnvironment = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { host, port, rules: firestoreRules },
    });
    timeline.push("rules-environment-complete");
    assert.equal(getApps().length, 0);

    orderedAdminApp = initializeApp({ projectId: PROJECT_ID }, ADMIN_APP_NAME);
    const adminDb = getFirestore(orderedAdminApp);
    adminDb.settings({ ignoreUndefinedProperties: true });
    adminDbSingleton = adminDb;
    settingsAppliedBeforeUse = true;
    timeline.push("admin-created");
    timeline.push("admin-settings-applied");

    const ctx = authCtx("waiter");
    assert.equal(ctx.db, adminDb);

    // t1: create-open + charge
    timeline.push("t1-prepared");
    timeline.push("t1-start");
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
    const t1Created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: "mesa-1",
      lines: [{ lineId: "line-1", productId: "prod-1", quantity: 2 }],
      markSent: true,
      idempotencyKey: "create-1",
    });
    assert.equal("orderId" in t1Created, true);
    if ("orderId" in t1Created) {
      await adminDb.collection("orders").doc(t1Created.orderId).update({
        discountPercent: 10,
      });
      const t1Charged = await handleChargeOrder(authCtx("waiter"), {
        orderId: t1Created.orderId,
        paymentMethod: "cash",
        type: "table_amount",
        amount: 4.5,
        idempotencyKey: "charge-1",
      });
      assert.equal("paymentId" in t1Charged, true);
      if ("paymentId" in t1Charged) {
        assert.equal(t1Charged.amount, 4.5);
        const payment = (
          await adminDb.collection("payments").doc(t1Charged.paymentId).get()
        ).data();
        assert.equal(payment?.accountFinalTotal, 4.5);
        recordStep(1, "create-open + charge", { created: t1Created, charged: t1Charged }, {
          handler: "handleCreateOpenOrder,handleChargeOrder",
          mesa1Snapshot: await readMesa1Snapshot(adminDb),
        });
      }
    }
    mesa1AfterTest1 = await readMesa1Snapshot(adminDb);
    timeline.push("t1-complete");

    // t2: kitchen cannot transition
    timeline.push("t2-prepared");
    timeline.push("t2-start");
    assert.equal(isAllowedKdsLineStatusTransition("sent", "cancelled"), false);
    await adminDb.collection("orders").doc("order-kds").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "sent",
      items: [{ id: "line-1", status: "sent", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const t2Denied = await handleTransitionLineStatus(authCtx("kitchen"), {
      orderId: "order-kds",
      lineId: "line-1",
      expectedStatus: "sent",
      nextStatus: "cancelled",
    });
    assert.equal("error" in t2Denied, true);
    if ("error" in t2Denied) assert.equal(t2Denied.error, "KDS_CANNOT_CANCEL");
    recordStep(2, "kitchen cannot transition", t2Denied, {
      handler: "handleTransitionLineStatus",
    });
    timeline.push("t2-complete");

    // t3: waiter cancels
    timeline.push("t3-prepared");
    timeline.push("t3-start");
    await adminDb.collection("orders").doc("order-cancel").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "sent",
      items: [{ id: "line-1", status: "sent", quantity: 1, price: 8, total: 8 }],
      total: 8,
    });
    const t3Result = await handleCancelLines(authCtx("waiter"), {
      orderId: "order-cancel",
      lineIds: ["line-1"],
    });
    assert.equal("cancelledLineIds" in t3Result, true);
    const t3Order = (await adminDb.collection("orders").doc("order-cancel").get()).data();
    const t3Items = t3Order?.items as Array<Record<string, unknown>>;
    assert.equal(String(t3Items?.[0]?.status), "cancelled");
    recordStep(3, "waiter cancels", t3Result, { handler: "handleCancelLines" });
    timeline.push("t3-complete");

    // t4: computeOrderEconomics
    timeline.push("t4-prepared");
    timeline.push("t4-start");
    const t4Economics = computeOrderEconomics(
      { discountPercent: 10 },
      [{ id: "a", status: "sent", quantity: 1, price: 100, total: 100 }],
    );
    assert.equal(t4Economics.finalTotal, 90);
    recordStep(4, "computeOrderEconomics", t4Economics);
    timeline.push("t4-complete");

    // t5: idempotent create-open
    timeline.push("t5-prepared");
    timeline.push("t5-start");
    const t5Intent = {
      tableId: "mesa-1",
      lines: [{ lineId: "line-x", productId: "prod-1", quantity: 1 }],
      idempotencyKey: "idem-create-2",
    };
    const t5First = await handleCreateOpenOrder(authCtx(), t5Intent);
    const t5Second = await handleCreateOpenOrder(authCtx(), t5Intent);
    assert.equal("orderId" in t5First, true);
    assert.equal("orderId" in t5Second, true);
    if ("orderId" in t5First && "orderId" in t5Second) {
      assert.equal(t5First.orderId, t5Second.orderId);
    }
    recordStep(5, "idempotent create-open", { first: t5First, second: t5Second }, {
      handler: "handleCreateOpenOrder",
    });
    timeline.push("t5-complete");

    // t6: merge table group
    timeline.push("t6-prepared");
    timeline.push("t6-start");
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
    const t6Intent = {
      mainTableId: "mesa-a",
      memberTableIds: ["mesa-a", "mesa-b"],
      idempotencyKey: "merge-1",
    };
    const t6First = await handleMergeTableGroupOrders(authCtx(), t6Intent);
    const t6Second = await handleMergeTableGroupOrders(authCtx(), t6Intent);
    assert.equal("merged" in t6First, true);
    assert.equal("merged" in t6Second, true);
    if ("merged" in t6First && "merged" in t6Second) {
      assert.equal(t6First.merged, true);
      assert.equal(t6Second.destOrderId, t6First.destOrderId);
    }
    recordStep(6, "merge table group", { first: t6First, second: t6Second }, {
      handler: "handleMergeTableGroupOrders",
    });
    timeline.push("t6-complete");

    // t7: transition line quantity idempotent
    timeline.push("t7-prepared");
    timeline.push("t7-start");
    await adminDb.collection("orders").doc("order-split-qty").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "sent",
      items: [{ id: "line-1", status: "sent", quantity: 3, price: 10, total: 30 }],
      total: 30,
    });
    const t7Intent = {
      orderId: "order-split-qty",
      lineId: "line-1",
      units: 1,
      expectedStatus: "sent",
      nextStatus: "prepared",
      idempotencyKey: "split-qty-1",
    };
    const t7First = await handleTransitionLineQuantity(authCtx("kitchen"), t7Intent);
    const t7Second = await handleTransitionLineQuantity(authCtx("kitchen"), t7Intent);
    assert.equal("advancedLineId" in t7First, true);
    assert.equal("advancedLineId" in t7Second, true);
    if ("advancedLineId" in t7First && "advancedLineId" in t7Second) {
      assert.equal(t7First.advancedLineId, t7Second.advancedLineId);
    }
    recordStep(7, "transition line quantity", { first: t7First, second: t7Second }, {
      handler: "handleTransitionLineQuantity",
    });
    timeline.push("t7-complete");

    // t8: charge rejects tableId
    timeline.push("t8-prepared");
    timeline.push("t8-start");
    await adminDb.collection("orders").doc("order-table-mismatch").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "sent",
      items: [{ id: "line-1", status: "sent", quantity: 1, price: 10, total: 10 }],
      total: 10,
    });
    const t8Denied = await handleChargeOrder(authCtx("waiter"), {
      orderId: "order-table-mismatch",
      tableId: "mesa-2",
      paymentMethod: "cash",
      type: "table_amount",
      amount: 10,
    });
    assert.equal("error" in t8Denied, true);
    if ("error" in t8Denied) assert.equal(t8Denied.error, "TABLE_ORDER_MISMATCH");
    recordStep(8, "charge rejects tableId", t8Denied, { handler: "handleChargeOrder" });
    timeline.push("t8-complete");

    // t9: remove line unit
    timeline.push("t9-prepared");
    timeline.push("t9-start");
    await adminDb.collection("orders").doc("order-remove").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "sent",
      items: [{ id: "line-1", status: "sent", quantity: 2, price: 5, total: 10 }],
      total: 10,
    });
    const t9Result = await handleRemoveLineUnit(authCtx("waiter"), {
      orderId: "order-remove",
      lineId: "line-1",
    });
    assert.equal("total" in t9Result, true);
    const t9Order = (await adminDb.collection("orders").doc("order-remove").get()).data();
    const t9Items = t9Order?.items as Array<Record<string, unknown>>;
    assert.equal(t9Items?.[0]?.quantity, 1);
    recordStep(9, "remove line unit", t9Result, { handler: "handleRemoveLineUnit" });
    timeline.push("t9-complete");

    // t10: comp line requires discount
    timeline.push("t10-prepared");
    timeline.push("t10-start");
    await adminDb.collection("orders").doc("order-comp").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "sent",
      items: [{ id: "line-1", status: "sent", quantity: 1, price: 12, total: 12 }],
      total: 12,
    });
    const t10Denied = await handleCompLine(authCtx("waiter"), {
      orderId: "order-comp",
      lineId: "line-1",
      comped: true,
    });
    assert.equal("error" in t10Denied, true);
    const t10Allowed = await handleCompLine(authCtx("manager"), {
      orderId: "order-comp",
      lineId: "line-1",
      comped: true,
    });
    assert.equal("isComped" in t10Allowed, true);
    recordStep(10, "comp line requires discount", { denied: t10Denied, allowed: t10Allowed }, {
      handler: "handleCompLine",
    });
    timeline.push("t10-complete");

    // t11: nested idempotency hash
    timeline.push("t11-prepared");
    timeline.push("t11-start");
    const t11A = stablePayloadHash({
      lines: [{ lineId: "l1", modifiers: [{ groupId: "g1", optionId: "o1" }] }],
      orderId: "o1",
    });
    const t11B = stablePayloadHash({
      orderId: "o1",
      lines: [{ modifiers: [{ optionId: "o1", groupId: "g1" }], lineId: "l1" }],
    });
    assert.equal(t11A, t11B);
    recordStep(11, "nested idempotency hash", { a: t11A, b: t11B });
    timeline.push("t11-complete");

    // t12: categoría canónica
    timeline.push("t12-prepared");
    timeline.push("t12-start");
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
    const t12Created = await handleCreateOpenOrder(authCtx("waiter"), {
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
    assert.equal("orderId" in t12Created, true);
    const t12ShadowDenied = await handleCreateOpenOrder(authCtx("waiter"), {
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
    assert.equal("error" in t12ShadowDenied, true);
    if ("error" in t12ShadowDenied) {
      assert.equal(t12ShadowDenied.error, "MODIFIER_GROUP_NOT_ALLOWED");
    }
    recordStep(12, "categoría canónica", { created: t12Created, shadowDenied: t12ShadowDenied }, {
      handler: "handleCreateOpenOrder",
    });
    timeline.push("t12-complete");

    // t13: multi-tenant priceDelta
    timeline.push("t13-prepared");
    timeline.push("t13-start");
    const sharedGroupId = "grp-shared-price";
    const sharedOptionId = "opt-shared";
    const t13Results: unknown[] = [];
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
      if ("orderId" in created) {
        const orderSnap = await adminDb.collection("orders").doc(created.orderId).get();
        const items = orderSnap.data()?.items as Array<Record<string, unknown>> | undefined;
        const modifiers = items?.[0]?.selectedModifiers as Array<Record<string, unknown>> | undefined;
        assert.equal(modifiers?.[0]?.priceDelta, delta);
        t13Results.push({ restaurantId, delta, created });
      }
    }
    recordStep(13, "multi-tenant priceDelta", t13Results, { handler: "handleCreateOpenOrder" });
    timeline.push("t13-complete");

    // t14: venta sin selección
    timeline.push("t14-prepared");
    timeline.push("t14-start");
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
    const t14Created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: "mesa-empty-ref",
      lines: [{ lineId: "line-empty-ref", productId: "prod-empty-ref", quantity: 1 }],
      markSent: true,
      idempotencyKey: "create-empty-ref",
    });
    assert.equal("orderId" in t14Created, true);
    recordStep(14, "venta sin selección", t14Created, { handler: "handleCreateOpenOrder" });
    timeline.push("t14-complete");

    // t15: 6C1-11 modifier snapshot
    timeline.push("t15-prepared");
    timeline.push("t15-start");
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
    const t15Created = await handleCreateOpenOrder(authCtx("waiter"), {
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
    assert.equal("orderId" in t15Created, true);
    if ("orderId" in t15Created) {
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
      const orderSnap = await adminDb.collection("orders").doc(t15Created.orderId).get();
      const items = orderSnap.data()?.items as Array<Record<string, unknown>> | undefined;
      const mods = items?.[0]?.selectedModifiers as Array<Record<string, unknown>> | undefined;
      assert.equal(mods?.[0]?.inventoryProductId, "inv-cola-a");
      assert.equal(mods?.[0]?.inventoryProductName, "Cola A");
      assert.equal(mods?.[0]?.inventoryQuantity, 1);
      assert.equal(mods?.[0]?.inventoryUnit, "unit");
      assert.equal(mods?.[0]?.priceDelta, 1);
      assert.equal(items?.[0]?.quantity, 3);
    }
    recordStep(15, "6C1-11 modifier snapshot", t15Created, { handler: "handleCreateOpenOrder" });
    timeline.push("t15-complete");

    // t16: 6C1-12 tenant metadata
    timeline.push("t16-prepared");
    timeline.push("t16-start");
    const sharedGroupIdInv = "grp-inv-shared";
    const sharedOptionIdInv = "opt-shared-inv";
    const t16Results: unknown[] = [];
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
        .doc(sharedGroupIdInv)
        .set({
          name: "Mixer tenant",
          type: "mixer",
          active: true,
          options: [
            {
              id: sharedOptionIdInv,
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
          modifierGroupIds: [sharedGroupIdInv],
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
              selectedModifiers: [{ groupId: sharedGroupIdInv, optionId: sharedOptionIdInv }],
            },
          ],
          markSent: true,
          idempotencyKey: key,
        },
      );
      assert.equal("orderId" in created, true);
      if ("orderId" in created) {
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
        t16Results.push({ restaurantId, created });
      }
    }
    recordStep(16, "6C1-12 tenant metadata", t16Results, { handler: "handleCreateOpenOrder" });
    timeline.push("t16-complete");

    // t17: 6C2 modifier_sale stock
    timeline.push("t17-prepared");
    timeline.push("t17-start");
    const invProductId6c2 = "inv-cola-6c2";
    const groupId6c2 = "grp-mixer-6c2";
    const optionId6c2 = "opt-cola";
    await adminDb.collection("tables").doc("mesa-6c2").set({
      restaurantId: RESTAURANT_A,
      name: "Mesa 6C2",
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc(invProductId6c2)
      .set({
        name: "Coca-Cola inventario",
        active: true,
        inventory: { enabled: true, unit: "ud", currentStock: 10 },
      });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("modifierGroups")
      .doc(groupId6c2)
      .set({
        name: "Mixer",
        type: "mixer",
        active: true,
        options: [
          {
            id: optionId6c2,
            name: "Cola",
            priceDelta: 0,
            active: true,
            inventoryProductId: invProductId6c2,
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
        modifierGroupIds: [groupId6c2],
      });
    const t17Created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: "mesa-6c2",
      lines: [
        {
          lineId: "line-6c2",
          productId: "prod-6c2",
          quantity: 3,
          selectedModifiers: [{ groupId: groupId6c2, optionId: optionId6c2 }],
        },
      ],
      markSent: true,
      idempotencyKey: "create-6c2-stock",
    });
    assert.equal("orderId" in t17Created, true);
    if ("orderId" in t17Created) {
      const orderSnap = await adminDb.collection("orders").doc(t17Created.orderId).get();
      const mods = (orderSnap.data()?.items as Array<Record<string, unknown>> | undefined)?.[0]
        ?.selectedModifiers as Array<Record<string, unknown>> | undefined;
      assert.equal(mods?.[0]?.inventoryProductId, invProductId6c2);
      assert.equal(mods?.[0]?.inventoryQuantity, 1);
      const movementsSnap = await adminDb
        .collection("restaurants")
        .doc(RESTAURANT_A)
        .collection("stockMovements")
        .where("orderId", "==", t17Created.orderId)
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
        .doc(invProductId6c2)
        .get();
      const currentStock = (invSnap.data()?.inventory as Record<string, unknown> | undefined)
        ?.currentStock;
      assert.equal(currentStock, 7);
    }
    recordStep(17, "6C2 modifier_sale stock", t17Created, { handler: "handleCreateOpenOrder" });
    timeline.push("t17-complete");

    // t18: 6C2.2-21 invalid stock
    timeline.push("t18-prepared");
    timeline.push("t18-start");
    {
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
      if ("orderId" in created) {
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
        recordStep(18, "6C2.2-21 invalid stock", created, { handler: "handleCreateOpenOrder" });
      }
    }
    timeline.push("t18-complete");

    // t19: 6C2.2-22 invalid unit
    timeline.push("t19-prepared");
    timeline.push("t19-start");
    {
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
      if ("orderId" in created) {
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
        recordStep(19, "6C2.2-22 invalid unit", created, { handler: "handleCreateOpenOrder" });
      }
    }
    timeline.push("t19-complete");

    // t20: 6C2.2-23 zero stock
    timeline.push("t20-prepared");
    timeline.push("t20-start");
    {
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
      if ("orderId" in created) {
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
        recordStep(20, "6C2.2-23 zero stock", created, { handler: "handleCreateOpenOrder" });
      }
    }
    timeline.push("t20-complete");

    // t21: 6C2.3-1 create-open retry
    timeline.push("t21-prepared");
    timeline.push("t21-start");
    {
      const fixture = {
        tableId: "mesa-6c23-create",
        invProductId: "inv-6c23-create",
        groupId: "grp-6c23-create",
        optionId: "opt-6c23-create",
        productId: "prod-6c23-create",
        lineId: "line-6c23-create",
      };
      const idempotencyKey = "create-6c23-invalid-stock";
      await seedInvalidCurrentStockModifierFixture(adminDb, fixture);
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
      if ("orderId" in first) {
        assert.equal(first.inventoryWarnings.length, 1);
        assert.equal(first.inventoryWarnings[0]?.reason, "INVALID_CURRENT_STOCK");
        assert.equal(await countStockMovementsForOrder(adminDb, first.orderId), 0);
        const second = await handleCreateOpenOrder(authCtx("waiter"), intent);
        assert.equal("orderId" in second, true);
        if ("orderId" in second) {
          assert.equal(second.orderId, first.orderId);
          assert.deepEqual(second.inventoryWarnings, first.inventoryWarnings);
          assert.equal(await countStockMovementsForOrder(adminDb, first.orderId), 0);
          recordStep(21, "6C2.3-1 create-open retry", { first, second }, {
            handler: "handleCreateOpenOrder",
          });
        }
      }
    }
    timeline.push("t21-complete");

    // t22: 6C2.3-2 upsert retry
    timeline.push("t22-prepared");
    timeline.push("t22-start");
    {
      const fixture = {
        tableId: "mesa-6c23-upsert",
        invProductId: "inv-6c23-upsert",
        groupId: "grp-6c23-upsert",
        optionId: "opt-6c23-upsert",
        productId: "prod-6c23-upsert",
        lineId: "line-6c23-upsert",
      };
      const idempotencyKey = "upsert-6c23-invalid-stock";
      await seedInvalidCurrentStockModifierFixture(adminDb, fixture);
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
      if ("orderId" in created) {
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
        if ("orderId" in first) {
          assert.equal(first.inventoryWarnings.length, 1);
          assert.equal(first.inventoryWarnings[0]?.reason, "INVALID_CURRENT_STOCK");
          assert.equal(await countStockMovementsForOrder(adminDb, first.orderId), 0);
          const second = await handleUpsertSaleLines(authCtx("waiter"), upsertIntent);
          assert.equal("orderId" in second, true);
          if ("orderId" in second) {
            assert.deepEqual(second.inventoryWarnings, first.inventoryWarnings);
            assert.equal(await countStockMovementsForOrder(adminDb, first.orderId), 0);
            recordStep(22, "6C2.3-2 upsert retry", { first, second }, {
              handler: "handleUpsertSaleLines",
            });
          }
        }
      }
    }
    timeline.push("t22-complete");

    // t23: 6C2.3-3 transition-line-status retry
    timeline.push("t23-prepared");
    timeline.push("t23-start");
    {
      const fixture = {
        tableId: "mesa-6c23-status",
        invProductId: "inv-6c23-status",
        groupId: "grp-6c23-status",
        optionId: "opt-6c23-status",
        productId: "prod-6c23-status",
        lineId: "line-6c23-status",
      };
      const idempotencyKey = "status-6c23-invalid-stock";
      await seedInvalidCurrentStockModifierFixture(adminDb, fixture);
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
      if ("orderId" in created) {
        const intent = {
          orderId: created.orderId,
          lineId: fixture.lineId,
          expectedStatus: "pending",
          nextStatus: "sent",
          idempotencyKey,
        };
        const first = await handleTransitionLineStatus(authCtx("kitchen"), intent);
        assert.equal("orderId" in first, true);
        if ("orderId" in first) {
          assert.equal(first.inventoryWarnings.length, 1);
          assert.equal(first.inventoryWarnings[0]?.reason, "INVALID_CURRENT_STOCK");
          assert.equal(await countStockMovementsForOrder(adminDb, first.orderId), 0);
          const second = await handleTransitionLineStatus(authCtx("kitchen"), intent);
          assert.equal("orderId" in second, true);
          if ("orderId" in second) {
            assert.deepEqual(second.inventoryWarnings, first.inventoryWarnings);
            assert.equal(await countStockMovementsForOrder(adminDb, first.orderId), 0);
            recordStep(23, "6C2.3-3 status retry", { first, second }, {
              handler: "handleTransitionLineStatus",
            });
          }
        }
      }
    }
    timeline.push("t23-complete");

    // t24: 6C2.3-4 transition-line-quantity retry
    timeline.push("t24-prepared");
    timeline.push("t24-start");
    {
      const fixture = {
        tableId: "mesa-6c23-qty",
        invProductId: "inv-6c23-qty",
        groupId: "grp-6c23-qty",
        optionId: "opt-6c23-qty",
        productId: "prod-6c23-qty",
        lineId: "line-6c23-qty",
      };
      const idempotencyKey = "qty-6c23-invalid-stock";
      await seedInvalidCurrentStockModifierFixture(adminDb, fixture);
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
      if ("orderId" in created) {
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
        if ("advancedLineId" in first) {
          assert.equal(first.inventoryWarnings.length, 1);
          assert.equal(first.inventoryWarnings[0]?.reason, "INVALID_CURRENT_STOCK");
          assert.equal(await countStockMovementsForOrder(adminDb, first.orderId), 0);
          const second = await handleTransitionLineQuantity(authCtx("kitchen"), intent);
          assert.equal("advancedLineId" in second, true);
          if ("advancedLineId" in second) {
            assert.equal(second.advancedLineId, first.advancedLineId);
            assert.deepEqual(second.inventoryWarnings, first.inventoryWarnings);
            assert.equal(await countStockMovementsForOrder(adminDb, first.orderId), 0);
            recordStep(24, "6C2.3-4 qty retry", { first, second }, {
              handler: "handleTransitionLineQuantity",
            });
          }
        }
      }
    }
    timeline.push("t24-complete");

    // t25: 6C2.3-5 catalog fix between retries
    timeline.push("t25-prepared");
    timeline.push("t25-start");
    {
      const fixture = {
        tableId: "mesa-6c23-catalog",
        invProductId: "inv-6c23-catalog",
        groupId: "grp-6c23-catalog",
        optionId: "opt-6c23-catalog",
        productId: "prod-6c23-catalog",
        lineId: "line-6c23-catalog",
      };
      const idempotencyKey = "create-6c23-catalog-fix";
      await seedInvalidCurrentStockModifierFixture(adminDb, fixture);
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
      if ("orderId" in first) {
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
        if ("orderId" in second) {
          assert.deepEqual(second.inventoryWarnings, first.inventoryWarnings);
          assert.equal(await countStockMovementsForOrder(adminDb, first.orderId), 0);
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
          recordStep(25, "6C2.3-5 catalog fix", { first, second }, {
            handler: "handleCreateOpenOrder",
          });
        }
      }
    }
    timeline.push("t25-complete");

    // t26: 6C2.3-6 valid stock retry empty warnings
    timeline.push("t26-prepared");
    timeline.push("t26-start");
    {
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
      if ("orderId" in first) {
        assert.deepEqual(first.inventoryWarnings, []);
        const second = await handleCreateOpenOrder(authCtx("waiter"), intent);
        assert.equal("orderId" in second, true);
        if ("orderId" in second) {
          assert.deepEqual(second.inventoryWarnings, []);
          assert.equal(await countStockMovementsForOrder(adminDb, first.orderId), 1);
          recordStep(26, "6C2.3-6 valid stock retry", { first, second }, {
            handler: "handleCreateOpenOrder",
          });
        }
      }
    }
    timeline.push("t26-complete");

    // t27: 6C2.3-7 multiple warnings deterministic order
    timeline.push("t27-prepared");
    timeline.push("t27-start");
    {
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
      if ("orderId" in first) {
        assert.equal(first.inventoryWarnings.length, 2);
        assert.equal(first.inventoryWarnings[0]?.reason, "INVALID_CURRENT_STOCK");
        assert.equal(first.inventoryWarnings[1]?.reason, "UNKNOWN_PRODUCT_UNIT");
        const second = await handleCreateOpenOrder(authCtx("waiter"), intent);
        assert.equal("orderId" in second, true);
        if ("orderId" in second) {
          assert.deepEqual(second.inventoryWarnings, first.inventoryWarnings);
          assert.equal(second.inventoryWarnings.length, 2);
          recordStep(27, "6C2.3-7 multiple warnings", { first, second }, {
            handler: "handleCreateOpenOrder",
          });
        }
      }
    }
    timeline.push("t27-complete");

    // t28: 6C2.3-8 idempotency conflict
    timeline.push("t28-prepared");
    timeline.push("t28-start");
    {
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
      recordStep(28, "6C2.3-8 idempotency conflict", { first, conflict }, {
        handler: "handleCreateOpenOrder",
      });
    }
    timeline.push("t28-complete");

    // t29: 6C2.3-9 legacy idempotency rehydrate
    timeline.push("t29-prepared");
    timeline.push("t29-start");
    {
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
      if ("orderId" in rehydrated) {
        assert.equal(rehydrated.orderId, orderId);
        assert.deepEqual(rehydrated.inventoryWarnings, []);
        assert.deepEqual(
          readInventoryWarningsFromIdempotencyResult({ orderId, total: 2 }),
          [],
        );
        recordStep(29, "6C2.3-9 legacy rehydrate", rehydrated, {
          handler: "handleCreateOpenOrder",
        });
      }
    }
    timeline.push("t29-complete");

    // t30: upsert preserves omitted pending lines
    timeline.push("t30-prepared");
    timeline.push("t30-start");
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
    const t30Result = await handleUpsertSaleLines(authCtx("waiter"), {
      orderId: "order-upsert",
      lines: [{ lineId: "line-update", productId: "prod-1", quantity: 2 }],
    });
    assert.equal("items" in t30Result, true);
    if ("items" in t30Result) {
      assert.equal(t30Result.items.length, 2);
    }
    recordStep(30, "upsert preserves", t30Result, { handler: "handleUpsertSaleLines" });
    timeline.push("t30-complete");

    // t31: close rejects unpaid
    timeline.push("t31-prepared");
    timeline.push("t31-start");
    await adminDb.collection("orders").doc("order-unpaid-close").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "open",
      items: [{ id: "l1", status: "sent", quantity: 1, price: 12, total: 12 }],
      total: 12,
    });
    const t31Denied = await handleCloseOrder(authCtx("waiter"), { orderId: "order-unpaid-close" });
    assert.equal("error" in t31Denied, true);
    if ("error" in t31Denied) assert.equal(t31Denied.error, "UNPAID_BALANCE");
    recordStep(31, "close rejects unpaid", t31Denied, { handler: "handleCloseOrder" });
    timeline.push("t31-complete");

    // t32: reopen rejects paid without refund
    timeline.push("t32-prepared");
    timeline.push("t32-start");
    await adminDb.collection("orders").doc("order-paid-reopen").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "paid",
      items: [{ id: "l1", status: "sent", quantity: 1, price: 10, total: 10 }],
      total: 10,
    });
    const t32Denied = await handleReopenOrder(authCtx("manager"), { orderId: "order-paid-reopen" });
    assert.equal("error" in t32Denied, true);
    if ("error" in t32Denied) assert.equal(t32Denied.error, "REOPEN_REQUIRES_REFUND");
    recordStep(32, "reopen rejects paid", t32Denied, { handler: "handleReopenOrder" });
    timeline.push("t32-complete");

    // t33: finalize rejects unpaid balance
    timeline.push("t33-prepared");
    timeline.push("t33-start");
    await adminDb.collection("tables").doc("mesa-fin").set({ restaurantId: RESTAURANT_A, status: "occupied" });
    await adminDb.collection("orders").doc("order-fin").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-fin",
      status: "sent",
      items: [{ id: "l1", status: "sent", quantity: 1, price: 8, total: 8 }],
      total: 8,
    });
    const t33Denied = await handleFinalizeTableAfterPayment(authCtx("waiter"), { tableId: "mesa-fin" });
    assert.equal("error" in t33Denied, true);
    if ("error" in t33Denied) assert.equal(t33Denied.error, "TABLE_HAS_UNPAID_ORDERS");
    recordStep(33, "finalize rejects unpaid", t33Denied, {
      handler: "handleFinalizeTableAfterPayment",
    });
    timeline.push("t33-complete");

    // t34: split_equal
    timeline.push("t34-prepared");
    timeline.push("t34-start");
    const t34Part1 = computeSplitEqualAmount(10, 1, 3, []);
    const t34Part2 = computeSplitEqualAmount(10, 2, 3, [
      { status: "paid", type: "split_equal", part: 1, totalParts: 3, amount: 3.33 },
    ]);
    assert.equal(t34Part1, 3.33);
    assert.equal(t34Part2, 3.33);
    const t34Part3 = computeSplitEqualAmount(10, 3, 3, [
      { status: "paid", type: "split_equal", part: 1, totalParts: 3, amount: 3.33 },
      { status: "paid", type: "split_equal", part: 2, totalParts: 3, amount: 3.33 },
    ]);
    assert.equal(t34Part3, 3.34);
    recordStep(34, "split_equal", { part1: t34Part1, part2: t34Part2, part3: t34Part3 });
    timeline.push("t34-complete");

    // t35: undefined serialize
    timeline.push("t35-prepared");
    timeline.push("t35-start");
    assert.notEqual(canonicalSerialize(undefined), canonicalSerialize("__undefined__"));
    recordStep(35, "undefined serialize", {
      undefined: canonicalSerialize(undefined),
      literal: canonicalSerialize("__undefined__"),
    });
    timeline.push("t35-complete");

    // t36: comp line 404
    timeline.push("t36-prepared");
    timeline.push("t36-start");
    await adminDb.collection("orders").doc("order-comp-miss").set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-1",
      status: "open",
      items: [{ id: "exists", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const t36Denied = await handleCompLine(authCtx("manager"), {
      orderId: "order-comp-miss",
      lineId: "missing",
      comped: true,
    });
    assert.equal("error" in t36Denied, true);
    if ("error" in t36Denied) assert.equal(t36Denied.error, "LINE_NOT_FOUND");
    recordStep(36, "comp line 404", t36Denied, { handler: "handleCompLine" });
    timeline.push("t36-complete");

    // t37: create-open operatorAssignment
    timeline.push("t37-prepared");
    timeline.push("t37-start");
    await adminDb.collection("tables").doc("mesa-op-create").set({
      restaurantId: RESTAURANT_A,
      name: "Op create",
    });
    const t37Created = await handleCreateOpenOrder(authCtx("waiter"), {
      tableId: "mesa-op-create",
      lines: [{ lineId: "op-line-1", productId: "prod-1", quantity: 1 }],
      operatorAssignment: {
        assignedOperatorId: "op-create-1",
        assignedOperatorName: "Operador Create",
      },
      idempotencyKey: "create-op-assign-1",
    });
    assert.equal("orderId" in t37Created, true);
    if ("orderId" in t37Created) {
      const order = (await adminDb.collection("orders").doc(t37Created.orderId).get()).data();
      assert.equal(order?.assignedOperatorId, "op-create-1");
      assert.equal(order?.assignedOperatorName, "Operador Create");
      assert.ok(order?.assignedAt != null);
      assert.equal(typeof (order?.assignedAt as { toDate?: () => Date }).toDate, "function");
      recordStep(37, "create-open operatorAssignment", t37Created, {
        handler: "handleCreateOpenOrder",
      });
    }
    timeline.push("t37-complete");

    const mesa1BeforeAssign = await readMesa1Snapshot(adminDb);

    // A1
    timeline.push("a1-prepared");
    timeline.push("a1-start");
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
    const a1 = await handleAssignTableOperator(ctx, {
      tableId: "mesa-op-zero",
      assignedOperatorId: "op-zero",
      assignedOperatorName: "Op Zero",
    });
    assert.equal("assigned" in a1, true);
    if ("assigned" in a1) {
      assert.equal(a1.assigned, true);
      assert.equal(a1.orderId, undefined);
    }
    const a1Table = (await adminDb.collection("tables").doc("mesa-op-zero").get()).data();
    assert.equal(a1Table?.assignedOperatorId, "op-zero");
    const a1PaidOrder = (
      await adminDb.collection("orders").doc("order-op-paid").get()
    ).data();
    assert.equal(a1PaidOrder?.assignedOperatorId, undefined);
    steps.push({ index: 0, name: "A1", handler: "handleAssignTableOperator", result: a1 });
    timeline.push("a1-complete");

    // A2
    timeline.push("a2-prepared");
    timeline.push("a2-start");
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
    const a2 = await handleAssignTableOperator(ctx, {
      tableId: "mesa-op-one",
      assignedOperatorId: "op-one",
      assignedOperatorName: "Op One",
    });
    assert.equal("assigned" in a2, true);
    if ("assigned" in a2) {
      assert.equal(a2.assigned, true);
      assert.equal(a2.orderId, "order-op-one");
    }
    const a2Table = (await adminDb.collection("tables").doc("mesa-op-one").get()).data();
    const a2Order = (await adminDb.collection("orders").doc("order-op-one").get()).data();
    assert.equal(a2Table?.assignedOperatorId, "op-one");
    assert.equal(a2Order?.assignedOperatorId, "op-one");
    steps.push({ index: 0, name: "A2", handler: "handleAssignTableOperator", result: a2 });
    timeline.push("a2-complete");

    // A3
    timeline.push("a3-prepared");
    timeline.push("a3-start");
    const a3TableRef = adminDb.collection("tables").doc("mesa-op-multi");
    await a3TableRef.set({
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
    const a3Before = await snapshotPair(a3TableRef, null);
    const a3 = await handleAssignTableOperator(ctx, {
      tableId: "mesa-op-multi",
      assignedOperatorId: "op-multi",
      assignedOperatorName: "Op Multi",
    });
    assert.equal("error" in a3, true);
    if ("error" in a3) assert.equal(a3.error, "MULTIPLE_ACTIVE_ORDERS");
    const a3After = await snapshotPair(a3TableRef, null);
    assertPairUnchanged(a3Before, a3After);
    assert.equal(a3After.table.assignedOperatorId, undefined);
    steps.push({
      index: 0,
      name: "A3",
      handler: "handleAssignTableOperator",
      result: a3,
      documentsUnchanged: true,
    });
    timeline.push("a3-complete");

    // A4
    timeline.push("a4-prepared");
    timeline.push("a4-start");
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
    const a4 = await handleAssignTableOperator(ctx, {
      tableId: "mesa-op-assign",
      orderId: "order-op-assign",
      assignedOperatorId: "waiter-op-a",
      assignedOperatorName: "Waiter Op A",
    });
    assert.equal("assigned" in a4, true);
    if ("assigned" in a4) assert.equal(a4.assigned, true);
    const a4Table = (await adminDb.collection("tables").doc("mesa-op-assign").get()).data();
    const a4Order = (await adminDb.collection("orders").doc("order-op-assign").get()).data();
    assert.equal(a4Table?.assignedOperatorId, "waiter-op-a");
    assert.equal(a4Order?.assignedOperatorId, "waiter-op-a");
    assert.ok(a4Table?.assignedAt != null);
    assert.ok(a4Order?.assignedAt != null);
    steps.push({ index: 0, name: "A4", handler: "handleAssignTableOperator", result: a4 });
    timeline.push("a4-complete");

    // A5
    timeline.push("a5-prepared");
    timeline.push("a5-start");
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
    const a5 = await handleAssignTableOperator(ctx, {
      tableId: "mesa-op-sent",
      orderId: "order-op-sent",
      assignedOperatorId: "op-sent",
      assignedOperatorName: "Op Sent",
    });
    assert.equal("assigned" in a5, true);
    if ("assigned" in a5) assert.equal(a5.assigned, true);
    const a5Order = (await adminDb.collection("orders").doc("order-op-sent").get()).data();
    assert.equal(a5Order?.assignedOperatorId, "op-sent");
    steps.push({ index: 0, name: "A5", handler: "handleAssignTableOperator", result: a5 });
    timeline.push("a5-complete");

    // A6-A9
    const terminalStatuses = ["paid", "closed", "merged", "cancelled"] as const;
    for (let i = 0; i < terminalStatuses.length; i += 1) {
      const status = terminalStatuses[i]!;
      const stepLabel = `A${6 + i}`;
      const timelineBase = `a${6 + i}`;
      timeline.push(`${timelineBase}-prepared`);
      timeline.push(`${timelineBase}-start`);
      const tableId = `mesa-op-${status}`;
      const orderId = `order-op-${status}`;
      const tableRef = adminDb.collection("tables").doc(tableId);
      const orderRef = adminDb.collection("orders").doc(orderId);
      await tableRef.set({
        restaurantId: RESTAURANT_A,
        name: status,
      });
      await orderRef.set({
        restaurantId: RESTAURANT_A,
        tableId,
        status,
        items: [{ id: "l1", status: "sent", quantity: 1, price: 5, total: 5 }],
        total: 5,
      });
      const before = await snapshotPair(tableRef, orderRef);
      const result = await handleAssignTableOperator(ctx, {
        tableId,
        orderId,
        assignedOperatorId: "op-terminal",
        assignedOperatorName: "Op Terminal",
      });
      assert.equal("error" in result, true);
      if ("error" in result) assert.equal(result.error, "ORDER_NOT_ACTIVE");
      const after = await snapshotPair(tableRef, orderRef);
      assertPairUnchanged(before, after);
      assert.equal(after.order?.assignedOperatorId, undefined);
      steps.push({
        index: 0,
        name: stepLabel,
        handler: "handleAssignTableOperator",
        result,
        documentsUnchanged: true,
      });
      timeline.push(`${timelineBase}-complete`);
    }

    // A10
    timeline.push("a10-prepared");
    timeline.push("a10-start");
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
    const a10 = await handleAssignTableOperator(ctx, {
      tableId: "mesa-op-order-only",
      orderId: "order-op-order-only",
      assignedOperatorId: "shared-op",
      assignedOperatorName: "Shared Op",
    });
    assert.equal("assigned" in a10, true);
    if ("assigned" in a10) assert.equal(a10.assigned, true);
    const a10Table = (
      await adminDb.collection("tables").doc("mesa-op-order-only").get()
    ).data();
    assert.equal(a10Table?.assignedOperatorId, "shared-op");
    steps.push({ index: 0, name: "A10", handler: "handleAssignTableOperator", result: a10 });
    timeline.push("a10-complete");

    // A11
    timeline.push("a11-prepared");
    timeline.push("a11-start");
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
    const a11 = await handleAssignTableOperator(ctx, {
      tableId: "mesa-op-table-only",
      orderId: "order-op-table-only",
      assignedOperatorId: "shared-op",
      assignedOperatorName: "Shared Op",
    });
    assert.equal("assigned" in a11, true);
    if ("assigned" in a11) assert.equal(a11.assigned, true);
    const a11Order = (
      await adminDb.collection("orders").doc("order-op-table-only").get()
    ).data();
    assert.equal(a11Order?.assignedOperatorId, "shared-op");
    steps.push({ index: 0, name: "A11", handler: "handleAssignTableOperator", result: a11 });
    timeline.push("a11-complete");

    // A12
    timeline.push("a12-prepared");
    timeline.push("a12-start");
    const a12TableRef = adminDb.collection("tables").doc("mesa-op-retry");
    const a12OrderRef = adminDb.collection("orders").doc("order-op-retry");
    await a12TableRef.set({
      restaurantId: RESTAURANT_A,
      assignedOperatorId: "same-op",
      assignedOperatorName: "Same Op",
      assignedAt: Date.now(),
    });
    await a12OrderRef.set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-retry",
      status: "open",
      assignedOperatorId: "same-op",
      assignedOperatorName: "Same Op",
      assignedAt: Date.now(),
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const a12Before = await snapshotPair(a12TableRef, a12OrderRef);
    const a12 = await handleAssignTableOperator(ctx, {
      tableId: "mesa-op-retry",
      orderId: "order-op-retry",
      assignedOperatorId: "same-op",
      assignedOperatorName: "Same Op",
    });
    assert.equal("assigned" in a12, true);
    if ("assigned" in a12) assert.equal(a12.assigned, false);
    const a12After = await snapshotPair(a12TableRef, a12OrderRef);
    assertPairUnchanged(a12Before, a12After);
    steps.push({
      index: 0,
      name: "A12",
      handler: "handleAssignTableOperator",
      result: a12,
      documentsUnchanged: true,
    });
    timeline.push("a12-complete");

    // A13
    timeline.push("a13-prepared");
    timeline.push("a13-start");
    const a13TableRef = adminDb.collection("tables").doc("mesa-op-deny");
    const a13OrderRef = adminDb.collection("orders").doc("order-op-deny");
    await a13TableRef.set({
      restaurantId: RESTAURANT_A,
      assignedOperatorId: "op-locked",
      assignedOperatorName: "Locked",
      assignedAt: Date.now(),
    });
    await a13OrderRef.set({
      restaurantId: RESTAURANT_A,
      tableId: "mesa-op-deny",
      status: "open",
      items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
      total: 5,
    });
    const a13Before = await snapshotPair(a13TableRef, a13OrderRef);
    const a13 = await handleAssignTableOperator(ctx, {
      tableId: "mesa-op-deny",
      orderId: "order-op-deny",
      assignedOperatorId: "op-other",
      assignedOperatorName: "Other",
    });
    assert.equal("error" in a13, true);
    if ("error" in a13) assert.equal(a13.error, "OPERATOR_ALREADY_ASSIGNED");
    const a13After = await snapshotPair(a13TableRef, a13OrderRef);
    assertPairUnchanged(a13Before, a13After);
    assert.equal(a13After.table.assignedOperatorId, "op-locked");
    assert.equal(a13After.order?.assignedOperatorId, undefined);
    steps.push({
      index: 0,
      name: "A13",
      handler: "handleAssignTableOperator",
      result: a13,
      documentsUnchanged: true,
    });
    timeline.push("a13-complete");

    // A19 — historical: concurrent same operator yields one write and one stable retry
    timeline.push("a19-prepared");
    const a19TableId = "mesa-op-same-concurrent";
    const a19OrderId = "order-op-same-concurrent";
    const a19TableRef = adminDb.collection("tables").doc(a19TableId);
    const a19OrderRef = adminDb.collection("orders").doc(a19OrderId);
    const a19Before = await (async () => {
      await a19TableRef.set({
        restaurantId: RESTAURANT_A,
        name: "Same concurrent",
      });
      await a19OrderRef.set({
        restaurantId: RESTAURANT_A,
        tableId: a19TableId,
        status: "open",
        items: [{ id: "l1", status: "pending", quantity: 1, price: 5, total: 5 }],
        total: 5,
      });
      return snapshotPair(a19TableRef, a19OrderRef);
    })();

    const a19Intent = {
      tableId: a19TableId,
      orderId: a19OrderId,
      assignedOperatorId: "same-op",
      assignedOperatorName: "Same Op",
    };

    const dispatchAStartedAt = performance.now();
    const promiseA = handleAssignTableOperator(ctx, a19Intent);
    timeline.push("a19-dispatched-a");
    const dispatchADispatchedAt = performance.now();
    const promiseB = handleAssignTableOperator(ctx, a19Intent);
    timeline.push("a19-dispatched-b");
    const dispatchBDispatchedAt = performance.now();

    const observedA: { status?: string; value?: unknown; reason?: unknown } = {};
    const observedB: { status?: string; value?: unknown; reason?: unknown } = {};
    observePromise(promiseA, observedA);
    observePromise(promiseB, observedB);

    let first: unknown;
    let second: unknown;
    let a19PromiseAllRejected: Record<string, unknown> | null = null;
    try {
      [first, second] = await Promise.all([promiseA, promiseB]);
      timeline.push("a19-results-complete");
    } catch (error) {
      timeline.push("a19-error");
      await Promise.allSettled([promiseA, promiseB]);
      a19PromiseAllRejected = serializeError(error);
      logDiagnostic({
        classification: "A-or-F",
        settingsAppliedBeforeUse,
        dbIdentity: { ctxIsAdminDb: ctx.db === adminDb },
        dispatchTimes: {
          dispatchAStartedAt,
          dispatchADispatchedAt,
          dispatchBDispatchedAt,
        },
        observedA,
        observedB,
        a19PromiseAllRejected,
        mesa1BeforeAssign,
        stateBeforeA19: a19Before,
        finalState: {
          table: (await a19TableRef.get()).data(),
          order: (await a19OrderRef.get()).data(),
        },
      });
      throw error;
    }

    const outcomes = [first, second];
    const writes = outcomes.filter(
      (outcome): outcome is { assigned: boolean; tableId: string; orderId?: string } =>
        typeof outcome === "object" &&
        outcome != null &&
        "assigned" in outcome &&
        outcome.assigned === true,
    );
    const retries = outcomes.filter(
      (outcome): outcome is { assigned: boolean; tableId: string; orderId?: string } =>
        typeof outcome === "object" &&
        outcome != null &&
        "assigned" in outcome &&
        outcome.assigned === false,
    );
    assert.equal(writes.length, 1);
    assert.equal(retries.length, 1);

    const table = (await a19TableRef.get()).data()!;
    const order = (await a19OrderRef.get()).data()!;
    assert.equal(table.restaurantId, RESTAURANT_A);
    assert.equal(order.restaurantId, RESTAURANT_A);
    assert.equal(order.tableId, a19TableId);
    assert.equal(order.status, "open");
    assert.equal(table.assignedOperatorId, "same-op");
    assert.equal(order.assignedOperatorId, "same-op");
    assert.equal(table.assignedOperatorName, "Same Op");
    assert.equal(order.assignedOperatorName, "Same Op");
    const timestamps = [
      table.assignedAt,
      table.updatedAt,
      order.assignedAt,
      order.updatedAt,
    ];
    timestamps.forEach((value) => assert.ok(value instanceof Timestamp));
    assert.deepEqual(order.items, [
      { id: "l1", status: "pending", quantity: 1, price: 5, total: 5 },
    ]);
    assert.equal(order.total, 5);
    steps.push({
      index: 0,
      name: "A19",
      handler: "handleAssignTableOperator",
      result: outcomes,
    });
    timeline.push("a19-complete");

    timeline.push("final-state-read");
    diagnostic = {
      settingsAppliedBeforeUse,
      dbIdentity: { ctxIsAdminDb: ctx.db === adminDb },
      dispatchTimes: {
        dispatchAStartedAt,
        dispatchADispatchedAt,
        dispatchBDispatchedAt,
      },
      observedA,
      observedB,
      outcomes,
      writes,
      retries,
      operator: "same-op",
      finalState: { table, order },
      stateBeforeA19: a19Before,
      timestampTypes: timestamps.map((value) => value.constructor.name),
      stepCount: steps.length,
      mesa1AfterTest1,
      mesa1BeforeAssign,
    };
  } finally {
    const cleanupErrors: unknown[] = [];
    if (rulesTestEnvironment) {
      try {
        await rulesTestEnvironment.cleanup();
        rulesCleanupCompleted = true;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (orderedAdminApp) {
      try {
        await deleteApp(orderedAdminApp);
        adminDeleteCompleted = true;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    adminDbSingleton = null;
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) {
      throw new AggregateError(cleanupErrors, "Rules and Admin cleanup failed");
    }
    timeline.push("cleanup-complete");
  }

  assert.equal(settingsAppliedBeforeUse, true);
  assert.equal(rulesCleanupCompleted, true);
  assert.equal(adminDeleteCompleted, true);
  assert.equal(getApps().length, 0);
  assert.ok(diagnostic);
  logDiagnostic(diagnostic);
});
