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
  type Firestore,
} from "firebase-admin/firestore";
import { doc, getDocFromServer } from "firebase/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";

type RulesTestFirestore = ReturnType<
  ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]
>;
import { handleAssignTableOperator } from "@/lib/server/tpv/handle-tpv-order-mutations";

const PROJECT_ID = "demo-hostly-tx-contention";
const ADMIN_APP_NAME = "rules-before-admin-handler-history-diagnostic";
const HANDLER_HISTORY_COUNT = 7;

type HandlerHistoryDiagnostic = {
  index: number;
  tableId: string;
  orderId: string;
  operatorId: string;
  operatorName: string;
  result: { assigned: boolean; tableId: string; orderId?: string };
  timestampTypes: string[];
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

function assertNotMutationError(
  value: unknown,
): asserts value is { assigned: boolean; tableId: string; orderId?: string } {
  assert.ok(value && typeof value === "object");
  assert.equal("error" in value, false);
  assert.equal("status" in value, false);
}

function buildHistoryItems(index: number) {
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

async function validateAssignedPairState(params: {
  tableRef: DocumentReference;
  orderRef: DocumentReference;
  restaurantId: string;
  tableId: string;
  operatorId: string;
  operatorName: string;
  initialItems: ReturnType<typeof buildHistoryItems>;
}): Promise<string[]> {
  const {
    tableRef,
    orderRef,
    restaurantId,
    tableId,
    operatorId,
    operatorName,
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
  assert.equal(table.assignedOperatorId, operatorId);
  assert.equal(order.assignedOperatorId, operatorId);
  assert.equal(table.assignedOperatorName, operatorName);
  assert.equal(order.assignedOperatorName, operatorName);
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
  return timestamps.map((value) => value.constructor.name);
}

async function runSequentialHandlerHistoryCall(
  adminDb: Firestore,
  ctx: AuthenticatedRestaurantContext,
  index: number,
  restaurantId: string,
  timeline: string[],
): Promise<HandlerHistoryDiagnostic> {
  const tableId = `diag-handler-history-table-${index}`;
  const orderId = `diag-handler-history-order-${index}`;
  const operatorId = `diag-history-operator-${index}`;
  const operatorName = `Operador histórico ${index}`;
  const initialItems = buildHistoryItems(index);

  timeline.push(`handler-history-${index}-start`);

  const tableRef = adminDb.collection("tables").doc(tableId);
  const orderRef = adminDb.collection("orders").doc(orderId);
  await Promise.all([
    tableRef.set({ restaurantId }),
    orderRef.set({
      restaurantId,
      tableId,
      status: "open",
      items: initialItems,
      total: 5,
    }),
  ]);

  assert.equal(ctx.db, adminDb);

  const intent = {
    tableId,
    orderId,
    assignedOperatorId: operatorId,
    assignedOperatorName: operatorName,
  };

  const result = await handleAssignTableOperator(ctx, intent);
  assertNotMutationError(result);
  assert.equal(result.assigned, true);
  assert.equal(result.tableId, tableId);
  assert.equal(result.orderId, orderId);

  const timestampTypes = await validateAssignedPairState({
    tableRef,
    orderRef,
    restaurantId,
    tableId,
    operatorId,
    operatorName,
    initialItems,
  });

  timeline.push(`handler-history-${index}-complete`);
  return {
    index,
    tableId,
    orderId,
    operatorId,
    operatorName,
    result: {
      assigned: result.assigned,
      tableId: result.tableId,
      orderId: result.orderId,
    },
    timestampTypes,
  };
}

test("real handler history then assignment handler contends on one Admin client", async () => {
  const firestoreRules = readFileSync("firestore.rules", "utf8");
  const appsBeforeRules = getApps().length;
  assert.equal(appsBeforeRules, 0);

  const { host, port } = readFirestoreEmulatorAddress();
  const restaurantId = "diag-handler-history-restaurant";
  const contentionTableId = "diag-handler-history-table-8";
  const contentionOrderId = "diag-handler-history-order-8";
  const rulesUid = "rules-web-read-diagnostic-handler-history";
  const expectedWebMarker =
    "rules-before-admin-handler-history-web-read-complete";
  const initialContentionItems = buildHistoryItems(8);
  const timeline: string[] = ["imports-evaluated"];
  const handlerHistory: HandlerHistoryDiagnostic[] = [];
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

    const warmupCtx: AuthenticatedRestaurantContext = {
      uid: "diag-handler-history-user",
      email: "diag-handler-history@example.test",
      emailVerified: true,
      restaurantId,
      role: "waiter",
      canManageUsers: false,
      db: adminDb,
    };
    assert.equal(warmupCtx.db, adminDb);

    timeline.push("handler-history-phase-start");
    for (let index = 1; index <= HANDLER_HISTORY_COUNT; index += 1) {
      handlerHistory.push(
        await runSequentialHandlerHistoryCall(
          adminDb,
          warmupCtx,
          index,
          restaurantId,
          timeline,
        ),
      );
    }
    assert.equal(handlerHistory.length, HANDLER_HISTORY_COUNT);
    assert.ok(handlerHistory.every((entry) => entry.result.assigned === true));
    timeline.push("handler-history-phase-complete");

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
      uid: "diag-handler-history-user-a",
      email: "diag-handler-history-a@example.test",
      emailVerified: true,
      restaurantId,
      role: "waiter",
      canManageUsers: false,
      db: adminDb,
    };
    const ctxB: AuthenticatedRestaurantContext = {
      ...ctxA,
      uid: "diag-handler-history-user-b",
      email: "diag-handler-history-b@example.test",
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
      handlerHistoryCount: HANDLER_HISTORY_COUNT,
      handlerHistory,
      webReadOperations: 1,
      webReadExists: webReadSnapshot.exists(),
      webReadMarker: webReadSnapshot.get("marker"),
      dbIdentity: {
        warmupCtxIsAdminDb: warmupCtx.db === adminDb,
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
    `RULES_BEFORE_ADMIN_HANDLER_HISTORY_DIAGNOSTIC ${JSON.stringify({
      ...diagnostic,
      rulesCleanupCompleted,
      adminDeleteCompleted,
      appsAfterDelete: getApps().length,
    })}`,
  );
});
