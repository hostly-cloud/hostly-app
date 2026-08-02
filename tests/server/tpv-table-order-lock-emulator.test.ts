import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, type Firestore as AdminFirestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { AuthorizedTpvRestaurantContext } from "@/lib/server/tpv/require-authorized-tpv-restaurant";
import {
  handleCloseTpvOrder,
  handleCreateOpenOrder,
  handleReopenTpvOrder,
  handleResolveActiveOrderForTable,
  handleTransitionLineStatus,
  handleUpsertSaleLines,
} from "@/lib/server/tpv/handle-tpv-order-mutations";
import { handlePayTableOrders } from "@/lib/server/tpv/handle-pay-table-orders";
import { handleMergeTableGroupOrders } from "@/lib/server/tpv/handle-merge-table-group-orders";
import { handleSplitTableGroupOrders } from "@/lib/server/tpv/handle-split-table-group-orders";
import { tableOrderLockRef } from "@/lib/server/tpv/table-order-lock";
import { isActiveTpvOrderStatus } from "@/lib/server/tpv/is-active-tpv-order-status";

const RESTAURANT_A = "rest-a-lock";
const MANAGER_UID = "manager-lock-a";

let testEnv: RulesTestEnvironment;
let adminApp: App;
let adminDb: AdminFirestore;

function authCtx(role = "manager"): AuthorizedTpvRestaurantContext {
  return {
    uid: MANAGER_UID,
    email: "manager-lock@example.test",
    emailVerified: true,
    restaurantId: RESTAURANT_A,
    role,
    canManageUsers: true,
    db: adminDb,
  };
}

async function seedTableAndProduct(tableId: string, productId: string, price = 3) {
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
      name: productId,
      price,
      active: true,
      tipoVenta: "carta",
    });
}

async function listActiveOrdersForTable(tableId: string) {
  const snap = await adminDb
    .collection("orders")
    .where("restaurantId", "==", RESTAURANT_A)
    .where("tableId", "==", tableId)
    .get();
  return snap.docs.filter((d) => isActiveTpvOrderStatus(d.data()?.status));
}

async function readLock(tableId: string) {
  const snap = await tableOrderLockRef(adminDb, RESTAURANT_A, tableId).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

describe("tpv table order lock emulator (3B-2A)", () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-hostly-tpv-table-lock",
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
    adminApp = initializeApp({ projectId: "demo-hostly-tpv-table-lock" }, "tpv-table-lock-admin");
    adminDb = getAdminFirestore(adminApp);
  });

  after(async () => {
    await testEnv.cleanup();
    await deleteApp(adminApp);
  });

  test("1. create normal writes order + lock", async () => {
    const tableId = "lock-create-normal";
    await seedTableAndProduct(tableId, "prod-lock-1");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "l1", productId: "prod-lock-1", quantity: 1 }],
      idempotencyKey: "lock-create-normal-k",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const lock = await readLock(tableId);
    assert.equal(lock?.orderId, created.orderId);
    assert.equal(lock?.restaurantId, RESTAURANT_A);
    assert.equal(lock?.tableId, tableId);
    const actives = await listActiveOrdersForTable(tableId);
    assert.equal(actives.length, 1);
  });

  test("2. identical replay returns same orderId", async () => {
    const tableId = "lock-replay";
    await seedTableAndProduct(tableId, "prod-lock-2");
    const intent = {
      tableId,
      lines: [{ lineId: "lr1", productId: "prod-lock-2", quantity: 1 }],
      idempotencyKey: "lock-replay-k",
    };
    const first = await handleCreateOpenOrder(authCtx(), intent);
    const second = await handleCreateOpenOrder(authCtx(), intent);
    assert.equal("orderId" in first && "orderId" in second, true);
    if (!("orderId" in first) || !("orderId" in second)) return;
    assert.equal(first.orderId, second.orderId);
    assert.equal((await listActiveOrdersForTable(tableId)).length, 1);
  });

  test("3+5. concurrent create-open → single active order", async () => {
    const tableId = "lock-concurrent";
    await seedTableAndProduct(tableId, "prod-lock-c");
    const results = await Promise.allSettled([
      handleCreateOpenOrder(authCtx(), {
        tableId,
        lines: [{ lineId: "ca", productId: "prod-lock-c", quantity: 1 }],
        idempotencyKey: "lock-conc-a",
      }),
      handleCreateOpenOrder(authCtx(), {
        tableId,
        lines: [{ lineId: "cb", productId: "prod-lock-c", quantity: 1 }],
        idempotencyKey: "lock-conc-b",
      }),
    ]);
    const oks = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof handleCreateOpenOrder>>> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((v) => "orderId" in v);
    assert.equal(oks.length, 2);
    const orderIds = new Set(oks.map((o) => ("orderId" in o ? o.orderId : "")));
    assert.equal(orderIds.size, 1);
    const onlyId = [...orderIds][0]!;
    const actives = await listActiveOrdersForTable(tableId);
    assert.equal(actives.length, 1);
    assert.equal(actives[0]!.id, onlyId);
    const lock = await readLock(tableId);
    assert.equal(lock?.orderId, onlyId);
    const order = (await adminDb.collection("orders").doc(onlyId).get()).data();
    const items = (order?.items as Array<Record<string, unknown>>) ?? [];
    const lineIds = items.map((i) => String(i.id));
    assert.ok(lineIds.includes("ca"));
    assert.ok(lineIds.includes("cb"));
    assert.equal(new Set(lineIds).size, lineIds.length);
  });

  test("6. legacy single active without lock is claimed", async () => {
    const tableId = "lock-legacy-one";
    await seedTableAndProduct(tableId, "prod-lock-leg");
    const legacyRef = await adminDb.collection("orders").add({
      restaurantId: RESTAURANT_A,
      tableId,
      status: "open",
      items: [],
      total: 0,
    });
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "leg1", productId: "prod-lock-leg", quantity: 1 }],
      idempotencyKey: "lock-legacy-one-k",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    assert.equal(created.orderId, legacyRef.id);
    assert.equal(created.reusedExistingOrder, true);
    assert.equal((await listActiveOrdersForTable(tableId)).length, 1);
    assert.equal((await readLock(tableId))?.orderId, legacyRef.id);
  });

  test("7. multiple legacy actives → explicit error, no extra writes", async () => {
    const tableId = "lock-legacy-multi";
    await seedTableAndProduct(tableId, "prod-lock-multi");
    await adminDb.collection("orders").add({
      restaurantId: RESTAURANT_A,
      tableId,
      status: "open",
      items: [],
      total: 0,
    });
    await adminDb.collection("orders").add({
      restaurantId: RESTAURANT_A,
      tableId,
      status: "sent",
      items: [],
      total: 0,
    });
    const before = await listActiveOrdersForTable(tableId);
    assert.equal(before.length, 2);
    const err = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "m1", productId: "prod-lock-multi", quantity: 1 }],
      idempotencyKey: "lock-legacy-multi-k",
    });
    assert.equal("error" in err, true);
    if ("error" in err) assert.equal(err.error, "MULTIPLE_ACTIVE_ORDERS_FOR_TABLE");
    const after = await listActiveOrdersForTable(tableId);
    assert.equal(after.length, 2);
    assert.equal(await readLock(tableId), null);
  });

  test("8. lock with terminal order is repaired", async () => {
    const tableId = "lock-terminal";
    await seedTableAndProduct(tableId, "prod-lock-term");
    const closedId = "order-closed-lock";
    await adminDb.collection("orders").doc(closedId).set({
      restaurantId: RESTAURANT_A,
      tableId,
      status: "closed",
      items: [],
      total: 0,
    });
    await tableOrderLockRef(adminDb, RESTAURANT_A, tableId).set({
      restaurantId: RESTAURANT_A,
      tableId,
      orderId: closedId,
    });
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "t1", productId: "prod-lock-term", quantity: 1 }],
      idempotencyKey: "lock-terminal-k",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    assert.notEqual(created.orderId, closedId);
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
  });

  test("9. lock with missing order is repaired", async () => {
    const tableId = "lock-orphan";
    await seedTableAndProduct(tableId, "prod-lock-orph");
    await tableOrderLockRef(adminDb, RESTAURANT_A, tableId).set({
      restaurantId: RESTAURANT_A,
      tableId,
      orderId: "order-does-not-exist",
    });
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "o1", productId: "prod-lock-orph", quantity: 1 }],
      idempotencyKey: "lock-orphan-k",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
  });

  test("10. lock cross-tenant → integrity error", async () => {
    const tableId = "lock-x-tenant";
    await seedTableAndProduct(tableId, "prod-lock-xt");
    await tableOrderLockRef(adminDb, RESTAURANT_A, tableId).set({
      restaurantId: "other-rest",
      tableId,
      orderId: "x",
    });
    const err = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "x1", productId: "prod-lock-xt", quantity: 1 }],
      idempotencyKey: "lock-x-tenant-k",
    });
    assert.equal("error" in err, true);
    if ("error" in err) assert.equal(err.error, "LOCK_TENANT_MISMATCH");
  });

  test("10b. lock table mismatch → integrity error", async () => {
    const tableId = "lock-x-table";
    await seedTableAndProduct(tableId, "prod-lock-xtb");
    await tableOrderLockRef(adminDb, RESTAURANT_A, tableId).set({
      restaurantId: RESTAURANT_A,
      tableId: "other-table",
      orderId: "x",
    });
    const err = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "xt1", productId: "prod-lock-xtb", quantity: 1 }],
      idempotencyKey: "lock-x-table-k",
    });
    assert.equal("error" in err, true);
    if ("error" in err) assert.equal(err.error, "LOCK_TABLE_MISMATCH");
  });

  test("11. close releases lock atomically", async () => {
    const tableId = "lock-close";
    await seedTableAndProduct(tableId, "prod-lock-close");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "cl1", productId: "prod-lock-close", quantity: 1 }],
      idempotencyKey: "lock-close-k",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const closed = await handleCloseTpvOrder(authCtx(), { orderId: created.orderId });
    assert.equal("orderId" in closed, true);
    if (!("orderId" in closed)) return;
    assert.equal(closed.lockReleased, true);
    const order = (await adminDb.collection("orders").doc(created.orderId).get()).data();
    assert.equal(order?.status, "closed");
    assert.equal((await readLock(tableId))?.orderId ?? null, null);
  });

  test("13. reopen acquires lock when free", async () => {
    const tableId = "lock-reopen-free";
    await seedTableAndProduct(tableId, "prod-lock-re");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "re1", productId: "prod-lock-re", quantity: 1 }],
      idempotencyKey: "lock-reopen-free-k",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await handleCloseTpvOrder(authCtx(), { orderId: created.orderId });
    const reopened = await handleReopenTpvOrder(authCtx(), { orderId: created.orderId });
    assert.equal("orderId" in reopened, true);
    if (!("orderId" in reopened)) return;
    assert.equal(reopened.lockAcquired, true);
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
  });

  test("14. reopen fails when another active order owns table", async () => {
    const tableId = "lock-reopen-busy";
    await seedTableAndProduct(tableId, "prod-lock-reb");
    const first = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "rb1", productId: "prod-lock-reb", quantity: 1 }],
      idempotencyKey: "lock-reopen-busy-1",
    });
    assert.equal("orderId" in first, true);
    if (!("orderId" in first)) return;
    await handleCloseTpvOrder(authCtx(), { orderId: first.orderId });
    const second = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "rb2", productId: "prod-lock-reb", quantity: 1 }],
      idempotencyKey: "lock-reopen-busy-2",
    });
    assert.equal("orderId" in second, true);
    if (!("orderId" in second)) return;
    const denied = await handleReopenTpvOrder(authCtx(), { orderId: first.orderId });
    assert.equal("error" in denied, true);
    if ("error" in denied) assert.equal(denied.error, "TABLE_ALREADY_HAS_ACTIVE_ORDER");
    const still = (await adminDb.collection("orders").doc(first.orderId).get()).data();
    assert.equal(still?.status, "closed");
    assert.equal((await readLock(tableId))?.orderId, second.orderId);
  });

  test("15. resolve-active recovers orderId after create", async () => {
    const tableId = "lock-resolve";
    await seedTableAndProduct(tableId, "prod-lock-res");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "rs1", productId: "prod-lock-res", quantity: 1 }],
      idempotencyKey: "lock-resolve-k",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const resolved = await handleResolveActiveOrderForTable(authCtx(), { tableId });
    assert.equal("orderId" in resolved, true);
    if (!("orderId" in resolved)) return;
    assert.equal(resolved.orderId, created.orderId);
  });

  test("16. different keys do not create two orders", async () => {
    const tableId = "lock-diff-keys";
    await seedTableAndProduct(tableId, "prod-lock-dk");
    const a = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "dk1", productId: "prod-lock-dk", quantity: 1 }],
      idempotencyKey: "lock-dk-a",
    });
    const b = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "dk2", productId: "prod-lock-dk", quantity: 1 }],
      idempotencyKey: "lock-dk-b",
    });
    assert.equal("orderId" in a && "orderId" in b, true);
    if (!("orderId" in a) || !("orderId" in b)) return;
    assert.equal(a.orderId, b.orderId);
    assert.equal(b.reusedExistingOrder, true);
    assert.equal((await listActiveOrdersForTable(tableId)).length, 1);
  });

  test("23. closing old order does not release newer lock", async () => {
    const tableId = "lock-owner-only";
    await seedTableAndProduct(tableId, "prod-lock-own");
    const first = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ow1", productId: "prod-lock-own", quantity: 1 }],
      idempotencyKey: "lock-own-1",
    });
    assert.equal("orderId" in first, true);
    if (!("orderId" in first)) return;
    await handleCloseTpvOrder(authCtx(), { orderId: first.orderId });
    const second = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ow2", productId: "prod-lock-own", quantity: 1 }],
      idempotencyKey: "lock-own-2",
    });
    assert.equal("orderId" in second, true);
    if (!("orderId" in second)) return;
    // Simula cierre tardío del order antiguo (ya terminal): no debe tocar el lock nuevo.
    const late = await handleCloseTpvOrder(authCtx(), { orderId: first.orderId });
    assert.equal("orderId" in late, true);
    assert.equal((await readLock(tableId))?.orderId, second.orderId);
  });

  test("pay total: order terminal + lock free same tx", async () => {
    const tableId = "lock-pay-total";
    await seedTableAndProduct(tableId, "prod-lock-pay");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "pay1", productId: "prod-lock-pay", quantity: 1 }],
      idempotencyKey: "lock-pay-total-k",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const paid = await handlePayTableOrders(authCtx(), { tableId });
    assert.equal("paidOrderIds" in paid, true);
    if (!("paidOrderIds" in paid)) return;
    assert.equal(paid.lockReleased, true);
    assert.ok(paid.paidOrderIds.includes(created.orderId));
    const order = (await adminDb.collection("orders").doc(created.orderId).get()).data();
    assert.equal(order?.status, "paid");
    assert.equal((await readLock(tableId))?.orderId ?? null, null);
  });

  test("pay partial (order still active): lock remains", async () => {
    const tableId = "lock-pay-partial";
    await seedTableAndProduct(tableId, "prod-lock-pp");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "pp1", productId: "prod-lock-pp", quantity: 1 }],
      idempotencyKey: "lock-pay-partial-k",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    // Pago parcial no llama handlePayTableOrders; el pedido sigue activo.
    assert.equal(isActiveTpvOrderStatus("open"), true);
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
    const order = (await adminDb.collection("orders").doc(created.orderId).get()).data();
    assert.equal(isActiveTpvOrderStatus(order?.status), true);
  });

  test("pay retry idempotent; does not release foreign lock", async () => {
    const tableId = "lock-pay-retry";
    await seedTableAndProduct(tableId, "prod-lock-pr");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "pr1", productId: "prod-lock-pr", quantity: 1 }],
      idempotencyKey: "lock-pay-retry-k",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const first = await handlePayTableOrders(authCtx(), { tableId });
    assert.equal("lockReleased" in first && first.lockReleased, true);
    const second = await handlePayTableOrders(authCtx(), { tableId });
    assert.equal("lockReleased" in second, true);
    if (!("lockReleased" in second)) return;
    assert.equal((await readLock(tableId))?.orderId ?? null, null);

    // Lock ajeno: mesa con lock apuntando a otro order no pagado aquí.
    const tableB = "lock-pay-foreign";
    await seedTableAndProduct(tableB, "prod-lock-pf");
    const other = await handleCreateOpenOrder(authCtx(), {
      tableId: tableB,
      lines: [{ lineId: "pf1", productId: "prod-lock-pf", quantity: 1 }],
      idempotencyKey: "lock-pay-foreign-k",
    });
    assert.equal("orderId" in other, true);
    if (!("orderId" in other)) return;
    await tableOrderLockRef(adminDb, RESTAURANT_A, tableId).set({
      restaurantId: RESTAURANT_A,
      tableId,
      orderId: other.orderId,
    });
    const payEmpty = await handlePayTableOrders(authCtx(), { tableId });
    assert.equal("lockReleased" in payEmpty, true);
    if (!("lockReleased" in payEmpty)) return;
    assert.equal(payEmpty.lockReleased, false);
    assert.equal((await readLock(tableId))?.orderId, other.orderId);
  });

  test("pay with missing lock still pays and normalizes free lock", async () => {
    const tableId = "lock-pay-nolock";
    await seedTableAndProduct(tableId, "prod-lock-pnl");
    const legacy = await adminDb.collection("orders").add({
      restaurantId: RESTAURANT_A,
      tableId,
      status: "open",
      items: [{ id: "x", productId: "prod-lock-pnl", quantity: 1, price: 3, total: 3 }],
      total: 3,
    });
    const paid = await handlePayTableOrders(authCtx(), { tableId });
    assert.equal("paidOrderIds" in paid, true);
    if (!("paidOrderIds" in paid)) return;
    assert.ok(paid.paidOrderIds.includes(legacy.id));
    const order = (await adminDb.collection("orders").doc(legacy.id).get()).data();
    assert.equal(order?.status, "paid");
    assert.equal((await readLock(tableId))?.orderId ?? null, null);
  });

  test("merge relocates single order to main and claims main lock", async () => {
    const mainId = "lock-merge-main";
    const secId = "lock-merge-sec";
    await seedTableAndProduct(mainId, "prod-lock-mm");
    await seedTableAndProduct(secId, "prod-lock-ms");
    const onSec = await handleCreateOpenOrder(authCtx(), {
      tableId: secId,
      lines: [{ lineId: "mg1", productId: "prod-lock-ms", quantity: 1 }],
      idempotencyKey: "lock-merge-relocate-k",
    });
    assert.equal("orderId" in onSec, true);
    if (!("orderId" in onSec)) return;
    const merged = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: mainId,
      secondaryTableId: secId,
      operationId: `op-merge-${mainId}`,
      memberIds: [mainId, secId],
    });
    assert.equal("merged" in merged, true);
    if (!("merged" in merged)) return;
    assert.equal(merged.merged, true);
    assert.equal(merged.destOrderId, onSec.orderId);
    const order = (await adminDb.collection("orders").doc(onSec.orderId).get()).data();
    assert.equal(order?.tableId, mainId);
    assert.equal((await readLock(mainId))?.orderId, onSec.orderId);
    assert.equal((await readLock(secId))?.orderId ?? null, null);
  });

  test("merge combines two actives: sources merged, main lock owns dest", async () => {
    const mainId = "lock-merge2-main";
    const secId = "lock-merge2-sec";
    await seedTableAndProduct(mainId, "prod-lock-m2a");
    await seedTableAndProduct(secId, "prod-lock-m2b");
    // Productos distintos por mesa
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-lock-m2b")
      .set({ name: "B", price: 4, active: true, tipoVenta: "carta" });
    const a = await handleCreateOpenOrder(authCtx(), {
      tableId: mainId,
      lines: [{ lineId: "m2a", productId: "prod-lock-m2a", quantity: 1 }],
      idempotencyKey: "lock-merge2-a",
    });
    const b = await handleCreateOpenOrder(authCtx(), {
      tableId: secId,
      lines: [{ lineId: "m2b", productId: "prod-lock-m2b", quantity: 1 }],
      idempotencyKey: "lock-merge2-b",
    });
    assert.equal("orderId" in a && "orderId" in b, true);
    if (!("orderId" in a) || !("orderId" in b)) return;
    const merged = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: mainId,
      secondaryTableId: secId,
      operationId: "op-merge2-combine",
      memberIds: [mainId, secId],
    });
    assert.equal("merged" in merged && merged.merged, true);
    if (!("merged" in merged)) return;
    assert.equal(merged.destOrderId, a.orderId);
    const src = (await adminDb.collection("orders").doc(b.orderId).get()).data();
    assert.equal(src?.status, "merged");
    assert.equal((await readLock(mainId))?.orderId, a.orderId);
    assert.equal((await readLock(secId))?.orderId ?? null, null);
    assert.equal((await listActiveOrdersForTable(mainId)).length, 1);
    assert.equal((await listActiveOrdersForTable(secId)).length, 0);
    const groupsSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("config")
      .doc("tableGroups")
      .get();
    const groups = (groupsSnap.data()?.groups ?? {}) as Record<string, string[]>;
    assert.ok(Array.isArray(groups[mainId]));
    assert.ok(groups[mainId]!.includes(secId));
  });

  test("split Caso A: Bruschetta/Berenjena vuelven a su mesa", async () => {
    const mainId = "split-a-main";
    const secId = "split-a-sec";
    await seedTableAndProduct(mainId, "prod-split-a1", 5);
    await seedTableAndProduct(secId, "prod-split-a2", 6);
    const a = await handleCreateOpenOrder(authCtx(), {
      tableId: mainId,
      lines: [{ lineId: "bruschetta", productId: "prod-split-a1", quantity: 1 }],
      idempotencyKey: "split-a-create-1",
    });
    const b = await handleCreateOpenOrder(authCtx(), {
      tableId: secId,
      lines: [{ lineId: "berenjena", productId: "prod-split-a2", quantity: 1 }],
      idempotencyKey: "split-a-create-2",
    });
    assert.equal("orderId" in a && "orderId" in b, true);
    if (!("orderId" in a) || !("orderId" in b)) return;

    const merged = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: mainId,
      secondaryTableId: secId,
      operationId: "op-split-a-merge",
      memberIds: [mainId, secId],
    });
    assert.equal("merged" in merged && merged.merged, true);
    if (!("merged" in merged) || !merged.destOrderId) return;

    const destBefore = (
      await adminDb.collection("orders").doc(merged.destOrderId).get()
    ).data();
    const itemsBefore = Array.isArray(destBefore?.items) ? destBefore!.items : [];
    assert.ok(
      itemsBefore.every(
        (it: Record<string, unknown>) =>
          typeof it.tableGroupSourceTableId === "string" &&
          it.tableGroupSourceTableId.trim() !== "",
      ),
    );

    const split = await handleSplitTableGroupOrders(authCtx(), {
      mainTableId: mainId,
      memberIds: [mainId, secId],
      operationId: "split-a-once",
    });
    assert.equal("split" in split && split.split, true);
    if (!("split" in split)) return;

    const mainOrders = await listActiveOrdersForTable(mainId);
    const secOrders = await listActiveOrdersForTable(secId);
    assert.equal(mainOrders.length, 1);
    assert.equal(secOrders.length, 1);
    const mainItems = Array.isArray(mainOrders[0]!.data()?.items)
      ? (mainOrders[0]!.data()!.items as Record<string, unknown>[])
      : [];
    const secItems = Array.isArray(secOrders[0]!.data()?.items)
      ? (secOrders[0]!.data()!.items as Record<string, unknown>[])
      : [];
    assert.ok(mainItems.some((it) => String(it.id) === "bruschetta"));
    assert.ok(secItems.some((it) => String(it.id) === "berenjena"));
    assert.ok(!mainItems.some((it) => String(it.id) === "berenjena"));
    assert.ok(!secItems.some((it) => String(it.id) === "bruschetta"));
    assert.equal((await readLock(mainId))?.orderId, mainOrders[0]!.id);
    assert.equal((await readLock(secId))?.orderId, secOrders[0]!.id);
  });

  test("split Caso D+E: línea post-merge a main + reintento idempotente", async () => {
    const mainId = "split-de-main";
    const secId = "split-de-sec";
    await seedTableAndProduct(mainId, "prod-split-de1", 5);
    await seedTableAndProduct(secId, "prod-split-de2", 6);
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-split-de3")
      .set({ name: "Nuevo", price: 2, active: true, tipoVenta: "carta" });

    const a = await handleCreateOpenOrder(authCtx(), {
      tableId: mainId,
      lines: [{ lineId: "old-main", productId: "prod-split-de1", quantity: 1 }],
      idempotencyKey: "split-de-c1",
    });
    const b = await handleCreateOpenOrder(authCtx(), {
      tableId: secId,
      lines: [{ lineId: "old-sec", productId: "prod-split-de2", quantity: 1 }],
      idempotencyKey: "split-de-c2",
    });
    assert.equal("orderId" in a && "orderId" in b, true);
    if (!("orderId" in a) || !("orderId" in b)) return;

    const merged = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: mainId,
      secondaryTableId: secId,
      operationId: "op-split-de-merge",
      memberIds: [mainId, secId],
    });
    assert.equal("merged" in merged && merged.merged, true);
    if (!("merged" in merged) || !merged.destOrderId) return;

    const upserted = await handleUpsertSaleLines(authCtx(), {
      orderId: merged.destOrderId,
      lines: [{ lineId: "nuevo-post", productId: "prod-split-de3", quantity: 1 }],
      markSent: false,
      idempotencyKey: "split-de-upsert",
    });
    assert.equal("orderId" in upserted, true);

    const split1 = await handleSplitTableGroupOrders(authCtx(), {
      mainTableId: mainId,
      memberIds: [mainId, secId],
      operationId: "split-de-retry",
    });
    const split2 = await handleSplitTableGroupOrders(authCtx(), {
      mainTableId: mainId,
      memberIds: [mainId, secId],
      operationId: "split-de-retry",
    });
    assert.equal("split" in split1 && split1.split, true);
    assert.equal("split" in split2 && split2.split, true);
    if (!("ordersByTableId" in split1) || !("ordersByTableId" in split2)) return;
    assert.deepEqual(split1.ordersByTableId, split2.ordersByTableId);

    const mainOrders = await listActiveOrdersForTable(mainId);
    const secOrders = await listActiveOrdersForTable(secId);
    assert.equal(mainOrders.length, 1);
    assert.equal(secOrders.length, 1);
    const mainItems = (mainOrders[0]!.data()?.items ?? []) as Record<
      string,
      unknown
    >[];
    const secItems = (secOrders[0]!.data()?.items ?? []) as Record<
      string,
      unknown
    >[];
    assert.ok(mainItems.some((it) => String(it.id) === "nuevo-post"));
    assert.ok(mainItems.some((it) => String(it.id) === "old-main"));
    assert.ok(secItems.some((it) => String(it.id) === "old-sec"));
    assert.equal(await listActiveOrdersForTable(mainId).then((x) => x.length), 1);
    assert.equal(await listActiveOrdersForTable(secId).then((x) => x.length), 1);
  });

  test("split Caso F: provenance insuficiente aborta", async () => {
    const mainId = "split-f-main";
    const secId = "split-f-sec";
    await seedTableAndProduct(mainId, "prod-split-f1", 5);
    await seedTableAndProduct(secId, "prod-split-f2", 6);
    const a = await handleCreateOpenOrder(authCtx(), {
      tableId: mainId,
      lines: [{ lineId: "lf1", productId: "prod-split-f1", quantity: 1 }],
      idempotencyKey: "split-f-c1",
    });
    const b = await handleCreateOpenOrder(authCtx(), {
      tableId: secId,
      lines: [{ lineId: "lf2", productId: "prod-split-f2", quantity: 1 }],
      idempotencyKey: "split-f-c2",
    });
    assert.equal("orderId" in a && "orderId" in b, true);
    if (!("orderId" in a) || !("orderId" in b)) return;

    const merged = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: mainId,
      secondaryTableId: secId,
      operationId: "op-split-f-merge",
      memberIds: [mainId, secId],
    });
    assert.equal("merged" in merged && merged.merged, true);
    if (!("merged" in merged) || !merged.destOrderId) return;

    // Simula legacy: borra provenance de todas las líneas.
    const destRef = adminDb.collection("orders").doc(merged.destOrderId);
    const dest = (await destRef.get()).data() as Record<string, unknown>;
    const stripped = (Array.isArray(dest.items) ? dest.items : []).map(
      (raw: Record<string, unknown>) => {
        const next = { ...raw };
        delete next.tableGroupSourceTableId;
        delete next.tableGroupSourceOrderId;
        return next;
      },
    );
    await destRef.update({ items: stripped });

    const split = await handleSplitTableGroupOrders(authCtx(), {
      mainTableId: mainId,
      memberIds: [mainId, secId],
      operationId: "split-f-abort",
    });
    assert.equal("error" in split && split.error, "PROVENANCE_INSUFFICIENT");
    // No concentrar: sigue un solo activo en main (sin redistribuir).
    assert.equal((await listActiveOrdersForTable(mainId)).length, 1);
    assert.equal((await listActiveOrdersForTable(secId)).length, 0);
    // Fallo no altera topología
    const groupsSnap = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("config")
      .doc("tableGroups")
      .get();
    const groups = (groupsSnap.data()?.groups ?? {}) as Record<string, string[]>;
    assert.ok(groups[mainId]?.includes(secId));
  });

  test("atomic join/split: groups+locks; KDS rejects merged; replay conflict; 3 mesas", async () => {
    const t1 = "atom-t1";
    const t2 = "atom-t2";
    const t3 = "atom-t3";
    await seedTableAndProduct(t1, "prod-atom-1", 5);
    await seedTableAndProduct(t2, "prod-atom-2", 6);
    await seedTableAndProduct(t3, "prod-atom-3", 7);
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-atom-2")
      .set({ name: "P2", price: 3, active: true, tipoVenta: "carta" });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-atom-3")
      .set({ name: "P3", price: 4, active: true, tipoVenta: "carta" });

    const o1 = await handleCreateOpenOrder(authCtx(), {
      tableId: t1,
      lines: [{ lineId: "a1", productId: "prod-atom-1", quantity: 1 }],
      idempotencyKey: "atom-c1",
    });
    const o2 = await handleCreateOpenOrder(authCtx(), {
      tableId: t2,
      lines: [{ lineId: "a2", productId: "prod-atom-2", quantity: 1 }],
      idempotencyKey: "atom-c2",
    });
    const o3 = await handleCreateOpenOrder(authCtx(), {
      tableId: t3,
      lines: [{ lineId: "a3", productId: "prod-atom-3", quantity: 1 }],
      idempotencyKey: "atom-c3",
    });
    assert.equal("orderId" in o1 && "orderId" in o2 && "orderId" in o3, true);
    if (!("orderId" in o1) || !("orderId" in o2) || !("orderId" in o3)) return;

    const stockBefore = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .get();
    const stockCountBefore = stockBefore.size;

    const m12 = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: t1,
      secondaryTableId: t2,
      operationId: "atom-join-12",
    });
    assert.equal("merged" in m12 && m12.merged, true);

    const m13 = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: t1,
      secondaryTableId: t3,
      operationId: "atom-join-13",
      memberIds: [t1, t2, t3],
    });
    assert.equal("merged" in m13 && m13.merged, true);
    if (!("merged" in m13) || !m13.destOrderId) return;

    // Pedido origen merged no editable
    const kds = await handleTransitionLineStatus(authCtx(), {
      orderId: o2.orderId,
      lineId: "a2",
      expectedStatus: "pending",
      nextStatus: "preparing",
      idempotencyKey: "atom-kds-merged",
    });
    assert.equal("error" in kds && kds.error, "ORDER_NOT_EDITABLE");

    // Replay incompatible (mismo operationId, payload distinto)
    const replayBad = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: t1,
      secondaryTableId: t3,
      operationId: "atom-join-12",
    });
    assert.equal("error" in replayBad && replayBad.error, "IDEMPOTENCY_CONFLICT");

    // Separación progresiva sin memberIds cliente (Firestore autoritativo)
    const sepB = await handleSplitTableGroupOrders(authCtx(), {
      mainTableId: t1,
      separateTableId: t2,
      operationId: "atom-sep-b",
    });
    assert.equal("split" in sepB && sepB.split, true);

    const afterBGroups = (
      await adminDb
        .collection("restaurants")
        .doc(RESTAURANT_A)
        .collection("config")
        .doc("tableGroups")
        .get()
    ).data()?.groups as Record<string, string[]>;
    assert.ok(afterBGroups[t1]?.includes(t3));
    assert.ok(!afterBGroups[t1]?.includes(t2));

    // memberIds en orden distinto no deben abortar
    const sepRest = await handleSplitTableGroupOrders(authCtx(), {
      mainTableId: t1,
      memberIds: [t3, t1],
      operationId: "atom-sep-rest",
    });
    assert.equal("split" in sepRest && sepRest.split, true);

    assert.equal((await listActiveOrdersForTable(t1)).length, 1);
    assert.equal((await listActiveOrdersForTable(t2)).length, 1);
    assert.equal((await listActiveOrdersForTable(t3)).length, 1);

    const stockAfter = await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("stockMovements")
      .get();
    assert.equal(stockAfter.size, stockCountBefore);

    const foreign = await handleMergeTableGroupOrders(
      {
        ...authCtx(),
        restaurantId: "rest-other-tenant",
      },
      {
        mainTableId: t1,
        secondaryTableId: t2,
        operationId: "atom-x-tenant",
      },
    );
    assert.equal(
      "error" in foreign &&
        (foreign.error === "TABLE_TENANT_MISMATCH" ||
          foreign.error === "TABLE_NOT_FOUND" ||
          foreign.error === "FORBIDDEN"),
      true,
    );
  });

  test("regresión SPLIT_TABLE_GROUP_FAILED: join→split sin query mergedIntoOrderId", async () => {
    const a = "reg-split-fail-a";
    const b = "reg-split-fail-b";
    await seedTableAndProduct(a, "prod-reg-sf-a", 5);
    await seedTableAndProduct(b, "prod-reg-sf-b", 6);
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-reg-sf-b")
      .set({ name: "SF-B", price: 6, active: true, tipoVenta: "carta" });

    const oa = await handleCreateOpenOrder(authCtx(), {
      tableId: a,
      lines: [{ lineId: "sf-a", productId: "prod-reg-sf-a", quantity: 1 }],
      idempotencyKey: "reg-sf-create-a",
    });
    const ob = await handleCreateOpenOrder(authCtx(), {
      tableId: b,
      lines: [{ lineId: "sf-b", productId: "prod-reg-sf-b", quantity: 1 }],
      idempotencyKey: "reg-sf-create-b",
    });
    assert.equal("orderId" in oa && "orderId" in ob, true);
    if (!("orderId" in oa) || !("orderId" in ob)) return;

    // Enviar líneas (como en el escenario real)
    const sentA = await handleUpsertSaleLines(authCtx(), {
      orderId: oa.orderId,
      lines: [{ lineId: "sf-a", productId: "prod-reg-sf-a", quantity: 1 }],
      markSent: true,
      idempotencyKey: "reg-sf-send-a",
    });
    const sentB = await handleUpsertSaleLines(authCtx(), {
      orderId: ob.orderId,
      lines: [{ lineId: "sf-b", productId: "prod-reg-sf-b", quantity: 1 }],
      markSent: true,
      idempotencyKey: "reg-sf-send-b",
    });
    assert.equal("orderId" in sentA && "orderId" in sentB, true);

    const joined = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: a,
      secondaryTableId: b,
      operationId: "reg-sf-join",
    });
    assert.equal("merged" in joined && joined.merged, true);
    if (!("merged" in joined) || !joined.destOrderId) return;

    // Payload reducido exacto del cliente actual
    const split = await handleSplitTableGroupOrders(authCtx(), {
      mainTableId: a,
      operationId: "reg-sf-split",
    });
    assert.equal("error" in split, false, JSON.stringify(split));
    assert.equal("split" in split && split.split, true);
    if (!("split" in split)) return;

    const ordersA = await listActiveOrdersForTable(a);
    const ordersB = await listActiveOrdersForTable(b);
    assert.equal(ordersA.length, 1);
    assert.equal(ordersB.length, 1);
    const itemsA = (ordersA[0]!.data()?.items ?? []) as Record<string, unknown>[];
    const itemsB = (ordersB[0]!.data()?.items ?? []) as Record<string, unknown>[];
    assert.ok(itemsA.some((it) => String(it.id) === "sf-a"));
    assert.ok(itemsB.some((it) => String(it.id) === "sf-b"));
    assert.equal(
      String(ordersA[0]!.data()?.status ?? "").toLowerCase(),
      "open",
    );
    assert.equal(
      String(ordersB[0]!.data()?.status ?? "").toLowerCase(),
      "open",
    );
    assert.equal((await readLock(a))?.orderId, ordersA[0]!.id);
    assert.equal((await readLock(b))?.orderId, ordersB[0]!.id);

    const groups = (
      await adminDb
        .collection("restaurants")
        .doc(RESTAURANT_A)
        .collection("config")
        .doc("tableGroups")
        .get()
    ).data()?.groups as Record<string, string[]>;
    assert.equal(groups?.[a], undefined);

    // Fuentes merged no deben quedar activas
    const srcB = (await adminDb.collection("orders").doc(ob.orderId).get()).data();
    // Puede ser el mismo pedido reabierto (open) o residual; si es el reabierto, ok.
    if (srcB && String(srcB.status).toLowerCase() === "merged") {
      assert.fail("pedido origen sigue merged tras split");
    }
  });

  test("join→split e2e inmediato sin memberIds cliente", async () => {
    const a = "e2e-join-split-a";
    const b = "e2e-join-split-b";
    await seedTableAndProduct(a, "prod-e2e-a", 5);
    await seedTableAndProduct(b, "prod-e2e-b", 6);
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-e2e-b")
      .set({ name: "E2E-B", price: 6, active: true, tipoVenta: "carta" });

    const oa = await handleCreateOpenOrder(authCtx(), {
      tableId: a,
      lines: [{ lineId: "e2e-la", productId: "prod-e2e-a", quantity: 1 }],
      idempotencyKey: "e2e-create-a",
    });
    const ob = await handleCreateOpenOrder(authCtx(), {
      tableId: b,
      lines: [{ lineId: "e2e-lb", productId: "prod-e2e-b", quantity: 1 }],
      idempotencyKey: "e2e-create-b",
    });
    assert.equal("orderId" in oa && "orderId" in ob, true);
    if (!("orderId" in oa) || !("orderId" in ob)) return;

    const joined = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: a,
      secondaryTableId: b,
      operationId: "e2e-join-op",
    });
    assert.equal("merged" in joined && joined.merged, true);
    if (!("merged" in joined)) return;

    // Doble toque / reintento idempotente de split
    const split1 = await handleSplitTableGroupOrders(authCtx(), {
      mainTableId: a,
      operationId: "e2e-split-op",
    });
    const split2 = await handleSplitTableGroupOrders(authCtx(), {
      mainTableId: a,
      operationId: "e2e-split-op",
    });
    assert.equal("split" in split1 && split1.split, true);
    assert.equal("split" in split2 && split2.split, true);

    assert.equal((await listActiveOrdersForTable(a)).length, 1);
    assert.equal((await listActiveOrdersForTable(b)).length, 1);
    const itemsA = ((await listActiveOrdersForTable(a))[0]!.data()?.items ??
      []) as Record<string, unknown>[];
    const itemsB = ((await listActiveOrdersForTable(b))[0]!.data()?.items ??
      []) as Record<string, unknown>[];
    assert.ok(itemsA.some((it) => String(it.id) === "e2e-la"));
    assert.ok(itemsB.some((it) => String(it.id) === "e2e-lb"));

    const groups = (
      await adminDb
        .collection("restaurants")
        .doc(RESTAURANT_A)
        .collection("config")
        .doc("tableGroups")
        .get()
    ).data()?.groups as Record<string, string[]>;
    assert.equal(groups?.[a], undefined);

    // Nuevo operationId tras grupo ya separado → GROUP_NOT_FOUND (no oculta error real)
    const splitAgain = await handleSplitTableGroupOrders(authCtx(), {
      mainTableId: a,
      operationId: "e2e-split-again",
    });
    assert.equal("error" in splitAgain && splitAgain.error, "GROUP_NOT_FOUND");
  });

  test("C/D split replay idempotente con separateTableId + GROUP_NOT_FOUND en op nueva", async () => {
    const a = "idem-split-a";
    const b = "idem-split-b";
    await seedTableAndProduct(a, "prod-idem-a", 5);
    await seedTableAndProduct(b, "prod-idem-b", 6);
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_A)
      .collection("products")
      .doc("prod-idem-b")
      .set({ name: "IDEM-B", price: 6, active: true, tipoVenta: "carta" });

    const oa = await handleCreateOpenOrder(authCtx(), {
      tableId: a,
      lines: [{ lineId: "idem-la", productId: "prod-idem-a", quantity: 1 }],
      idempotencyKey: "idem-create-a",
    });
    const ob = await handleCreateOpenOrder(authCtx(), {
      tableId: b,
      lines: [{ lineId: "idem-lb", productId: "prod-idem-b", quantity: 1 }],
      idempotencyKey: "idem-create-b",
    });
    assert.equal("orderId" in oa && "orderId" in ob, true);
    if (!("orderId" in oa) || !("orderId" in ob)) return;

    const joined = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: a,
      secondaryTableId: b,
      operationId: "idem-join-op",
    });
    assert.equal("merged" in joined && joined.merged, true);

    const payload = {
      mainTableId: a,
      separateTableId: b,
      operationId: "same-id",
    } as const;
    const r1 = await handleSplitTableGroupOrders(authCtx(), payload);
    const r2 = await handleSplitTableGroupOrders(authCtx(), payload);
    assert.equal("error" in r1, false, JSON.stringify(r1));
    assert.equal("error" in r2, false, JSON.stringify(r2));
    assert.equal("split" in r1 && r1.split, true);
    assert.equal("split" in r2 && r2.split, true);
    if ("split" in r2) {
      assert.equal(r2.reason, "idempotent_replay");
    }

    const r3 = await handleSplitTableGroupOrders(authCtx(), {
      mainTableId: a,
      separateTableId: b,
      operationId: "different-id-after-done",
    });
    assert.equal("error" in r3 && r3.error, "GROUP_NOT_FOUND");
  });
});
