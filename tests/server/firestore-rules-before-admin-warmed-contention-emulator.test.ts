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
const ADMIN_APP_NAME = "rules-before-admin-warmed-contention-diagnostic";
const OVERLAP_DELAY_MS = 25;
const WARMUP_COUNT = 7;

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

type WarmupDiagnostic = {
  index: number;
  callbacks: number;
  events: string[];
  finalActors: string[];
  timestampTypes: string[];
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

    const firstSnapshot = await transaction.get(pair.first);
    events.push("first-read-complete");
    const secondSnapshot = await transaction.get(pair.second);
    events.push("second-read-complete");

    assert.equal(firstSnapshot.get("assignedActor"), undefined);
    assert.equal(secondSnapshot.get("assignedActor"), undefined);

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

  const [firstSnapshot, secondSnapshot] = await Promise.all([
    pair.first.get(),
    pair.second.get(),
  ]);
  const firstActor = String(firstSnapshot.get("assignedActor") ?? "").trim();
  const secondActor = String(secondSnapshot.get("assignedActor") ?? "").trim();
  const timestamps = [
    firstSnapshot.get("assignedAt"),
    firstSnapshot.get("updatedAt"),
    secondSnapshot.get("assignedAt"),
    secondSnapshot.get("updatedAt"),
  ];
  assert.equal(firstActor, actor);
  assert.equal(secondActor, actor);
  for (const timestamp of timestamps) {
    assert.ok(timestamp instanceof Timestamp);
  }
  timeline.push(`warmup-${index}-complete`);

  return {
    index,
    callbacks,
    events,
    finalActors: [firstActor, secondActor],
    timestampTypes: timestamps.map(
      (timestamp) => timestamp.constructor.name,
    ),
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

test("Rules-created Admin client is reused after sequential warmups", async () => {
  const firestoreRules = readFileSync("firestore.rules", "utf8");
  const appsBeforeRules = getApps().length;
  assert.equal(appsBeforeRules, 0);

  const { host, port } = readFirestoreEmulatorAddress();
  const timeline: string[] = [];
  const actors = ["admin-actor-a", "admin-actor-b"] as const;
  const rulesUid = "rules-web-read-diagnostic-warmed";
  const expectedWebMarker = "rules-before-admin-warmed-web-read-complete";
  const instrumentation = createEarlyAbortInstrumentation();
  const warmupDiagnostics: WarmupDiagnostic[] = [];
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
    const adminDb = getFirestore(orderedAdminApp);
    orderedAdminDb = adminDb;
    timeline.push("ordered-admin-created");

    const concurrentPair: DocumentPair = {
      first: adminDb
        .collection("transactionContention")
        .doc("rules-before-admin-warmed-first"),
      second: adminDb
        .collection("transactionContention")
        .doc("rules-before-admin-warmed-second"),
    };
    const warmupPairs = Array.from(
      { length: WARMUP_COUNT },
      (_, zeroBasedIndex): DocumentPair => {
        const index = zeroBasedIndex + 1;
        return {
          first: adminDb
            .collection("transactionContention")
            .doc(`rules-before-admin-warmup-${index}-first`),
          second: adminDb
            .collection("transactionContention")
            .doc(`rules-before-admin-warmup-${index}-second`),
        };
      },
    );
    await Promise.all([
      concurrentPair.first.set({ revision: 0 }),
      concurrentPair.second.set({ revision: 0 }),
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
      const warmupDiagnostic = await runSequentialWarmup(
        adminDb,
        warmupPairs[index - 1]!,
        index,
        timeline,
      );
      warmupDiagnostics.push(warmupDiagnostic);
    }
    assert.equal(warmupDiagnostics.length, WARMUP_COUNT);
    assert.ok(
      warmupDiagnostics.every((warmup) => warmup.callbacks === 1),
    );
    timeline.push("warmup-phase-complete");

    timeline.push("admin-transactions-start");
    const outcomes = await Promise.allSettled([
      assignDocumentPairWithEarlyAbortAndTransforms(
        adminDb,
        concurrentPair,
        actors[0],
        instrumentation,
      ),
      assignDocumentPairWithEarlyAbortAndTransforms(
        adminDb,
        concurrentPair,
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

    const expectedTimeline = [
      "rules-environment-complete",
      "ordered-admin-created",
      "ordered-admin-documents-prepared",
      "web-read-start",
      "web-read-complete",
      "warmup-phase-start",
      ...Array.from({ length: WARMUP_COUNT }, (_, zeroBasedIndex) => {
        const index = zeroBasedIndex + 1;
        return [`warmup-${index}-start`, `warmup-${index}-complete`];
      }).flat(),
      "warmup-phase-complete",
      "admin-transactions-start",
    ];
    assert.deepEqual(timeline, expectedTimeline);
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
      concurrentPair.first.get(),
      concurrentPair.second.get(),
    ]);
    const firstActor = String(
      firstSnapshot.get("assignedActor") ?? "",
    ).trim();
    const secondActor = String(
      secondSnapshot.get("assignedActor") ?? "",
    ).trim();
    const timestamps = [
      firstSnapshot.get("assignedAt"),
      firstSnapshot.get("updatedAt"),
      secondSnapshot.get("assignedAt"),
      secondSnapshot.get("updatedAt"),
    ];
    assert.equal(firstActor, winner);
    assert.equal(secondActor, winner);
    for (const timestamp of timestamps) {
      assert.ok(timestamp instanceof Timestamp);
    }
    assert.ok(rulesClient);
    assert.ok(orderedAdminDb);

    diagnostic = {
      appsBeforeRules,
      appsAfterRules,
      timeline,
      warmupCount: WARMUP_COUNT,
      warmups: warmupDiagnostics,
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
      timestampTypes: timestamps.map(
        (timestamp) => timestamp.constructor.name,
      ),
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
    `RULES_BEFORE_ADMIN_WARMED_DIAGNOSTIC ${JSON.stringify({
      ...diagnostic,
      rulesCleanupCompleted,
      adminDeleteCompleted,
      appsAfterDelete: getApps().length,
    })}`,
  );
});
