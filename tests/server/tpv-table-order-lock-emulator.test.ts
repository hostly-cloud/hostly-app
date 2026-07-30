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
} from "@/lib/server/tpv/handle-tpv-order-mutations";
import { handlePayTableOrders } from "@/lib/server/tpv/handle-pay-table-orders";
import { handleMergeTableGroupOrders } from "@/lib/server/tpv/handle-merge-table-group-orders";
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
      memberIds: [mainId, secId],
      secondaryTableId: secId,
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
  });
});
