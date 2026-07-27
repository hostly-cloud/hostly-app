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
import { doc, getDocFromServer } from "firebase/firestore";

type RulesTestFirestore = ReturnType<
  ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]
>;
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import { handleAssignTableOperator } from "@/lib/server/tpv/handle-tpv-order-mutations";

const PROJECT_ID = "demo-hostly-tx-contention";
const ADMIN_APP_NAME = "rules-before-admin-handler-rejection-history-diagnostic";
const REJECTION_HISTORY_COUNT = 7;

type RejectionHistoryDiagnostic = {
  index: number;
  tableId: string;
  orderId: string;
  incumbentOperatorId: string;
  incumbentOperatorName: string;
  challengerOperatorId: string;
  challengerOperatorName: string;
  result: { status: 409; error: "OPERATOR_ALREADY_ASSIGNED" };
  documentsUnchanged: true;
  updateTimeStable: boolean | null;
};

type PairSnapshot = {
  table: Record<string, unknown>;
  order: Record<string, unknown>;
  tableUpdateTimeMillis: number | null;
  orderUpdateTimeMillis: number | null;
};

function readFirestoreEmulatorAddress(): { host: string; port: number } {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST?.trim() ?? "";
  assert.ok(emulatorHost);
  const emulatorUrl = new URL(`http://${emulatorHost}`);
  const port = Number(emulatorUrl.port);
  assert.ok(emulatorUrl.hostname);
  assert.ok(Number.isInteger(port) && port > 0);
  return { host: emulatorUrl.hostname, port };
}

function buildRejectionItems(index: number) {
  return [
    {
      id: `diag-line-${index}`,
      status: "pending",
      quantity: 1,
      price: 5,
      total: 5,
    },
  ];
}

function readUpdateTimeMillis(snapshot: DocumentSnapshot): number | null {
  const updateTime = snapshot.updateTime;
  if (!updateTime) return null;
  return updateTime.toMillis();
}

async function snapshotAssignedPair(
  tableRef: DocumentReference,
  orderRef: DocumentReference,
): Promise<PairSnapshot> {
  const [tableSnapshot, orderSnapshot] = await Promise.all([
    tableRef.get(),
    orderRef.get(),
  ]);
  assert.equal(tableSnapshot.exists, true);
  assert.equal(orderSnapshot.exists, true);
  return {
    table: tableSnapshot.data()!,
    order: orderSnapshot.data()!,
    tableUpdateTimeMillis: readUpdateTimeMillis(tableSnapshot),
    orderUpdateTimeMillis: readUpdateTimeMillis(orderSnapshot),
  };
}

function assertOperatorConflictResult(
  value: unknown,
): asserts value is { status: 409; error: "OPERATOR_ALREADY_ASSIGNED" } {
  assert.deepEqual(value, { status: 409, error: "OPERATOR_ALREADY_ASSIGNED" });
}

async function validatePreparedAssignedPairState(params: {
  tableRef: DocumentReference;
  orderRef: DocumentReference;
  restaurantId: string;
  tableId: string;
  incumbentOperatorId: string;
  incumbentOperatorName: string;
  initialItems: ReturnType<typeof buildRejectionItems>;
}): Promise<void> {
  const {
    tableRef,
    orderRef,
    restaurantId,
    tableId,
    incumbentOperatorId,
    incumbentOperatorName,
    initialItems,
  } = params;
  const [tableSnapshot, orderSnapshot] = await Promise.all([
    tableRef.get(),
    orderRef.get(),
  ]);
  assert.equal(tableSnapshot.exists, true);
  assert.equal(orderSnapshot.exists, true);
  const table = tableSnapshot.data()!;
  const order = orderSnapshot.data()!;
  assert.equal(table.restaurantId, restaurantId);
  assert.equal(order.restaurantId, restaurantId);
  assert.equal(order.tableId, tableId);
  assert.equal(order.status, "open");
  assert.equal(table.assignedOperatorId, incumbentOperatorId);
  assert.equal(order.assignedOperatorId, incumbentOperatorId);
  assert.equal(table.assignedOperatorName, incumbentOperatorName);
  assert.equal(order.assignedOperatorName, incumbentOperatorName);
  const timestamps = [
    table.assignedAt,
    table.updatedAt,
    order.assignedAt,
    order.updatedAt,
  ];
  assert.equal(timestamps.length, 4);
  timestamps.forEach((value) => assert.ok(value instanceof Timestamp));
  assert.deepEqual(order.items, initialItems);
  assert.equal(order.total, 5);
}

function assertPairDocumentsUnchanged(params: {
  before: PairSnapshot;
  after: PairSnapshot;
  incumbentOperatorId: string;
  incumbentOperatorName: string;
  challengerOperatorId: string;
  initialItems: ReturnType<typeof buildRejectionItems>;
  restaurantId: string;
  tableId: string;
}): boolean | null {
  const {
    before,
    after,
    incumbentOperatorId,
    incumbentOperatorName,
    challengerOperatorId,
    initialItems,
    restaurantId,
    tableId,
  } = params;

  assert.deepEqual(after.table, before.table);
  assert.deepEqual(after.order, before.order);
  assert.equal(after.table.restaurantId, restaurantId);
  assert.equal(after.order.restaurantId, restaurantId);
  assert.equal(after.order.tableId, tableId);
  assert.equal(after.order.status, "open");
  assert.equal(after.table.assignedOperatorId, incumbentOperatorId);
  assert.equal(after.order.assignedOperatorId, incumbentOperatorId);
  assert.equal(after.table.assignedOperatorName, incumbentOperatorName);
  assert.equal(after.order.assignedOperatorName, incumbentOperatorName);
  assert.notEqual(after.table.assignedOperatorId, challengerOperatorId);
  assert.notEqual(after.order.assignedOperatorId, challengerOperatorId);
  assert.deepEqual(after.order.items, initialItems);
  assert.equal(after.order.total, 5);

  const timestamps = [
    after.table.assignedAt,
    after.table.updatedAt,
    after.order.assignedAt,
    after.order.updatedAt,
  ];
  timestamps.forEach((value) => assert.ok(value instanceof Timestamp));

  if (
    before.tableUpdateTimeMillis == null ||
    before.orderUpdateTimeMillis == null ||
    after.tableUpdateTimeMillis == null ||
    after.orderUpdateTimeMillis == null
  ) {
    return null;
  }

  assert.equal(after.tableUpdateTimeMillis, before.tableUpdateTimeMillis);
  assert.equal(after.orderUpdateTimeMillis, before.orderUpdateTimeMillis);
  return true;
}

async function prepareAssignedRejectionPair(
  adminDb: Firestore,
  index: number,
  restaurantId: string,
): Promise<{
  tableId: string;
  orderId: string;
  tableRef: DocumentReference;
  orderRef: DocumentReference;
  incumbentOperatorId: string;
  incumbentOperatorName: string;
  initialItems: ReturnType<typeof buildRejectionItems>;
}> {
  const tableId = `diag-rejection-history-table-${index}`;
  const orderId = `diag-rejection-history-order-${index}`;
  const incumbentOperatorId = `diag-incumbent-operator-${index}`;
  const incumbentOperatorName = `Operador incumbente ${index}`;
  const initialItems = buildRejectionItems(index);
  const tableRef = adminDb.collection("tables").doc(tableId);
  const orderRef = adminDb.collection("orders").doc(orderId);
  const assignmentPayload = {
    assignedOperatorId: incumbentOperatorId,
    assignedOperatorName: incumbentOperatorName,
    assignedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await Promise.all([
    tableRef.set({
      restaurantId,
      ...assignmentPayload,
    }),
    orderRef.set({
      restaurantId,
      tableId,
      status: "open",
      items: initialItems,
      total: 5,
      ...assignmentPayload,
    }),
  ]);

  await validatePreparedAssignedPairState({
    tableRef,
    orderRef,
    restaurantId,
    tableId,
    incumbentOperatorId,
    incumbentOperatorName,
    initialItems,
  });

  return {
    tableId,
    orderId,
    tableRef,
    orderRef,
    incumbentOperatorId,
    incumbentOperatorName,
    initialItems,
  };
}

async function runSequentialRejectionHistoryCall(
  adminDb: Firestore,
  ctx: AuthenticatedRestaurantContext,
  index: number,
  restaurantId: string,
  timeline: string[],
): Promise<RejectionHistoryDiagnostic> {
  timeline.push(`rejection-history-${index}-prepared`);

  const prepared = await prepareAssignedRejectionPair(adminDb, index, restaurantId);
  const {
    tableId,
    orderId,
    tableRef,
    orderRef,
    incumbentOperatorId,
    incumbentOperatorName,
    initialItems,
  } = prepared;
  const challengerOperatorId = `diag-challenger-operator-${index}`;
  const challengerOperatorName = `Operador retador ${index}`;

  const before = await snapshotAssignedPair(tableRef, orderRef);

  timeline.push(`rejection-history-${index}-start`);
  assert.equal(ctx.db, adminDb);

  const result = await handleAssignTableOperator(ctx, {
    tableId,
    orderId,
    assignedOperatorId: challengerOperatorId,
    assignedOperatorName: challengerOperatorName,
  });
  assertOperatorConflictResult(result);

  const after = await snapshotAssignedPair(tableRef, orderRef);
  const updateTimeStable = assertPairDocumentsUnchanged({
    before,
    after,
    incumbentOperatorId,
    incumbentOperatorName,
    challengerOperatorId,
    initialItems,
    restaurantId,
    tableId,
  });

  timeline.push(`rejection-history-${index}-complete`);
  return {
    index,
    tableId,
    orderId,
    incumbentOperatorId,
    incumbentOperatorName,
    challengerOperatorId,
    challengerOperatorName,
    result,
    documentsUnchanged: true,
    updateTimeStable,
  };
}

test("real handler rejection history then assignment handler contends on one Admin client", async () => {
  const firestoreRules = readFileSync("firestore.rules", "utf8");
  const appsBeforeRules = getApps().length;
  assert.equal(appsBeforeRules, 0);

  const { host, port } = readFirestoreEmulatorAddress();
  const restaurantId = "diag-rejection-history-restaurant";
  const contentionTableId = "diag-rejection-history-table-8";
  const contentionOrderId = "diag-rejection-history-order-8";
  const rulesUid = "rules-web-read-diagnostic-handler-rejection-history";
  const expectedWebMarker =
    "rules-before-admin-handler-rejection-history-web-read-complete";
  const initialContentionItems = buildRejectionItems(8);
  const timeline: string[] = ["imports-evaluated"];
  const rejectionHistory: RejectionHistoryDiagnostic[] = [];
  let rulesTestEnvironment: RulesTestEnvironment | undefined;
  let orderedAdminApp: App | undefined;
  let rulesClient: RulesTestFirestore | undefined;
  let rulesCleanupCompleted = false;
  let adminDeleteCompleted = false;
  let diagnostic: Record<string, unknown> | null = null;

  try {
    rulesTestEnvironment = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { host, port, rules: firestoreRules },
    });
    timeline.push("rules-environment-complete");
    const appsAfterRules = getApps().length;
    assert.equal(appsAfterRules, 0);

    orderedAdminApp = initializeApp(
      { projectId: PROJECT_ID },
      ADMIN_APP_NAME,
    );
    const adminDb = getFirestore(orderedAdminApp);
    timeline.push("ordered-admin-created");

    await adminDb.collection("users").doc(rulesUid).set({
      marker: expectedWebMarker,
    });
    timeline.push("ordered-admin-documents-prepared");

    rulesClient = rulesTestEnvironment
      .authenticatedContext(rulesUid)
      .firestore();
    timeline.push("web-read-start");
    const webReadSnapshot = await getDocFromServer(
      doc(rulesClient, "users", rulesUid),
    );
    timeline.push("web-read-complete");
    assert.equal(webReadSnapshot.exists(), true);
    assert.equal(webReadSnapshot.get("marker"), expectedWebMarker);

    const rejectionCtx: AuthenticatedRestaurantContext = {
      uid: "diag-handler-rejection-history-user",
      email: "diag-handler-rejection-history@example.test",
      emailVerified: true,
      restaurantId,
      role: "waiter",
      canManageUsers: false,
      db: adminDb,
    };
    assert.equal(rejectionCtx.db, adminDb);

    timeline.push("rejection-history-phase-start");
    for (let index = 1; index <= REJECTION_HISTORY_COUNT; index += 1) {
      rejectionHistory.push(
        await runSequentialRejectionHistoryCall(
          adminDb,
          rejectionCtx,
          index,
          restaurantId,
          timeline,
        ),
      );
    }
    assert.equal(rejectionHistory.length, REJECTION_HISTORY_COUNT);
    assert.ok(
      rejectionHistory.every(
        (entry) =>
          entry.result.status === 409 &&
          entry.result.error === "OPERATOR_ALREADY_ASSIGNED" &&
          entry.documentsUnchanged === true,
      ),
    );
    timeline.push("rejection-history-phase-complete");

    const tableRef = adminDb.collection("tables").doc(contentionTableId);
    const orderRef = adminDb.collection("orders").doc(contentionOrderId);
    await Promise.all([
      tableRef.set({ restaurantId }),
      orderRef.set({
        restaurantId,
        tableId: contentionTableId,
        status: "open",
        items: initialContentionItems,
        total: 5,
      }),
    ]);
    timeline.push("contention-documents-prepared");

    const ctxA: AuthenticatedRestaurantContext = {
      uid: "diag-handler-rejection-history-user-a",
      email: "diag-handler-rejection-history-a@example.test",
      emailVerified: true,
      restaurantId,
      role: "waiter",
      canManageUsers: false,
      db: adminDb,
    };
    const ctxB: AuthenticatedRestaurantContext = {
      ...ctxA,
      uid: "diag-handler-rejection-history-user-b",
      email: "diag-handler-rejection-history-b@example.test",
      db: adminDb,
    };
    assert.equal(ctxA.db, adminDb);
    assert.equal(ctxB.db, adminDb);
    assert.equal(ctxA.db, ctxB.db);

    const intentA = {
      tableId: contentionTableId.trim(),
      orderId: contentionOrderId.trim(),
      assignedOperatorId: "diag-operator-a",
      assignedOperatorName: "Operador A",
    };
    const intentB = {
      tableId: contentionTableId.trim(),
      orderId: contentionOrderId.trim(),
      assignedOperatorId: "diag-operator-b",
      assignedOperatorName: "Operador B",
    };
    for (const value of [
      intentA.tableId,
      intentA.orderId,
      intentA.assignedOperatorId,
      intentA.assignedOperatorName,
      intentB.assignedOperatorId,
      intentB.assignedOperatorName,
    ]) {
      assert.ok(value.trim());
    }

    timeline.push("handler-calls-start");
    const handlerAStartedAt = performance.now();
    const promiseA = handleAssignTableOperator(ctxA, intentA);
    const handlerADispatchedAt = performance.now();
    timeline.push("handler-a-dispatched");
    const handlerBStartedAt = performance.now();
    const promiseB = handleAssignTableOperator(ctxB, intentB);
    const handlerBDispatchedAt = performance.now();
    timeline.push("handler-b-dispatched");
    const resultsAwaitStartedAt = performance.now();
    assert.ok(handlerAStartedAt <= handlerADispatchedAt);
    assert.ok(handlerADispatchedAt <= handlerBStartedAt);
    assert.ok(handlerBStartedAt <= handlerBDispatchedAt);
    assert.ok(handlerBDispatchedAt <= resultsAwaitStartedAt);

    const outcomes = await Promise.allSettled([promiseA, promiseB]);
    timeline.push("handler-results-complete");
    assert.equal(
      outcomes.every((outcome) => outcome.status === "fulfilled"),
      true,
    );
    const values = outcomes.map((outcome) => {
      assert.equal(outcome.status, "fulfilled");
      return outcome.value;
    });
    const successful = values.filter(
      (value) => "assigned" in value && value.assigned === true,
    );
    const conflicts = values.filter(
      (value) =>
        "error" in value &&
        value.status === 409 &&
        value.error === "OPERATOR_ALREADY_ASSIGNED",
    );
    assert.equal(successful.length, 1);
    assert.equal(conflicts.length, 1);
    assert.deepEqual(successful[0], {
      assigned: true,
      tableId: contentionTableId,
      orderId: contentionOrderId,
    });

    const winningOperatorId =
      values[0] === successful[0]
        ? intentA.assignedOperatorId
        : intentB.assignedOperatorId;
    const winningOperatorName =
      winningOperatorId === intentA.assignedOperatorId
        ? intentA.assignedOperatorName
        : intentB.assignedOperatorName;
    const rejectedOperatorId =
      winningOperatorId === intentA.assignedOperatorId
        ? intentB.assignedOperatorId
        : intentA.assignedOperatorId;

    const [tableSnapshot, orderSnapshot] = await Promise.all([
      tableRef.get(),
      orderRef.get(),
    ]);
    assert.equal(tableSnapshot.exists, true);
    assert.equal(orderSnapshot.exists, true);
    const table = tableSnapshot.data()!;
    const order = orderSnapshot.data()!;
    assert.equal(table.restaurantId, restaurantId);
    assert.equal(order.restaurantId, restaurantId);
    assert.equal(order.tableId, contentionTableId);
    assert.equal(order.status, "open");
    assert.equal(table.assignedOperatorId, winningOperatorId);
    assert.equal(order.assignedOperatorId, winningOperatorId);
    assert.equal(table.assignedOperatorName, winningOperatorName);
    assert.equal(order.assignedOperatorName, winningOperatorName);
    assert.notEqual(table.assignedOperatorId, rejectedOperatorId);
    assert.notEqual(order.assignedOperatorId, rejectedOperatorId);
    const timestamps = [
      table.assignedAt,
      table.updatedAt,
      order.assignedAt,
      order.updatedAt,
    ];
    timestamps.forEach((value) => assert.ok(value instanceof Timestamp));
    assert.deepEqual(order.items, initialContentionItems);
    assert.equal(order.total, 5);
    timeline.push("final-state-validated");

    diagnostic = {
      appsBeforeRules,
      appsAfterRules,
      timeline,
      rejectionHistoryCount: REJECTION_HISTORY_COUNT,
      rejectionHistory,
      webReadOperations: 1,
      webReadExists: webReadSnapshot.exists(),
      webReadMarker: webReadSnapshot.get("marker"),
      dbIdentity: {
        rejectionCtxIsAdminDb: rejectionCtx.db === adminDb,
        ctxAIsAdminDb: ctxA.db === adminDb,
        ctxBIsAdminDb: ctxB.db === adminDb,
        contextsShareDb: ctxA.db === ctxB.db,
      },
      dispatchTimes: {
        handlerAStartedAt,
        handlerADispatchedAt,
        handlerBStartedAt,
        handlerBDispatchedAt,
        resultsAwaitStartedAt,
      },
      outcomes,
      values,
      winner: winningOperatorId,
      rejectedOperator: rejectedOperatorId,
      conflictForm: "fulfilled-value",
      finalState: {
        tableOperatorId: table.assignedOperatorId,
        orderOperatorId: order.assignedOperatorId,
        tableOperatorName: table.assignedOperatorName,
        orderOperatorName: order.assignedOperatorName,
        restaurantId: order.restaurantId,
        tableId: order.tableId,
        status: order.status,
        items: order.items,
        total: order.total,
      },
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
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) {
      throw new AggregateError(cleanupErrors, "Rules and Admin cleanup failed");
    }
  }

  assert.equal(rulesCleanupCompleted, true);
  assert.equal(adminDeleteCompleted, true);
  assert.equal(getApps().length, 0);
  assert.ok(rulesClient);
  assert.ok(diagnostic);
  console.log(
    `RULES_BEFORE_ADMIN_HANDLER_REJECTION_HISTORY_DIAGNOSTIC ${JSON.stringify({
      ...diagnostic,
      rulesCleanupCompleted,
      adminDeleteCompleted,
      appsAfterDelete: getApps().length,
    })}`,
  );
});
