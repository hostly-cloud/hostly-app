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

type RulesTestFirestore = ReturnType<
  ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]
>;

const PROJECT_ID = "demo-hostly-tx-contention";
const ADMIN_APP_NAME = "rules-before-admin-contention-diagnostic";
const OVERLAP_DELAY_MS = 25;

type DocumentPair = {
  first: DocumentReference;
  second: DocumentReference;
};

type EarlyAbortEventName =
  | "callback-start"
  | "first-read-complete"
  | "conflict-after-first"
  | "second-read-start"
  | "second-read-complete"
  | "conflict-after-second"
  | "writes-enqueued";

type EarlyAbortEvent = {
  actor: string;
  attempt: number;
  event: EarlyAbortEventName;
  observedActor?: string;
};

type EarlyAbortInstrumentation = {
  attempts: Map<string, number>;
  events: EarlyAbortEvent[];
  startCallback: (actor: string) => number;
  record: (
    actor: string,
    attempt: number,
    event: EarlyAbortEventName,
    observedActor?: string,
  ) => void;
};

class DiagnosticWriteOnceConflictError extends Error {
  constructor() {
    super("DIAGNOSTIC_WRITE_ONCE_CONFLICT");
    this.name = "DiagnosticWriteOnceConflictError";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readFirestoreEmulatorAddress(): { host: string; port: number } {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST?.trim() ?? "";
  assert.ok(emulatorHost);
  const emulatorUrl = new URL(`http://${emulatorHost}`);
  const port = Number(emulatorUrl.port);
  assert.ok(emulatorUrl.hostname);
  assert.ok(Number.isInteger(port) && port > 0);
  return { host: emulatorUrl.hostname, port };
}

function createEarlyAbortInstrumentation(): EarlyAbortInstrumentation {
  const attempts = new Map<string, number>();
  const events: EarlyAbortEvent[] = [];

  return {
    attempts,
    events,
    startCallback(actor) {
      const attempt = (attempts.get(actor) ?? 0) + 1;
      attempts.set(actor, attempt);
      events.push({ actor, attempt, event: "callback-start" });
      return attempt;
    },
    record(actor, attempt, event, observedActor) {
      events.push({
        actor,
        attempt,
        event,
        ...(observedActor ? { observedActor } : {}),
      });
    },
  };
}

async function assignDocumentPairWithEarlyAbortAndTransforms(
  adminDb: Firestore,
  pair: DocumentPair,
  actor: string,
  instrumentation: EarlyAbortInstrumentation,
): Promise<string> {
  await adminDb.runTransaction(async (transaction) => {
    const attempt = instrumentation.startCallback(actor);
    const firstSnapshot = await transaction.get(pair.first);
    instrumentation.record(actor, attempt, "first-read-complete");

    await delay(OVERLAP_DELAY_MS);

    const firstActor = String(firstSnapshot.get("assignedActor") ?? "").trim();
    if (firstActor && firstActor !== actor) {
      instrumentation.record(
        actor,
        attempt,
        "conflict-after-first",
        firstActor,
      );
      throw new DiagnosticWriteOnceConflictError();
    }

    instrumentation.record(actor, attempt, "second-read-start");
    const secondSnapshot = await transaction.get(pair.second);
    instrumentation.record(actor, attempt, "second-read-complete");

    const secondActor = String(secondSnapshot.get("assignedActor") ?? "").trim();
    if (secondActor && secondActor !== actor) {
      instrumentation.record(
        actor,
        attempt,
        "conflict-after-second",
        secondActor,
      );
      throw new DiagnosticWriteOnceConflictError();
    }

    const payload = {
      assignedActor: actor,
      assignedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.update(pair.first, payload);
    transaction.update(pair.second, payload);
    instrumentation.record(actor, attempt, "writes-enqueued");
  });

  return actor;
}

test("Rules initializes before the Admin transaction client", async () => {
  const firestoreRules = readFileSync("firestore.rules", "utf8");
  const appsBeforeRules = getApps().length;
  assert.equal(appsBeforeRules, 0);

  const { host, port } = readFirestoreEmulatorAddress();
  const timeline: string[] = [];
  const actors = ["admin-actor-a", "admin-actor-b"] as const;
  const rulesUid = "rules-web-read-diagnostic-order";
  const expectedWebMarker = "rules-before-admin-web-read-complete";
  const instrumentation = createEarlyAbortInstrumentation();
  let rulesTestEnvironment: RulesTestEnvironment | undefined;
  let orderedAdminApp: App | undefined;
  let orderedAdminDb: Firestore | undefined;
  let rulesClient: RulesTestFirestore | undefined;
  let rulesCleanupCompleted = false;
  let adminDeleteCompleted = false;
  let diagnostic: Record<string, unknown> | null = null;

  try {
    rulesTestEnvironment = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host,
        port,
        rules: firestoreRules,
      },
    });
    timeline.push("rules-environment-complete");

    const appsAfterRules = getApps().length;
    assert.equal(appsAfterRules, 0);

    orderedAdminApp = initializeApp(
      { projectId: PROJECT_ID },
      ADMIN_APP_NAME,
    );
    orderedAdminDb = getFirestore(orderedAdminApp);
    timeline.push("ordered-admin-created");

    const pair: DocumentPair = {
      first: orderedAdminDb
        .collection("transactionContention")
        .doc("rules-before-admin-first"),
      second: orderedAdminDb
        .collection("transactionContention")
        .doc("rules-before-admin-second"),
    };
    await Promise.all([
      pair.first.set({ revision: 0 }),
      pair.second.set({ revision: 0 }),
      orderedAdminDb.collection("users").doc(rulesUid).set({
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

    timeline.push("admin-transactions-start");
    const outcomes = await Promise.allSettled([
      assignDocumentPairWithEarlyAbortAndTransforms(
        orderedAdminDb,
        pair,
        actors[0],
        instrumentation,
      ),
      assignDocumentPairWithEarlyAbortAndTransforms(
        orderedAdminDb,
        pair,
        actors[1],
        instrumentation,
      ),
    ]);
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<string> =>
        outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected",
    );

    assert.deepEqual(timeline, [
      "rules-environment-complete",
      "ordered-admin-created",
      "ordered-admin-documents-prepared",
      "web-read-start",
      "web-read-complete",
      "admin-transactions-start",
    ]);
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(
      rejected[0]!.reason instanceof DiagnosticWriteOnceConflictError,
    );

    const winner = fulfilled[0]!.value;
    assert.ok(actors.includes(winner as (typeof actors)[number]));
    const rejectedIndex = outcomes.findIndex(
      (outcome) => outcome.status === "rejected",
    );
    assert.ok(rejectedIndex >= 0);
    const rejectedActor = actors[rejectedIndex]!;
    const rejectedAttempts =
      instrumentation.attempts.get(rejectedActor) ?? 0;
    assert.ok(rejectedAttempts >= 2);

    const conflictEvents = instrumentation.events.filter(
      (event) =>
        event.actor === rejectedActor &&
        event.event === "conflict-after-first",
    );
    assert.equal(conflictEvents.length, 1);
    const conflictEvent = conflictEvents[0]!;
    assert.equal(conflictEvent.observedActor, winner);
    const conflictAttemptEvents = instrumentation.events.filter(
      (event) =>
        event.actor === rejectedActor &&
        event.attempt === conflictEvent.attempt,
    );
    assert.ok(
      conflictAttemptEvents.some(
        (event) => event.event === "first-read-complete",
      ),
    );
    assert.equal(
      conflictAttemptEvents.some(
        (event) => event.event === "second-read-start",
      ),
      false,
    );

    const [firstSnapshot, secondSnapshot] = await Promise.all([
      pair.first.get(),
      pair.second.get(),
    ]);
    const firstActor = String(
      firstSnapshot.get("assignedActor") ?? "",
    ).trim();
    const secondActor = String(
      secondSnapshot.get("assignedActor") ?? "",
    ).trim();
    const firstAssignedAt = firstSnapshot.get("assignedAt");
    const firstUpdatedAt = firstSnapshot.get("updatedAt");
    const secondAssignedAt = secondSnapshot.get("assignedAt");
    const secondUpdatedAt = secondSnapshot.get("updatedAt");
    assert.equal(firstActor, winner);
    assert.equal(secondActor, winner);
    assert.ok(firstAssignedAt instanceof Timestamp);
    assert.ok(firstUpdatedAt instanceof Timestamp);
    assert.ok(secondAssignedAt instanceof Timestamp);
    assert.ok(secondUpdatedAt instanceof Timestamp);
    assert.ok(rulesClient);
    assert.ok(orderedAdminDb);

    diagnostic = {
      appsBeforeRules,
      appsAfterRules,
      timeline,
      outcomes: outcomes.map((outcome) =>
        outcome.status === "fulfilled"
          ? { status: outcome.status, actor: outcome.value }
          : {
              status: outcome.status,
              errorName:
                outcome.reason instanceof Error
                  ? outcome.reason.name
                  : typeof outcome.reason,
              errorMessage:
                outcome.reason instanceof Error
                  ? outcome.reason.message
                  : String(outcome.reason),
            },
      ),
      winner,
      rejectedActor,
      callbackAttempts: Object.fromEntries(instrumentation.attempts),
      conflictAttempt: conflictEvent.attempt,
      conflictAttemptEvents: conflictAttemptEvents.map(
        (event) => event.event,
      ),
      finalActors: [firstActor, secondActor],
      timestamps: {
        first: {
          assignedAtMs: firstAssignedAt.toMillis(),
          updatedAtMs: firstUpdatedAt.toMillis(),
        },
        second: {
          assignedAtMs: secondAssignedAt.toMillis(),
          updatedAtMs: secondUpdatedAt.toMillis(),
        },
      },
      timestampTypes: {
        firstAssignedAt: firstAssignedAt.constructor.name,
        firstUpdatedAt: firstUpdatedAt.constructor.name,
        secondAssignedAt: secondAssignedAt.constructor.name,
        secondUpdatedAt: secondUpdatedAt.constructor.name,
      },
      webReadOperations: 1,
      webReadExists: webReadSnapshot.exists(),
      webReadMarker: webReadSnapshot.get("marker"),
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

    if (cleanupErrors.length === 1) {
      throw cleanupErrors[0];
    }
    if (cleanupErrors.length > 1) {
      throw new AggregateError(
        cleanupErrors,
        "Rules cleanup and Admin deleteApp both failed",
      );
    }
  }

  assert.equal(rulesCleanupCompleted, true);
  assert.equal(adminDeleteCompleted, true);
  assert.equal(getApps().length, 0);
  assert.ok(diagnostic);
  console.log(
    `RULES_BEFORE_ADMIN_DIAGNOSTIC ${JSON.stringify({
      ...diagnostic,
      rulesCleanupCompleted,
      adminDeleteCompleted,
      appsAfterDelete: getApps().length,
    })}`,
  );
});
