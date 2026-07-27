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
  type Firestore,
} from "firebase-admin/firestore";
import { doc, getDocFromServer } from "firebase/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";

type RulesTestFirestore = ReturnType<
  ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]
>;
import { handleAssignTableOperator } from "@/lib/server/tpv/handle-tpv-order-mutations";

const PROJECT_ID = "demo-hostly-tx-contention";
const ADMIN_APP_NAME = "rules-before-admin-warmed-handler-diagnostic";
const WARMUP_COUNT = 7;

type DocumentPair = {
  first: DocumentReference;
  second: DocumentReference;
};

type WarmupDiagnostic = {
  index: number;
  callbacks: number;
  events: string[];
  finalActors: string[];
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

async function runSequentialWarmup(
  adminDb: Firestore,
  pair: DocumentPair,
  index: number,
  timeline: string[],
): Promise<WarmupDiagnostic> {
  const actor = `warmup-${index}`;
  const events: string[] = [];
  let callbacks = 0;

  timeline.push(`warmup-${index}-start`);
  await adminDb.runTransaction(async (transaction) => {
    callbacks += 1;
    events.push("callback-start");
    const first = await transaction.get(pair.first);
    events.push("first-read-complete");
    const second = await transaction.get(pair.second);
    events.push("second-read-complete");
    assert.equal(first.get("assignedActor"), undefined);
    assert.equal(second.get("assignedActor"), undefined);
    const payload = {
      assignedActor: actor,
      assignedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.update(pair.first, payload);
    transaction.update(pair.second, payload);
    events.push("writes-enqueued");
  });

  assert.equal(callbacks, 1);
  assert.deepEqual(events, [
    "callback-start",
    "first-read-complete",
    "second-read-complete",
    "writes-enqueued",
  ]);
  const [first, second] = await Promise.all([pair.first.get(), pair.second.get()]);
  const finalActors = [
    String(first.get("assignedActor") ?? ""),
    String(second.get("assignedActor") ?? ""),
  ];
  const timestamps = [
    first.get("assignedAt"),
    first.get("updatedAt"),
    second.get("assignedAt"),
    second.get("updatedAt"),
  ];
  assert.deepEqual(finalActors, [actor, actor]);
  timestamps.forEach((value) => assert.ok(value instanceof Timestamp));
  timeline.push(`warmup-${index}-complete`);
  return {
    index,
    callbacks,
    events,
    finalActors,
    timestampTypes: timestamps.map((value) => value.constructor.name),
  };
}

test("real assignment handler contends on one warmed Admin client", async () => {
  const firestoreRules = readFileSync("firestore.rules", "utf8");
  const appsBeforeRules = getApps().length;
  assert.equal(appsBeforeRules, 0);

  const { host, port } = readFirestoreEmulatorAddress();
  const restaurantId = "diag-handler-restaurant";
  const tableId = "diag-handler-table";
  const orderId = "diag-handler-order";
  const rulesUid = "rules-web-read-diagnostic-handler";
  const expectedWebMarker = "rules-before-admin-handler-web-read-complete";
  const initialItems = [
    {
      id: "diag-line",
      status: "pending",
      quantity: 1,
      price: 5,
      total: 5,
    },
  ];
  const timeline: string[] = [];
  const warmups: WarmupDiagnostic[] = [];
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

    const warmupPairs = Array.from(
      { length: WARMUP_COUNT },
      (_, offset): DocumentPair => ({
        first: adminDb
          .collection("transactionContention")
          .doc(`handler-warmup-${offset + 1}-first`),
        second: adminDb
          .collection("transactionContention")
          .doc(`handler-warmup-${offset + 1}-second`),
      }),
    );
    await Promise.all([
      ...warmupPairs.flatMap((pair) => [
        pair.first.set({ revision: 0 }),
        pair.second.set({ revision: 0 }),
      ]),
      adminDb.collection("users").doc(rulesUid).set({
        marker: expectedWebMarker,
      }),
    ]);
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

    timeline.push("warmup-phase-start");
    for (let index = 1; index <= WARMUP_COUNT; index += 1) {
      warmups.push(
        await runSequentialWarmup(
          adminDb,
          warmupPairs[index - 1]!,
          index,
          timeline,
        ),
      );
    }
    assert.equal(warmups.length, WARMUP_COUNT);
    assert.ok(warmups.every((warmup) => warmup.callbacks === 1));
    timeline.push("warmup-phase-complete");

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
    timeline.push("handler-documents-prepared");

    const ctxA: AuthenticatedRestaurantContext = {
      uid: "diag-handler-user-a",
      email: "diag-handler-a@example.test",
      emailVerified: true,
      restaurantId,
      role: "waiter",
      canManageUsers: false,
      db: adminDb,
    };
    const ctxB: AuthenticatedRestaurantContext = {
      ...ctxA,
      uid: "diag-handler-user-b",
      email: "diag-handler-b@example.test",
      db: adminDb,
    };
    assert.equal(ctxA.db, adminDb);
    assert.equal(ctxB.db, adminDb);
    assert.equal(ctxA.db, ctxB.db);

    const intentA = {
      tableId: tableId.trim(),
      orderId: orderId.trim(),
      assignedOperatorId: "diag-operator-a",
      assignedOperatorName: "Operador A",
    };
    const intentB = {
      tableId: tableId.trim(),
      orderId: orderId.trim(),
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
    assert.equal(outcomes.every((outcome) => outcome.status === "fulfilled"), true);
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
    assert.deepEqual(successful[0], { assigned: true, tableId, orderId });

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
    assert.equal(order.tableId, tableId);
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
    assert.deepEqual(order.items, initialItems);
    assert.equal(order.total, 5);
    timeline.push("final-state-validated");

    diagnostic = {
      appsBeforeRules,
      appsAfterRules,
      timeline,
      warmupCount: WARMUP_COUNT,
      warmups,
      webReadOperations: 1,
      webReadExists: webReadSnapshot.exists(),
      webReadMarker: webReadSnapshot.get("marker"),
      dbIdentity: {
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
    `RULES_BEFORE_ADMIN_WARMED_HANDLER_DIAGNOSTIC ${JSON.stringify({
      ...diagnostic,
      rulesCleanupCompleted,
      adminDeleteCompleted,
      appsAfterDelete: getApps().length,
    })}`,
  );
});
