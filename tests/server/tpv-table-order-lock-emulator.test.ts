import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, type Firestore as AdminFirestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import {
  handleCreateOpenOrder,
  handleUpsertSaleLines,
} from "@/lib/server/tpv/handle-tpv-order-mutations";
import {
  handleAutoCloseEmptyTable,
  handleCloseOrder,
  handleFinalizeTableAfterPayment,
  handleReopenOrder,
} from "@/lib/server/tpv/handle-tpv-order-lifecycle";
import { handleMergeTableGroupOrders } from "@/lib/server/tpv/handle-merge-table-group-orders";
import { handleSplitTableGroupOrders } from "@/lib/server/tpv/handle-split-table-group-orders";
import { isActiveOrderStatus } from "@/lib/server/tpv/table-group-order-utils";
import {
  sortTableIdsForLockAcquisition,
  tableOrderLockRef,
  writeTableOrderLockClaim,
  writeTableOrderLockRelease,
} from "@/lib/server/tpv/table-order-lock";

const RESTAURANT_A = "rest-a-lock";
const RESTAURANT_B = "rest-b-lock";
const MANAGER_UID = "manager-lock-a";

let testEnv: RulesTestEnvironment;
let adminApp: App;
let adminDb: AdminFirestore;

function authCtx(
  restaurantId = RESTAURANT_A,
  role = "manager",
): AuthenticatedRestaurantContext {
  return {
    uid: MANAGER_UID,
    email: "manager-lock@example.test",
    emailVerified: true,
    restaurantId,
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

async function listActiveOrdersForTable(tableId: string, restaurantId = RESTAURANT_A) {
  const snap = await adminDb
    .collection("orders")
    .where("restaurantId", "==", restaurantId)
    .where("tableId", "==", tableId)
    .get();
  return snap.docs.filter((d) => isActiveOrderStatus(d.data()?.status));
}

async function readLock(tableId: string, restaurantId = RESTAURANT_A) {
  const snap = await tableOrderLockRef(adminDb, restaurantId, tableId).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

describe("tpv table order lock emulator", () => {
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

  test("1. lock nuevo válido en create-open", async () => {
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
    assert.equal(lock?.claimedByUid, MANAGER_UID);
    assert.equal(lock?.lastOperation, "create_open");
    assert.equal((await listActiveOrdersForTable(tableId)).length, 1);
  });

  test("2. reintento mismo idempotencyKey", async () => {
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

  test("3+11. create-open concurrente → un solo pedido activo", async () => {
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
      .filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof handleCreateOpenOrder>>> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value)
      .filter((v) => "orderId" in v);
    assert.equal(oks.length, 2);
    const orderIds = new Set(oks.map((o) => ("orderId" in o ? o.orderId : "")));
    assert.equal(orderIds.size, 1);
    const onlyId = [...orderIds][0]!;
    const actives = await listActiveOrdersForTable(tableId);
    assert.equal(actives.length, 1);
    assert.equal(actives[0]!.id, onlyId);
    assert.equal((await readLock(tableId))?.orderId, onlyId);
  });

  test("4+5. misma mesa reutiliza pedido; no crea segundo activo", async () => {
    const tableId = "lock-reuse";
    await seedTableAndProduct(tableId, "prod-lock-reuse");
    const first = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "r1", productId: "prod-lock-reuse", quantity: 1 }],
      idempotencyKey: "lock-reuse-1",
    });
    assert.equal("orderId" in first, true);
    if (!("orderId" in first)) return;
    const second = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "r2", productId: "prod-lock-reuse", quantity: 1 }],
      idempotencyKey: "lock-reuse-2",
    });
    assert.equal("orderId" in second, true);
    if (!("orderId" in second)) return;
    assert.equal(second.orderId, first.orderId);
    assert.equal(second.reusedExistingOrder, true);
    assert.equal((await listActiveOrdersForTable(tableId)).length, 1);
  });

  test("6. restaurante distinto no ve lock ajeno", async () => {
    const tableId = "lock-tenant";
    await seedTableAndProduct(tableId, "prod-lock-tenant");
    await adminDb.collection("tables").doc(`${tableId}-b`).set({
      restaurantId: RESTAURANT_B,
      name: tableId,
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_B)
      .collection("products")
      .doc("prod-b")
      .set({ name: "prod-b", price: 2, active: true, tipoVenta: "carta" });

    const a = await handleCreateOpenOrder(authCtx(RESTAURANT_A), {
      tableId,
      lines: [{ lineId: "ta", productId: "prod-lock-tenant", quantity: 1 }],
      idempotencyKey: "lock-tenant-a",
    });
    assert.equal("orderId" in a, true);
    if (!("orderId" in a)) return;

    const b = await handleCreateOpenOrder(authCtx(RESTAURANT_B), {
      tableId: `${tableId}-b`,
      lines: [{ lineId: "tb", productId: "prod-b", quantity: 1 }],
      idempotencyKey: "lock-tenant-b",
    });
    assert.equal("orderId" in b, true);
    if (!("orderId" in b)) return;
    assert.notEqual(a.orderId, b.orderId);
    assert.equal((await readLock(tableId, RESTAURANT_A))?.orderId, a.orderId);
    assert.equal((await readLock(`${tableId}-b`, RESTAURANT_B))?.orderId, b.orderId);
    assert.equal((await listActiveOrdersForTable(tableId, RESTAURANT_A)).length, 1);
    assert.equal((await listActiveOrdersForTable(`${tableId}-b`, RESTAURANT_B)).length, 1);
  });

  test("7. mesa distinta no comparte lock", async () => {
    await seedTableAndProduct("lock-t1", "prod-lock-t");
    await seedTableAndProduct("lock-t2", "prod-lock-t");
    const a = await handleCreateOpenOrder(authCtx(), {
      tableId: "lock-t1",
      lines: [{ lineId: "t1a", productId: "prod-lock-t", quantity: 1 }],
      idempotencyKey: "lock-t1-k",
    });
    const b = await handleCreateOpenOrder(authCtx(), {
      tableId: "lock-t2",
      lines: [{ lineId: "t2a", productId: "prod-lock-t", quantity: 1 }],
      idempotencyKey: "lock-t2-k",
    });
    assert.equal("orderId" in a && "orderId" in b, true);
    if (!("orderId" in a) || !("orderId" in b)) return;
    assert.notEqual(a.orderId, b.orderId);
    assert.equal((await readLock("lock-t1"))?.orderId, a.orderId);
    assert.equal((await readLock("lock-t2"))?.orderId, b.orderId);
  });

  test("8. lock huérfano / pedido terminal se repara (política equivalente a expirado)", async () => {
    const tableId = "lock-orphan";
    await seedTableAndProduct(tableId, "prod-lock-orphan");
    const ghostId = "ghost-order-missing";
    await adminDb.runTransaction(async (tx) => {
      writeTableOrderLockClaim(tx, tableOrderLockRef(adminDb, RESTAURANT_A, tableId), {
        restaurantId: RESTAURANT_A,
        tableId,
        orderId: ghostId,
        create: true,
        claimedByUid: "old",
        lastOperation: "stale",
      });
    });
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "or1", productId: "prod-lock-orphan", quantity: 1 }],
      idempotencyKey: "lock-orphan-k",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    assert.notEqual(created.orderId, ghostId);
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
  });

  test("9. close libera lock", async () => {
    const tableId = "lock-close-ok";
    await seedTableAndProduct(tableId, "prod-lock-close");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "cl1", productId: "prod-lock-close", quantity: 1 }],
      idempotencyKey: "lock-close-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    // Vaciar total para permitir close sin cobro.
    await adminDb.collection("orders").doc(created.orderId).update({
      items: [],
      total: 0,
    });
    const closed = await handleCloseOrder(authCtx(), {
      orderId: created.orderId,
      idempotencyKey: "lock-close-k",
    });
    assert.equal("orderId" in closed, true);
    const lock = await readLock(tableId);
    assert.equal(lock?.orderId ?? null, null);
    assert.equal(lock?.lastOperation, "close_order");
  });

  test("10. close fallido conserva lock", async () => {
    const tableId = "lock-close-fail";
    await seedTableAndProduct(tableId, "prod-lock-close-fail", 12);
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "cf1", productId: "prod-lock-close-fail", quantity: 1 }],
      idempotencyKey: "lock-close-fail-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const failed = await handleCloseOrder(authCtx(), {
      orderId: created.orderId,
      idempotencyKey: "lock-close-fail-k",
    });
    assert.equal("error" in failed, true);
    if (!("error" in failed)) return;
    assert.equal(failed.error, "UNPAID_BALANCE");
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
  });

  test("12+13. merge varias mesas + orden determinista de adquisición", async () => {
    const mainId = "lock-merge-main";
    const sideId = "lock-merge-side";
    await seedTableAndProduct(mainId, "prod-lock-merge");
    await seedTableAndProduct(sideId, "prod-lock-merge");
    const ordered = sortTableIdsForLockAcquisition([sideId, mainId]);
    assert.deepEqual(ordered, [mainId, sideId].sort((a, b) => a.localeCompare(b)));

    const mainOrder = await handleCreateOpenOrder(authCtx(), {
      tableId: mainId,
      lines: [{ lineId: "mm1", productId: "prod-lock-merge", quantity: 1 }],
      idempotencyKey: "lock-merge-main-k",
    });
    const sideOrder = await handleCreateOpenOrder(authCtx(), {
      tableId: sideId,
      lines: [{ lineId: "ms1", productId: "prod-lock-merge", quantity: 1 }],
      idempotencyKey: "lock-merge-side-k",
    });
    assert.equal("orderId" in mainOrder && "orderId" in sideOrder, true);
    if (!("orderId" in mainOrder) || !("orderId" in sideOrder)) return;

    const merged = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: mainId,
      memberTableIds: [sideId, mainId],
      idempotencyKey: "lock-merge-k",
    });
    assert.equal("merged" in merged, true);
    if (!("merged" in merged)) return;
    assert.equal(merged.merged, true);
    assert.equal(merged.destOrderId, mainOrder.orderId);
    assert.equal((await readLock(mainId))?.orderId, mainOrder.orderId);
    assert.equal((await readLock(sideId))?.orderId ?? null, null);
    assert.equal((await listActiveOrdersForTable(mainId)).length, 1);
    assert.equal((await listActiveOrdersForTable(sideId)).length, 0);
  });

  test("14. integridad lock corrupto aborta (rollback sin ownership parcial)", async () => {
    const tableId = "lock-corrupt";
    await seedTableAndProduct(tableId, "prod-lock-corrupt");
    await adminDb.runTransaction(async (tx) => {
      tx.set(tableOrderLockRef(adminDb, RESTAURANT_A, tableId), {
        restaurantId: RESTAURANT_B,
        tableId,
        orderId: "x",
      });
    });
    const result = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "cx1", productId: "prod-lock-corrupt", quantity: 1 }],
      idempotencyKey: "lock-corrupt-k",
    });
    assert.equal("error" in result, true);
    if (!("error" in result)) return;
    assert.equal(result.error, "LOCK_TENANT_MISMATCH");
    assert.equal((await listActiveOrdersForTable(tableId)).length, 0);
  });

  test("15+16. split reclama ownership restaurado sin parcialidad", async () => {
    const mainId = "lock-split-main";
    const sideId = "lock-split-side";
    await seedTableAndProduct(mainId, "prod-lock-split");
    await seedTableAndProduct(sideId, "prod-lock-split");

    const mainOrder = await handleCreateOpenOrder(authCtx(), {
      tableId: mainId,
      lines: [{ lineId: "spm1", productId: "prod-lock-split", quantity: 1 }],
      idempotencyKey: "lock-split-main-k",
    });
    const sideOrder = await handleCreateOpenOrder(authCtx(), {
      tableId: sideId,
      lines: [{ lineId: "sps1", productId: "prod-lock-split", quantity: 1 }],
      idempotencyKey: "lock-split-side-k",
    });
    assert.equal("orderId" in mainOrder && "orderId" in sideOrder, true);
    if (!("orderId" in mainOrder) || !("orderId" in sideOrder)) return;

    const merged = await handleMergeTableGroupOrders(authCtx(), {
      mainTableId: mainId,
      memberTableIds: [mainId, sideId],
      idempotencyKey: "lock-split-merge-k",
    });
    assert.equal("merged" in merged && merged.merged === true, true);

    const split = await handleSplitTableGroupOrders(authCtx(), {
      mainTableId: mainId,
      removedTableIds: [sideId],
      remainingTableIds: [mainId],
      idempotencyKey: "lock-split-k",
    });
    assert.equal("restored" in split, true);
    if (!("restored" in split)) return;
    assert.equal(split.restored, true);
    assert.ok(split.restoredOrderIds.includes(sideOrder.orderId));
    assert.equal((await readLock(mainId))?.orderId, mainOrder.orderId);
    assert.equal((await readLock(sideId))?.orderId, sideOrder.orderId);
    // provenance: mergedInto limpio en restaurado
    const restored = (await adminDb.collection("orders").doc(sideOrder.orderId).get()).data();
    assert.equal(restored?.mergedIntoOrderId ?? null, null);
    assert.equal(isActiveOrderStatus(restored?.status), true);
  });

  test("17+18. no doble activo; finalize libera lock", async () => {
    const tableId = "lock-finalize";
    await seedTableAndProduct(tableId, "prod-lock-fin");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "fin1", productId: "prod-lock-fin", quantity: 1 }],
      idempotencyKey: "lock-fin-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({
      items: [],
      total: 0,
      status: "paid",
    });
    const finalized = await handleFinalizeTableAfterPayment(authCtx(), {
      tableId,
      idempotencyKey: "lock-fin-k",
    });
    assert.equal("tableId" in finalized, true);
    if (!("tableId" in finalized)) return;
    assert.equal(finalized.tableStatus, "free");
    assert.equal((await readLock(tableId))?.orderId ?? null, null);
    assert.equal((await listActiveOrdersForTable(tableId)).length, 0);
  });

  test("R1. reopen adquiere lock", async () => {
    const tableId = "lock-reopen-claim";
    await seedTableAndProduct(tableId, "prod-lock-reopen-1");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ro1", productId: "prod-lock-reopen-1", quantity: 1 }],
      idempotencyKey: "lock-reopen-1-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({
      items: [],
      total: 0,
    });
    const closed = await handleCloseOrder(authCtx(), {
      orderId: created.orderId,
      idempotencyKey: "lock-reopen-1-close",
    });
    assert.equal("orderId" in closed, true);
    assert.equal((await readLock(tableId))?.orderId ?? null, null);

    const reopened = await handleReopenOrder(authCtx(), {
      orderId: created.orderId,
      idempotencyKey: "lock-reopen-1-k",
    });
    assert.equal("orderId" in reopened, true);
    if (!("orderId" in reopened)) return;
    assert.equal(reopened.status, "open");
    const lock = await readLock(tableId);
    assert.equal(lock?.orderId, created.orderId);
    assert.equal(lock?.lastOperation, "reopen_order");
    assert.equal((await listActiveOrdersForTable(tableId)).length, 1);
  });

  test("R2. reopen con lock del mismo pedido es idempotente", async () => {
    const tableId = "lock-reopen-idem-lock";
    await seedTableAndProduct(tableId, "prod-lock-reopen-2");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ro2", productId: "prod-lock-reopen-2", quantity: 1 }],
      idempotencyKey: "lock-reopen-2-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({
      items: [],
      total: 0,
    });
    await handleCloseOrder(authCtx(), {
      orderId: created.orderId,
      idempotencyKey: "lock-reopen-2-close",
    });
    const first = await handleReopenOrder(authCtx(), {
      orderId: created.orderId,
      idempotencyKey: "lock-reopen-2-k",
    });
    const second = await handleReopenOrder(authCtx(), {
      orderId: created.orderId,
      idempotencyKey: "lock-reopen-2-again",
    });
    assert.equal("orderId" in first && "orderId" in second, true);
    if (!("orderId" in first) || !("orderId" in second)) return;
    assert.equal(first.orderId, second.orderId);
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
    assert.equal((await listActiveOrdersForTable(tableId)).length, 1);
  });

  test("R3. reopen con lock de otro pedido activo → conflicto", async () => {
    const tableId = "lock-reopen-conflict";
    await seedTableAndProduct(tableId, "prod-lock-reopen-3");
    const closedOrder = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ro3a", productId: "prod-lock-reopen-3", quantity: 1 }],
      idempotencyKey: "lock-reopen-3-a",
    });
    assert.equal("orderId" in closedOrder, true);
    if (!("orderId" in closedOrder)) return;
    await adminDb.collection("orders").doc(closedOrder.orderId).update({
      items: [],
      total: 0,
    });
    await handleCloseOrder(authCtx(), {
      orderId: closedOrder.orderId,
      idempotencyKey: "lock-reopen-3-close",
    });

    const other = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ro3b", productId: "prod-lock-reopen-3", quantity: 1 }],
      idempotencyKey: "lock-reopen-3-b",
    });
    assert.equal("orderId" in other, true);
    if (!("orderId" in other)) return;

    const result = await handleReopenOrder(authCtx(), {
      orderId: closedOrder.orderId,
      idempotencyKey: "lock-reopen-3-k",
    });
    assert.equal("error" in result, true);
    if (!("error" in result)) return;
    assert.equal(
      result.error === "TABLE_ORDER_LOCK_CONFLICT" ||
        result.error === "MULTIPLE_ACTIVE_ORDERS_FOR_TABLE",
      true,
    );
    assert.equal((await readLock(tableId))?.orderId, other.orderId);
    const closedSnap = await adminDb.collection("orders").doc(closedOrder.orderId).get();
    assert.equal(String(closedSnap.data()?.status ?? ""), "closed");
  });

  test("R4. reopen con otro pedido activo aborta", async () => {
    const tableId = "lock-reopen-multi";
    await seedTableAndProduct(tableId, "prod-lock-reopen-4");
    const a = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ro4a", productId: "prod-lock-reopen-4", quantity: 1 }],
      idempotencyKey: "lock-reopen-4-a",
    });
    assert.equal("orderId" in a, true);
    if (!("orderId" in a)) return;
    await adminDb.collection("orders").doc(a.orderId).update({
      items: [],
      total: 0,
      status: "closed",
      closedAt: Date.now(),
    });
    // Forzar segundo activo sin pasar por create-open reuse.
    const bRef = adminDb.collection("orders").doc();
    await bRef.set({
      restaurantId: RESTAURANT_A,
      tableId,
      status: "open",
      items: [],
      total: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await adminDb.runTransaction(async (tx) => {
      writeTableOrderLockRelease(tx, tableOrderLockRef(adminDb, RESTAURANT_A, tableId), {
        restaurantId: RESTAURANT_A,
        tableId,
        lastOperation: "forced_free",
      });
      writeTableOrderLockClaim(tx, tableOrderLockRef(adminDb, RESTAURANT_A, tableId), {
        restaurantId: RESTAURANT_A,
        tableId,
        orderId: bRef.id,
        create: false,
        lastOperation: "seed_active",
      });
    });

    const result = await handleReopenOrder(authCtx(), {
      orderId: a.orderId,
      idempotencyKey: "lock-reopen-4-k",
    });
    assert.equal("error" in result, true);
    if (!("error" in result)) return;
    assert.equal(
      result.error === "MULTIPLE_ACTIVE_ORDERS_FOR_TABLE" ||
        result.error === "TABLE_ORDER_LOCK_CONFLICT",
      true,
    );
    const aSnap = await adminDb.collection("orders").doc(a.orderId).get();
    assert.equal(String(aSnap.data()?.status ?? ""), "closed");
  });

  test("R5. reopen no deja pedido abierto si falla el claim (lock corrupto)", async () => {
    const tableId = "lock-reopen-rollback";
    await seedTableAndProduct(tableId, "prod-lock-reopen-5");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ro5", productId: "prod-lock-reopen-5", quantity: 1 }],
      idempotencyKey: "lock-reopen-5-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({
      items: [],
      total: 0,
    });
    await handleCloseOrder(authCtx(), {
      orderId: created.orderId,
      idempotencyKey: "lock-reopen-5-close",
    });
    await adminDb.runTransaction(async (tx) => {
      tx.set(tableOrderLockRef(adminDb, RESTAURANT_A, tableId), {
        restaurantId: RESTAURANT_B,
        tableId,
        orderId: null,
      });
    });
    const result = await handleReopenOrder(authCtx(), {
      orderId: created.orderId,
      idempotencyKey: "lock-reopen-5-k",
    });
    assert.equal("error" in result, true);
    if (!("error" in result)) return;
    assert.equal(result.error, "LOCK_TENANT_MISMATCH");
    const snap = await adminDb.collection("orders").doc(created.orderId).get();
    assert.equal(String(snap.data()?.status ?? ""), "closed");
  });

  test("R6. restaurante distinto no reabre pedido ajeno", async () => {
    const tableId = "lock-reopen-tenant";
    await seedTableAndProduct(tableId, "prod-lock-reopen-6");
    const created = await handleCreateOpenOrder(authCtx(RESTAURANT_A), {
      tableId,
      lines: [{ lineId: "ro6", productId: "prod-lock-reopen-6", quantity: 1 }],
      idempotencyKey: "lock-reopen-6-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({
      items: [],
      total: 0,
    });
    await handleCloseOrder(authCtx(RESTAURANT_A), {
      orderId: created.orderId,
      idempotencyKey: "lock-reopen-6-close",
    });
    const foreign = await handleReopenOrder(authCtx(RESTAURANT_B), {
      orderId: created.orderId,
      idempotencyKey: "lock-reopen-6-k",
    });
    assert.equal("error" in foreign, true);
    if (!("error" in foreign)) return;
    assert.equal(foreign.error, "TENANT_MISMATCH");
  });

  test("R7. mesa distinta no se ve afectada por reopen", async () => {
    await seedTableAndProduct("lock-reopen-t1", "prod-lock-reopen-7");
    await seedTableAndProduct("lock-reopen-t2", "prod-lock-reopen-7");
    const a = await handleCreateOpenOrder(authCtx(), {
      tableId: "lock-reopen-t1",
      lines: [{ lineId: "ro7a", productId: "prod-lock-reopen-7", quantity: 1 }],
      idempotencyKey: "lock-reopen-7-a",
    });
    const b = await handleCreateOpenOrder(authCtx(), {
      tableId: "lock-reopen-t2",
      lines: [{ lineId: "ro7b", productId: "prod-lock-reopen-7", quantity: 1 }],
      idempotencyKey: "lock-reopen-7-b",
    });
    assert.equal("orderId" in a && "orderId" in b, true);
    if (!("orderId" in a) || !("orderId" in b)) return;
    await adminDb.collection("orders").doc(a.orderId).update({ items: [], total: 0 });
    await handleCloseOrder(authCtx(), {
      orderId: a.orderId,
      idempotencyKey: "lock-reopen-7-close",
    });
    await handleReopenOrder(authCtx(), {
      orderId: a.orderId,
      idempotencyKey: "lock-reopen-7-k",
    });
    assert.equal((await readLock("lock-reopen-t1"))?.orderId, a.orderId);
    assert.equal((await readLock("lock-reopen-t2"))?.orderId, b.orderId);
  });

  test("R8. retry mismo idempotencyKey no duplica cambios", async () => {
    const tableId = "lock-reopen-idem-key";
    await seedTableAndProduct(tableId, "prod-lock-reopen-8");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ro8", productId: "prod-lock-reopen-8", quantity: 1 }],
      idempotencyKey: "lock-reopen-8-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({
      items: [],
      total: 0,
    });
    await handleCloseOrder(authCtx(), {
      orderId: created.orderId,
      idempotencyKey: "lock-reopen-8-close",
    });
    const intent = {
      orderId: created.orderId,
      idempotencyKey: "lock-reopen-8-k",
    };
    const first = await handleReopenOrder(authCtx(), intent);
    const second = await handleReopenOrder(authCtx(), intent);
    assert.equal("orderId" in first && "orderId" in second, true);
    if (!("orderId" in first) || !("orderId" in second)) return;
    assert.equal(first.orderId, second.orderId);
    assert.equal((await listActiveOrdersForTable(tableId)).length, 1);
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
  });

  test("R9. concurrencia reopen vs create-open → un único owner", async () => {
    const tableId = "lock-reopen-vs-create";
    await seedTableAndProduct(tableId, "prod-lock-reopen-9");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ro9", productId: "prod-lock-reopen-9", quantity: 1 }],
      idempotencyKey: "lock-reopen-9-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({
      items: [],
      total: 0,
    });
    await handleCloseOrder(authCtx(), {
      orderId: created.orderId,
      idempotencyKey: "lock-reopen-9-close",
    });

    const results = await Promise.allSettled([
      handleReopenOrder(authCtx(), {
        orderId: created.orderId,
        idempotencyKey: "lock-reopen-9-reopen",
      }),
      handleCreateOpenOrder(authCtx(), {
        tableId,
        lines: [{ lineId: "ro9b", productId: "prod-lock-reopen-9", quantity: 1 }],
        idempotencyKey: "lock-reopen-9-create2",
      }),
    ]);
    const actives = await listActiveOrdersForTable(tableId);
    assert.equal(actives.length, 1);
    const lock = await readLock(tableId);
    assert.equal(lock?.orderId, actives[0]!.id);
    assert.equal(results.some((r) => r.status === "fulfilled"), true);
  });

  test("A10. auto-close correcto libera lock", async () => {
    const tableId = "lock-autoclose-ok";
    await seedTableAndProduct(tableId, "prod-lock-ac-1");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ac1", productId: "prod-lock-ac-1", quantity: 1 }],
      idempotencyKey: "lock-ac-1-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({
      items: [],
      total: 0,
    });
    const closed = await handleAutoCloseEmptyTable(authCtx(), {
      tableId,
      idempotencyKey: "lock-ac-1-k",
    });
    assert.equal("closedOrderIds" in closed, true);
    if (!("closedOrderIds" in closed)) return;
    assert.deepEqual(closed.closedOrderIds, [created.orderId]);
    assert.equal((await readLock(tableId))?.orderId ?? null, null);
    assert.equal((await readLock(tableId))?.lastOperation, "auto_close_table");
    assert.equal((await listActiveOrdersForTable(tableId)).length, 0);
  });

  test("A11. auto-close sin cierre conserva lock", async () => {
    const tableId = "lock-autoclose-keep";
    await seedTableAndProduct(tableId, "prod-lock-ac-2", 8);
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ac2", productId: "prod-lock-ac-2", quantity: 1 }],
      idempotencyKey: "lock-ac-2-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const result = await handleAutoCloseEmptyTable(authCtx(), {
      tableId,
      idempotencyKey: "lock-ac-2-k",
    });
    assert.equal("closedOrderIds" in result, true);
    if (!("closedOrderIds" in result)) return;
    assert.deepEqual(result.closedOrderIds, []);
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
  });

  test("A12. auto-close repetido es idempotente", async () => {
    const tableId = "lock-autoclose-idem";
    await seedTableAndProduct(tableId, "prod-lock-ac-3");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ac3", productId: "prod-lock-ac-3", quantity: 1 }],
      idempotencyKey: "lock-ac-3-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({
      items: [],
      total: 0,
    });
    const intent = { tableId, idempotencyKey: "lock-ac-3-k" };
    const first = await handleAutoCloseEmptyTable(authCtx(), intent);
    const second = await handleAutoCloseEmptyTable(authCtx(), intent);
    assert.equal("closedOrderIds" in first && "closedOrderIds" in second, true);
    if (!("closedOrderIds" in first) || !("closedOrderIds" in second)) return;
    assert.deepEqual(first.closedOrderIds, second.closedOrderIds);
    assert.equal((await readLock(tableId))?.orderId ?? null, null);
  });

  test("A13. auto-close no libera lock de otro pedido", async () => {
    const tableId = "lock-autoclose-other";
    await seedTableAndProduct(tableId, "prod-lock-ac-4");
    const empty = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ac4a", productId: "prod-lock-ac-4", quantity: 1 }],
      idempotencyKey: "lock-ac-4-a",
    });
    assert.equal("orderId" in empty, true);
    if (!("orderId" in empty)) return;
    await adminDb.collection("orders").doc(empty.orderId).update({
      items: [],
      total: 0,
    });
    // Segundo activo con líneas (no auto-cerrable); ownership apunta a él.
    const activeRef = adminDb.collection("orders").doc();
    await activeRef.set({
      restaurantId: RESTAURANT_A,
      tableId,
      status: "open",
      items: [
        {
          id: "ac4b",
          productId: "prod-lock-ac-4",
          quantity: 1,
          status: "pending",
          unitPrice: 3,
          lineTotal: 3,
        },
      ],
      total: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await adminDb.runTransaction(async (tx) => {
      writeTableOrderLockClaim(tx, tableOrderLockRef(adminDb, RESTAURANT_A, tableId), {
        restaurantId: RESTAURANT_A,
        tableId,
        orderId: activeRef.id,
        create: false,
        lastOperation: "seed_other",
      });
    });

    const result = await handleAutoCloseEmptyTable(authCtx(), {
      tableId,
      idempotencyKey: "lock-ac-4-k",
    });
    assert.equal("closedOrderIds" in result, true);
    if (!("closedOrderIds" in result)) return;
    assert.deepEqual(result.closedOrderIds, [empty.orderId]);
    assert.equal((await readLock(tableId))?.orderId, activeRef.id);
  });

  test("A14. lock huérfano no se fuerza en auto-close; create-open repara", async () => {
    const tableId = "lock-autoclose-orphan";
    await seedTableAndProduct(tableId, "prod-lock-ac-5");
    await adminDb.runTransaction(async (tx) => {
      writeTableOrderLockClaim(tx, tableOrderLockRef(adminDb, RESTAURANT_A, tableId), {
        restaurantId: RESTAURANT_A,
        tableId,
        orderId: "ghost-ac-orphan",
        create: true,
        lastOperation: "stale",
      });
    });
    const result = await handleAutoCloseEmptyTable(authCtx(), {
      tableId,
      idempotencyKey: "lock-ac-5-k",
    });
    assert.equal("closedOrderIds" in result, true);
    if (!("closedOrderIds" in result)) return;
    assert.deepEqual(result.closedOrderIds, []);
    assert.equal((await readLock(tableId))?.orderId, "ghost-ac-orphan");

    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ac5", productId: "prod-lock-ac-5", quantity: 1 }],
      idempotencyKey: "lock-ac-5-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
  });

  test("A15. concurrencia auto-close vs upsert mantiene consistencia", async () => {
    const tableId = "lock-autoclose-vs-upsert";
    await seedTableAndProduct(tableId, "prod-lock-ac-6");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "ac6", productId: "prod-lock-ac-6", quantity: 1 }],
      idempotencyKey: "lock-ac-6-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({
      items: [],
      total: 0,
    });

    const results = await Promise.allSettled([
      handleAutoCloseEmptyTable(authCtx(), {
        tableId,
        idempotencyKey: "lock-ac-6-close",
      }),
      handleUpsertSaleLines(authCtx(), {
        orderId: created.orderId,
        lines: [{ lineId: "ac6b", productId: "prod-lock-ac-6", quantity: 1 }],
        idempotencyKey: "lock-ac-6-upsert",
      }),
    ]);
    assert.equal(results.every((r) => r.status === "fulfilled"), true);
    const closeRes = results[0]!.status === "fulfilled" ? results[0].value : null;
    const upsertRes = results[1]!.status === "fulfilled" ? results[1].value : null;
    assert.ok(closeRes && upsertRes);

    const actives = await listActiveOrdersForTable(tableId);
    const lock = await readLock(tableId);
    const upsertOk = "orderId" in upsertRes;
    const upsertDenied =
      "error" in upsertRes &&
      (upsertRes.error === "ORDER_NOT_ACTIVE" ||
        upsertRes.error === "TABLE_ORDER_LOCK_CONFLICT");

    if (upsertOk) {
      // Upsert ganó: pedido activo con líneas; lock propio; no se reabre tras close.
      assert.equal(actives.length, 1);
      assert.equal(actives[0]!.id, created.orderId);
      assert.equal(lock?.orderId, created.orderId);
      assert.equal("error" in upsertRes, false);
      const order = (await adminDb.collection("orders").doc(created.orderId).get()).data();
      assert.equal(isActiveOrderStatus(order?.status), true);
      assert.ok(Array.isArray(order?.items) && (order?.items as unknown[]).length >= 1);
      return;
    }

    // Auto-close ganó: upsert aborta; pedido terminal; sin ownership activo.
    assert.equal(upsertDenied, true);
    assert.equal(actives.length, 0);
    assert.equal(lock?.orderId ?? null, null);
    const closed = (await adminDb.collection("orders").doc(created.orderId).get()).data();
    assert.equal(String(closed?.status ?? ""), "closed");
  });

  test("A16. auto-close vs merge no deja ownership parcial", async () => {
    const mainId = "lock-ac-merge-main";
    const sideId = "lock-ac-merge-side";
    await seedTableAndProduct(mainId, "prod-lock-ac-7");
    await seedTableAndProduct(sideId, "prod-lock-ac-7");
    const mainOrder = await handleCreateOpenOrder(authCtx(), {
      tableId: mainId,
      lines: [{ lineId: "acm1", productId: "prod-lock-ac-7", quantity: 1 }],
      idempotencyKey: "lock-ac-7-main",
    });
    const sideOrder = await handleCreateOpenOrder(authCtx(), {
      tableId: sideId,
      lines: [{ lineId: "acs1", productId: "prod-lock-ac-7", quantity: 1 }],
      idempotencyKey: "lock-ac-7-side",
    });
    assert.equal("orderId" in mainOrder && "orderId" in sideOrder, true);
    if (!("orderId" in mainOrder) || !("orderId" in sideOrder)) return;
    await adminDb.collection("orders").doc(sideOrder.orderId).update({
      items: [],
      total: 0,
    });

    const results = await Promise.allSettled([
      handleAutoCloseEmptyTable(authCtx(), {
        tableId: sideId,
        idempotencyKey: "lock-ac-7-ac",
      }),
      handleMergeTableGroupOrders(authCtx(), {
        mainTableId: mainId,
        memberTableIds: [mainId, sideId],
        idempotencyKey: "lock-ac-7-merge",
      }),
    ]);
    assert.equal(results.some((r) => r.status === "fulfilled"), true);
    const mainActives = await listActiveOrdersForTable(mainId);
    const sideActives = await listActiveOrdersForTable(sideId);
    if (sideActives.length === 0) {
      const sideLock = await readLock(sideId);
      assert.ok(
        sideLock?.orderId == null || sideLock?.orderId === mainOrder.orderId,
      );
    }
    if (mainActives.length > 0) {
      assert.equal((await readLock(mainId))?.orderId, mainActives[0]!.id);
    }
  });

  test("A17. auto-close multi-tenant no cruza restaurantes", async () => {
    const tableA = "lock-ac-tenant-a";
    const tableB = "lock-ac-tenant-b";
    await seedTableAndProduct(tableA, "prod-lock-ac-8");
    await adminDb.collection("tables").doc(tableB).set({
      restaurantId: RESTAURANT_B,
      name: tableB,
    });
    await adminDb
      .collection("restaurants")
      .doc(RESTAURANT_B)
      .collection("products")
      .doc("prod-b-ac")
      .set({ name: "prod-b-ac", price: 2, active: true, tipoVenta: "carta" });

    const a = await handleCreateOpenOrder(authCtx(RESTAURANT_A), {
      tableId: tableA,
      lines: [{ lineId: "aca", productId: "prod-lock-ac-8", quantity: 1 }],
      idempotencyKey: "lock-ac-8-a",
    });
    const b = await handleCreateOpenOrder(authCtx(RESTAURANT_B), {
      tableId: tableB,
      lines: [{ lineId: "acb", productId: "prod-b-ac", quantity: 1 }],
      idempotencyKey: "lock-ac-8-b",
    });
    assert.equal("orderId" in a && "orderId" in b, true);
    if (!("orderId" in a) || !("orderId" in b)) return;
    await adminDb.collection("orders").doc(a.orderId).update({ items: [], total: 0 });

    await handleAutoCloseEmptyTable(authCtx(RESTAURANT_A), {
      tableId: tableA,
      idempotencyKey: "lock-ac-8-close",
    });
    assert.equal((await readLock(tableA, RESTAURANT_A))?.orderId ?? null, null);
    assert.equal((await readLock(tableB, RESTAURANT_B))?.orderId, b.orderId);
  });

  test("U1. upsert open con lock propio → OK", async () => {
    const tableId = "lock-upsert-open";
    await seedTableAndProduct(tableId, "prod-lock-up-1");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u1a", productId: "prod-lock-up-1", quantity: 1 }],
      idempotencyKey: "lock-up-1-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const upserted = await handleUpsertSaleLines(authCtx(), {
      orderId: created.orderId,
      lines: [{ lineId: "u1b", productId: "prod-lock-up-1", quantity: 1 }],
      idempotencyKey: "lock-up-1-upsert",
    });
    assert.equal("orderId" in upserted, true);
    if (!("orderId" in upserted)) return;
    assert.equal(upserted.orderId, created.orderId);
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
    assert.equal((await listActiveOrdersForTable(tableId)).length, 1);
  });

  test("U2. upsert sent con lock propio → OK", async () => {
    const tableId = "lock-upsert-sent";
    await seedTableAndProduct(tableId, "prod-lock-up-2");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u2a", productId: "prod-lock-up-2", quantity: 1 }],
      markSent: true,
      idempotencyKey: "lock-up-2-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const status = String(
      (await adminDb.collection("orders").doc(created.orderId).get()).data()?.status ?? "",
    );
    assert.equal(status, "sent");
    const upserted = await handleUpsertSaleLines(authCtx(), {
      orderId: created.orderId,
      lines: [{ lineId: "u2b", productId: "prod-lock-up-2", quantity: 1 }],
      idempotencyKey: "lock-up-2-upsert",
    });
    assert.equal("orderId" in upserted, true);
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
  });

  test("U3. upsert closed → ORDER_NOT_ACTIVE 409 y no reabre", async () => {
    const tableId = "lock-upsert-closed";
    await seedTableAndProduct(tableId, "prod-lock-up-3");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u3a", productId: "prod-lock-up-3", quantity: 1 }],
      idempotencyKey: "lock-up-3-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({
      status: "closed",
      closedAt: Date.now(),
      items: [],
      total: 0,
    });
    await adminDb.runTransaction(async (tx) => {
      writeTableOrderLockRelease(tx, tableOrderLockRef(adminDb, RESTAURANT_A, tableId), {
        restaurantId: RESTAURANT_A,
        tableId,
        lastOperation: "test_force_close",
      });
    });
    const denied = await handleUpsertSaleLines(authCtx(), {
      orderId: created.orderId,
      lines: [{ lineId: "u3b", productId: "prod-lock-up-3", quantity: 1 }],
      idempotencyKey: "lock-up-3-upsert",
    });
    assert.equal("error" in denied, true);
    if (!("error" in denied)) return;
    assert.equal(denied.error, "ORDER_NOT_ACTIVE");
    assert.equal(denied.status, 409);
    const after = (await adminDb.collection("orders").doc(created.orderId).get()).data();
    assert.equal(String(after?.status ?? ""), "closed");
    assert.equal((await listActiveOrdersForTable(tableId)).length, 0);
  });

  test("U4. upsert terminal paid → ORDER_NOT_ACTIVE", async () => {
    const tableId = "lock-upsert-paid";
    await seedTableAndProduct(tableId, "prod-lock-up-4");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u4a", productId: "prod-lock-up-4", quantity: 1 }],
      idempotencyKey: "lock-up-4-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({ status: "paid" });
    const denied = await handleUpsertSaleLines(authCtx(), {
      orderId: created.orderId,
      lines: [{ lineId: "u4b", productId: "prod-lock-up-4", quantity: 1 }],
    });
    assert.equal("error" in denied, true);
    if (!("error" in denied)) return;
    assert.equal(denied.error, "ORDER_NOT_ACTIVE");
    assert.equal(denied.status, 409);
  });

  test("U5. upsert con lock de otro pedido → 409", async () => {
    const tableId = "lock-upsert-other-owner";
    await seedTableAndProduct(tableId, "prod-lock-up-5");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u5a", productId: "prod-lock-up-5", quantity: 1 }],
      idempotencyKey: "lock-up-5-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.runTransaction(async (tx) => {
      writeTableOrderLockClaim(tx, tableOrderLockRef(adminDb, RESTAURANT_A, tableId), {
        restaurantId: RESTAURANT_A,
        tableId,
        orderId: "foreign-order-owner",
        create: false,
        lastOperation: "test_steal",
      });
    });
    const denied = await handleUpsertSaleLines(authCtx(), {
      orderId: created.orderId,
      lines: [{ lineId: "u5b", productId: "prod-lock-up-5", quantity: 1 }],
    });
    assert.equal("error" in denied, true);
    if (!("error" in denied)) return;
    assert.equal(denied.error, "TABLE_ORDER_LOCK_CONFLICT");
    assert.equal(denied.status, 409);
    assert.equal((await readLock(tableId))?.orderId, "foreign-order-owner");
  });

  test("U6. upsert sin lock → TABLE_ORDER_LOCK_CONFLICT (no reclama)", async () => {
    const tableId = "lock-upsert-missing";
    await seedTableAndProduct(tableId, "prod-lock-up-6");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u6a", productId: "prod-lock-up-6", quantity: 1 }],
      idempotencyKey: "lock-up-6-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await tableOrderLockRef(adminDb, RESTAURANT_A, tableId).delete();
    const denied = await handleUpsertSaleLines(authCtx(), {
      orderId: created.orderId,
      lines: [{ lineId: "u6b", productId: "prod-lock-up-6", quantity: 1 }],
    });
    assert.equal("error" in denied, true);
    if (!("error" in denied)) return;
    assert.equal(denied.error, "TABLE_ORDER_LOCK_CONFLICT");
    assert.equal(denied.status, 409);
    assert.equal(await readLock(tableId), null);
  });

  test("U7. lock de otra mesa → LOCK_TABLE_MISMATCH", async () => {
    const tableId = "lock-upsert-table-mismatch";
    await seedTableAndProduct(tableId, "prod-lock-up-7");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u7a", productId: "prod-lock-up-7", quantity: 1 }],
      idempotencyKey: "lock-up-7-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await tableOrderLockRef(adminDb, RESTAURANT_A, tableId).set({
      restaurantId: RESTAURANT_A,
      tableId: "otra-mesa",
      orderId: created.orderId,
    });
    const denied = await handleUpsertSaleLines(authCtx(), {
      orderId: created.orderId,
      lines: [{ lineId: "u7b", productId: "prod-lock-up-7", quantity: 1 }],
    });
    assert.equal("error" in denied, true);
    if (!("error" in denied)) return;
    assert.equal(denied.error, "LOCK_TABLE_MISMATCH");
    assert.equal(denied.status, 409);
    assert.equal("details" in denied && denied.details != null, false);
  });

  test("U8. lock de otro restaurante → LOCK_TENANT_MISMATCH sin fuga", async () => {
    const tableId = "lock-upsert-tenant-mismatch";
    await seedTableAndProduct(tableId, "prod-lock-up-8");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u8a", productId: "prod-lock-up-8", quantity: 1 }],
      idempotencyKey: "lock-up-8-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await tableOrderLockRef(adminDb, RESTAURANT_A, tableId).set({
      restaurantId: RESTAURANT_B,
      tableId,
      orderId: created.orderId,
    });
    const denied = await handleUpsertSaleLines(authCtx(), {
      orderId: created.orderId,
      lines: [{ lineId: "u8b", productId: "prod-lock-up-8", quantity: 1 }],
    });
    assert.equal("error" in denied, true);
    if (!("error" in denied)) return;
    assert.equal(denied.error, "LOCK_TENANT_MISMATCH");
    assert.equal(denied.status, 409);
    assert.equal(denied.details, undefined);
  });

  test("U9. retry misma idempotency key no duplica líneas", async () => {
    const tableId = "lock-upsert-idem";
    await seedTableAndProduct(tableId, "prod-lock-up-9");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u9a", productId: "prod-lock-up-9", quantity: 1 }],
      idempotencyKey: "lock-up-9-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const intent = {
      orderId: created.orderId,
      lines: [{ lineId: "u9b", productId: "prod-lock-up-9", quantity: 2 }],
      idempotencyKey: "lock-up-9-upsert",
    };
    const first = await handleUpsertSaleLines(authCtx(), intent);
    const second = await handleUpsertSaleLines(authCtx(), intent);
    assert.equal("orderId" in first && "orderId" in second, true);
    if (!("orderId" in first) || !("orderId" in second)) return;
    assert.equal(second.total, first.total);
    const items = (await adminDb.collection("orders").doc(created.orderId).get()).data()
      ?.items as Array<Record<string, unknown>>;
    const lineB = items.filter((l) => l.id === "u9b");
    assert.equal(lineB.length, 1);
    assert.equal(lineB[0]?.quantity, 2);
  });

  test("U10. retry tras auto-close → rechazo determinista", async () => {
    const tableId = "lock-upsert-retry-after-close";
    await seedTableAndProduct(tableId, "prod-lock-up-10");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u10a", productId: "prod-lock-up-10", quantity: 1 }],
      idempotencyKey: "lock-up-10-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({ items: [], total: 0 });
    const closed = await handleAutoCloseEmptyTable(authCtx(), {
      tableId,
      idempotencyKey: "lock-up-10-close",
    });
    assert.equal("closedOrderIds" in closed, true);
    if (!("closedOrderIds" in closed)) return;
    assert.deepEqual(closed.closedOrderIds, [created.orderId]);

    const intent = {
      orderId: created.orderId,
      lines: [{ lineId: "u10b", productId: "prod-lock-up-10", quantity: 1 }],
      idempotencyKey: "lock-up-10-upsert",
    };
    const first = await handleUpsertSaleLines(authCtx(), intent);
    const second = await handleUpsertSaleLines(authCtx(), intent);
    assert.equal("error" in first && "error" in second, true);
    if (!("error" in first) || !("error" in second)) return;
    assert.equal(first.error, "ORDER_NOT_ACTIVE");
    assert.equal(second.error, "ORDER_NOT_ACTIVE");
    assert.equal(first.status, 409);
    assert.equal(second.status, 409);
    const after = (await adminDb.collection("orders").doc(created.orderId).get()).data();
    assert.equal(String(after?.status ?? ""), "closed");
  });

  test("U11. upsert gana antes de auto-close → pedido activo con líneas", async () => {
    const tableId = "lock-upsert-wins";
    await seedTableAndProduct(tableId, "prod-lock-up-11");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u11a", productId: "prod-lock-up-11", quantity: 1 }],
      idempotencyKey: "lock-up-11-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({ items: [], total: 0 });

    const upserted = await handleUpsertSaleLines(authCtx(), {
      orderId: created.orderId,
      lines: [{ lineId: "u11b", productId: "prod-lock-up-11", quantity: 1 }],
      idempotencyKey: "lock-up-11-upsert",
    });
    assert.equal("orderId" in upserted, true);

    const closed = await handleAutoCloseEmptyTable(authCtx(), {
      tableId,
      idempotencyKey: "lock-up-11-close",
    });
    assert.equal("closedOrderIds" in closed, true);
    if (!("closedOrderIds" in closed)) return;
    assert.deepEqual(closed.closedOrderIds, []);
    assert.equal((await listActiveOrdersForTable(tableId)).length, 1);
    assert.equal((await readLock(tableId))?.orderId, created.orderId);
  });

  test("U12. auto-close gana antes de upsert → ORDER_NOT_ACTIVE", async () => {
    const tableId = "lock-autoclose-wins";
    await seedTableAndProduct(tableId, "prod-lock-up-12");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u12a", productId: "prod-lock-up-12", quantity: 1 }],
      idempotencyKey: "lock-up-12-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.collection("orders").doc(created.orderId).update({ items: [], total: 0 });
    const closed = await handleAutoCloseEmptyTable(authCtx(), {
      tableId,
      idempotencyKey: "lock-up-12-close",
    });
    assert.equal("closedOrderIds" in closed, true);
    if (!("closedOrderIds" in closed)) return;
    assert.deepEqual(closed.closedOrderIds, [created.orderId]);

    const denied = await handleUpsertSaleLines(authCtx(), {
      orderId: created.orderId,
      lines: [{ lineId: "u12b", productId: "prod-lock-up-12", quantity: 1 }],
      idempotencyKey: "lock-up-12-upsert",
    });
    assert.equal("error" in denied, true);
    if (!("error" in denied)) return;
    assert.equal(denied.error, "ORDER_NOT_ACTIVE");
    assert.equal(denied.status, 409);
  });

  test("U13. response perdida + retry → resultado idempotente", async () => {
    const tableId = "lock-upsert-lost-response";
    await seedTableAndProduct(tableId, "prod-lock-up-13");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u13a", productId: "prod-lock-up-13", quantity: 1 }],
      idempotencyKey: "lock-up-13-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const intent = {
      orderId: created.orderId,
      lines: [{ lineId: "u13b", productId: "prod-lock-up-13", quantity: 3 }],
      idempotencyKey: "lock-up-13-upsert",
    };
    const first = await handleUpsertSaleLines(authCtx(), intent);
    assert.equal("orderId" in first, true);
    if (!("orderId" in first)) return;
    // Simula respuesta perdida: mismo key, sin reescritura.
    const retry = await handleUpsertSaleLines(authCtx(), intent);
    assert.equal("orderId" in retry, true);
    if (!("orderId" in retry)) return;
    assert.equal(retry.total, first.total);
    assert.deepEqual(retry.items, first.items);
    const items = (await adminDb.collection("orders").doc(created.orderId).get()).data()
      ?.items as Array<Record<string, unknown>>;
    assert.equal(items.filter((l) => l.id === "u13b").length, 1);
  });

  test("U14. persist sin orderId conserva create-open (no segundo pedido)", async () => {
    const tableId = "lock-persist-create-open";
    await seedTableAndProduct(tableId, "prod-lock-up-14");
    const first = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u14a", productId: "prod-lock-up-14", quantity: 1 }],
      idempotencyKey: "lock-up-14-a",
    });
    const second = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u14b", productId: "prod-lock-up-14", quantity: 1 }],
      idempotencyKey: "lock-up-14-b",
    });
    assert.equal("orderId" in first && "orderId" in second, true);
    if (!("orderId" in first) || !("orderId" in second)) return;
    assert.equal(second.orderId, first.orderId);
    assert.equal(second.reusedExistingOrder, true);
    assert.equal((await listActiveOrdersForTable(tableId)).length, 1);
    assert.equal((await readLock(tableId))?.orderId, first.orderId);
  });

  test("U15. upsert no reclama lock ajeno ni crea pedido", async () => {
    const tableId = "lock-upsert-no-claim";
    await seedTableAndProduct(tableId, "prod-lock-up-15");
    const created = await handleCreateOpenOrder(authCtx(), {
      tableId,
      lines: [{ lineId: "u15a", productId: "prod-lock-up-15", quantity: 1 }],
      idempotencyKey: "lock-up-15-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    await adminDb.runTransaction(async (tx) => {
      writeTableOrderLockClaim(tx, tableOrderLockRef(adminDb, RESTAURANT_A, tableId), {
        restaurantId: RESTAURANT_A,
        tableId,
        orderId: "someone-else",
        create: false,
        lastOperation: "foreign",
      });
    });
    const beforeOrders = await listActiveOrdersForTable(tableId);
    const denied = await handleUpsertSaleLines(authCtx(), {
      orderId: created.orderId,
      lines: [{ lineId: "u15b", productId: "prod-lock-up-15", quantity: 1 }],
    });
    assert.equal("error" in denied, true);
    if (!("error" in denied)) return;
    assert.equal(denied.error, "TABLE_ORDER_LOCK_CONFLICT");
    assert.equal((await readLock(tableId))?.orderId, "someone-else");
    assert.equal((await listActiveOrdersForTable(tableId)).length, beforeOrders.length);
  });

  test("U16. upsert multi-tenant → TENANT_MISMATCH 403", async () => {
    const tableId = "lock-upsert-mt";
    await seedTableAndProduct(tableId, "prod-lock-up-16");
    const created = await handleCreateOpenOrder(authCtx(RESTAURANT_A), {
      tableId,
      lines: [{ lineId: "u16a", productId: "prod-lock-up-16", quantity: 1 }],
      idempotencyKey: "lock-up-16-create",
    });
    assert.equal("orderId" in created, true);
    if (!("orderId" in created)) return;
    const denied = await handleUpsertSaleLines(authCtx(RESTAURANT_B), {
      orderId: created.orderId,
      lines: [{ lineId: "u16b", productId: "prod-lock-up-16", quantity: 1 }],
    });
    assert.equal("error" in denied, true);
    if (!("error" in denied)) return;
    assert.equal(denied.error, "TENANT_MISMATCH");
    assert.equal(denied.status, 403);
    assert.equal(denied.details, undefined);
    assert.equal((await readLock(tableId, RESTAURANT_A))?.orderId, created.orderId);
  });
});
