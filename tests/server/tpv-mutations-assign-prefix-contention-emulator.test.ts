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
  getFirestore,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import { handleAssignTableOperator } from "@/lib/server/tpv/handle-tpv-order-mutations";

const PROJECT_ID = "demo-hostly-tpv-mutations";
const ADMIN_APP_NAME = "tpv-assign-prefix-diagnostic";
const RESTAURANT_A = "rest-a-tpv";
const MANAGER_UID = "manager-tpv-a";

type PairSnapshot = {
  table: Record<string, unknown>;
  order: Record<string, unknown> | null;
  tableUpdateTimeMillis: number | null;
  orderUpdateTimeMillis: number | null;
};

type StepObservation = {
  step: string;
  result: unknown;
  documentsUnchanged?: boolean;
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

let adminDbSingleton: Firestore | null = null;

function adminDbRef(): Firestore {
  assert.ok(adminDbSingleton);
  return adminDbSingleton;
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

test("assign prefix A1-A14 reproduces historical candidate sequence", async () => {
  const firestoreRules = readFileSync("firestore.rules", "utf8");
  const timeline: string[] = ["imports-evaluated"];
  const steps: StepObservation[] = [];
  let rulesTestEnvironment: RulesTestEnvironment | undefined;
  let orderedAdminApp: App | undefined;
  let rulesCleanupCompleted = false;
  let adminDeleteCompleted = false;
  let settingsAppliedBeforeUse = false;
  let diagnostic: Record<string, unknown> | null = null;

  const logDiagnostic = (partial: Record<string, unknown>) => {
    console.log(
      `TPV_ASSIGN_PREFIX_DIAGNOSTIC ${JSON.stringify({
        ...partial,
        timeline,
        steps,
        rulesCleanupCompleted,
        adminDeleteCompleted,
        appsAfterDelete: getApps().length,
      })}`,
    );
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
    steps.push({ step: "A1", result: a1 });
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
    steps.push({ step: "A2", result: a2 });
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
    steps.push({ step: "A3", result: a3, documentsUnchanged: true });
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
    steps.push({ step: "A4", result: a4 });
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
    steps.push({ step: "A5", result: a5 });
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
      steps.push({ step: stepLabel, result, documentsUnchanged: true });
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
    steps.push({ step: "A10", result: a10 });
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
    steps.push({ step: "A11", result: a11 });
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
    steps.push({ step: "A12", result: a12, documentsUnchanged: true });
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
    steps.push({ step: "A13", result: a13, documentsUnchanged: true });
    timeline.push("a13-complete");

    // A14
    timeline.push("a14-prepared");
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

    const dispatchAStartedAt = performance.now();
    const promiseA = handleAssignTableOperator(ctx, {
      tableId: "mesa-op-concurrent",
      orderId: "order-op-concurrent",
      assignedOperatorId: "op-a",
      assignedOperatorName: "Op A",
    });
    timeline.push("a14-dispatched-a");
    const dispatchADispatchedAt = performance.now();
    const promiseB = handleAssignTableOperator(ctx, {
      tableId: "mesa-op-concurrent",
      orderId: "order-op-concurrent",
      assignedOperatorId: "op-b",
      assignedOperatorName: "Op B",
    });
    timeline.push("a14-dispatched-b");
    const dispatchBDispatchedAt = performance.now();

    const observedA: { status?: string; value?: unknown; reason?: unknown } = {};
    const observedB: { status?: string; value?: unknown; reason?: unknown } = {};
    observePromise(promiseA, observedA);
    observePromise(promiseB, observedB);

    let first: unknown;
    let second: unknown;
    let a14PromiseAllRejected: Record<string, unknown> | null = null;
    try {
      [first, second] = await Promise.all([promiseA, promiseB]);
      timeline.push("a14-results-complete");
    } catch (error) {
      timeline.push("a14-error");
      await Promise.allSettled([promiseA, promiseB]);
      a14PromiseAllRejected = serializeError(error);
      logDiagnostic({
        classification: "A-or-E",
        settingsAppliedBeforeUse,
        dbIdentity: { ctxIsAdminDb: ctx.db === adminDb },
        dispatchTimes: {
          dispatchAStartedAt,
          dispatchADispatchedAt,
          dispatchBDispatchedAt,
        },
        observedA,
        observedB,
        a14PromiseAllRejected,
        finalState: {
          table: (
            await adminDb.collection("tables").doc("mesa-op-concurrent").get()
          ).data(),
          order: (
            await adminDb.collection("orders").doc("order-op-concurrent").get()
          ).data(),
        },
      });
      throw error;
    }

    const outcomes = [first, second];
    const successes = outcomes.filter(
      (outcome): outcome is { assigned: boolean; tableId: string; orderId?: string } =>
        typeof outcome === "object" &&
        outcome != null &&
        "assigned" in outcome &&
        outcome.assigned === true,
    );
    const conflicts = outcomes.filter(
      (outcome): outcome is { status: number; error: string } =>
        typeof outcome === "object" &&
        outcome != null &&
        "error" in outcome &&
        outcome.error === "OPERATOR_ALREADY_ASSIGNED",
    );
    assert.equal(successes.length, 1);
    assert.equal(conflicts.length, 1);

    const tableRef = adminDb.collection("tables").doc("mesa-op-concurrent");
    const orderRef = adminDb.collection("orders").doc("order-op-concurrent");
    const table = (await tableRef.get()).data()!;
    const order = (await orderRef.get()).data()!;
    assert.equal(table.restaurantId, RESTAURANT_A);
    assert.equal(order.restaurantId, RESTAURANT_A);
    assert.equal(order.tableId, "mesa-op-concurrent");
    assert.equal(order.status, "open");
    assert.equal(table.assignedOperatorId, order.assignedOperatorId);
    assert.ok(table.assignedOperatorId === "op-a" || table.assignedOperatorId === "op-b");
    const rejectedOperatorId =
      table.assignedOperatorId === "op-a" ? "op-b" : "op-a";
    assert.notEqual(table.assignedOperatorId, rejectedOperatorId);
    assert.notEqual(order.assignedOperatorId, rejectedOperatorId);
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
      successes,
      conflicts,
      winner: table.assignedOperatorId,
      rejectedOperator: rejectedOperatorId,
      finalState: { table, order },
      timestampTypes: timestamps.map((value) => value.constructor.name),
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
