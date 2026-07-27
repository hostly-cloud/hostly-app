import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDocFromServer } from "firebase/firestore";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";

type RulesTestFirestore = ReturnType<
  ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]
>;
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";

const PROJECT_ID = "demo-hostly-tx-contention";
const OVERLAP_DELAY_MS = 25;

let adminApp: App;
let adminDb: Firestore;

type DocumentPair = {
  first: DocumentReference;
  second: DocumentReference;
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

async function seedDocumentPair(id: string): Promise<DocumentPair> {
  const first = adminDb.collection("transactionContention").doc(`${id}-first`);
  const second = adminDb.collection("transactionContention").doc(`${id}-second`);
  await Promise.all([
    first.set({ revision: 0 }),
    second.set({ revision: 0 }),
  ]);
  return { first, second };
}

async function updateDocumentPair(
  pair: DocumentPair,
  actor: string,
  overlapDelayMs: number,
): Promise<void> {
  await adminDb.runTransaction(async (transaction) => {
    const firstSnapshot = await transaction.get(pair.first);
    const secondSnapshot = await transaction.get(pair.second);

    if (overlapDelayMs > 0) {
      await delay(overlapDelayMs);
    }

    const firstRevision = Number(firstSnapshot.get("revision"));
    const secondRevision = Number(secondSnapshot.get("revision"));
    transaction.update(pair.first, {
      lastActor: actor,
      revision: firstRevision + 1,
    });
    transaction.update(pair.second, {
      lastActor: actor,
      revision: secondRevision + 1,
    });
  });
}

async function assertPairRevision(
  pair: DocumentPair,
  expectedRevision: number,
): Promise<void> {
  const [firstSnapshot, secondSnapshot] = await Promise.all([
    pair.first.get(),
    pair.second.get(),
  ]);
  assert.equal(firstSnapshot.get("revision"), expectedRevision);
  assert.equal(secondSnapshot.get("revision"), expectedRevision);
}

async function assignDocumentPairWriteOnce(
  pair: DocumentPair,
  actor: string,
): Promise<string> {
  await adminDb.runTransaction(async (transaction) => {
    const firstSnapshot = await transaction.get(pair.first);
    const secondSnapshot = await transaction.get(pair.second);

    await delay(OVERLAP_DELAY_MS);

    const firstActor = String(firstSnapshot.get("assignedActor") ?? "").trim();
    const secondActor = String(secondSnapshot.get("assignedActor") ?? "").trim();
    if (
      (firstActor && firstActor !== actor) ||
      (secondActor && secondActor !== actor)
    ) {
      throw new DiagnosticWriteOnceConflictError();
    }

    transaction.update(pair.first, { assignedActor: actor });
    transaction.update(pair.second, { assignedActor: actor });
  });

  return actor;
}

type EarlyAbortEventName =
  | "callback-start"
  | "first-read-complete"
  | "second-read-start"
  | "second-read-complete"
  | "conflict-after-first"
  | "conflict-after-second"
  | "writes-enqueued";

type EarlyAbortEvent = {
  actor: string;
  attempt: number;
  event: EarlyAbortEventName;
  observedActor?: string;
};

type EarlyAbortInstrumentation = {
  events: EarlyAbortEvent[];
  attempts: Map<string, number>;
  startCallback(actor: string): number;
  record(
    actor: string,
    attempt: number,
    event: EarlyAbortEventName,
    observedActor?: string,
  ): void;
};

function createEarlyAbortInstrumentation(): EarlyAbortInstrumentation {
  const events: EarlyAbortEvent[] = [];
  const attempts = new Map<string, number>();
  return {
    events,
    attempts,
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

async function assignDocumentPairWithEarlyAbort(
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

    transaction.update(pair.first, { assignedActor: actor });
    transaction.update(pair.second, { assignedActor: actor });
    instrumentation.record(actor, attempt, "writes-enqueued");
  });

  return actor;
}

async function assignDocumentPairWithEarlyAbortAndTransforms(
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

describe("Firestore Admin transaction contention diagnostic", () => {
  before(() => {
    adminApp = initializeApp({ projectId: PROJECT_ID }, PROJECT_ID);
    adminDb = getFirestore(adminApp);
  });

  after(async () => {
    await deleteApp(adminApp);
  });

  test("sequential control updates the same two documents twice", async () => {
    const pair = await seedDocumentPair("sequential-control");

    await updateDocumentPair(pair, "first", 0);
    await updateDocumentPair(pair, "second", 0);

    await assertPairRevision(pair, 2);
  });

  test("concurrent Admin transactions update the same two documents", async () => {
    const pair = await seedDocumentPair("concurrent");

    await Promise.all([
      updateDocumentPair(pair, "first", OVERLAP_DELAY_MS),
      updateDocumentPair(pair, "second", OVERLAP_DELAY_MS),
    ]);

    await assertPairRevision(pair, 2);
  });

  test("concurrent Admin write-once transactions yield one winner and one domain conflict", async () => {
    const pair = await seedDocumentPair("write-once");
    const actors = ["admin-actor-a", "admin-actor-b"] as const;

    const outcomes = await Promise.allSettled([
      assignDocumentPairWriteOnce(pair, actors[0]),
      assignDocumentPairWriteOnce(pair, actors[1]),
    ]);
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<string> =>
        outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected",
    );

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]!.reason instanceof DiagnosticWriteOnceConflictError);

    const winner = fulfilled[0]!.value;
    assert.ok(actors.includes(winner as (typeof actors)[number]));

    const [firstSnapshot, secondSnapshot] = await Promise.all([
      pair.first.get(),
      pair.second.get(),
    ]);
    const firstActor = String(firstSnapshot.get("assignedActor") ?? "").trim();
    const secondActor = String(secondSnapshot.get("assignedActor") ?? "").trim();
    assert.equal(firstActor, winner);
    assert.equal(secondActor, winner);

    console.log(
      `WRITE_ONCE_DIAGNOSTIC ${JSON.stringify({
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
        finalActors: [firstActor, secondActor],
      })}`,
    );
  });

  test("concurrent Admin write-once retry aborts before its second read", async () => {
    const pair = await seedDocumentPair("early-abort");
    const actors = ["admin-actor-a", "admin-actor-b"] as const;
    const instrumentation = createEarlyAbortInstrumentation();

    const outcomes = await Promise.allSettled([
      assignDocumentPairWithEarlyAbort(pair, actors[0], instrumentation),
      assignDocumentPairWithEarlyAbort(pair, actors[1], instrumentation),
    ]);
    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<string> =>
        outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected",
    );

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]!.reason instanceof DiagnosticWriteOnceConflictError);

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
    const firstActor = String(firstSnapshot.get("assignedActor") ?? "").trim();
    const secondActor = String(secondSnapshot.get("assignedActor") ?? "").trim();
    assert.equal(firstActor, winner);
    assert.equal(secondActor, winner);

    console.log(
      `EARLY_ABORT_DIAGNOSTIC ${JSON.stringify({
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
      })}`,
    );
  });

  test("concurrent Admin early-abort transactions persist Admin timestamp transforms", async () => {
    const pair = await seedDocumentPair("early-abort-transforms");
    const actors = ["admin-actor-a", "admin-actor-b"] as const;
    const instrumentation = createEarlyAbortInstrumentation();

    const outcomes = await Promise.allSettled([
      assignDocumentPairWithEarlyAbortAndTransforms(
        pair,
        actors[0],
        instrumentation,
      ),
      assignDocumentPairWithEarlyAbortAndTransforms(
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

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]!.reason instanceof DiagnosticWriteOnceConflictError);

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
    const firstActor = String(firstSnapshot.get("assignedActor") ?? "").trim();
    const secondActor = String(secondSnapshot.get("assignedActor") ?? "").trim();
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

    console.log(
      `TRANSFORMS_DIAGNOSTIC ${JSON.stringify({
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
      })}`,
    );
  });

  test("Admin timestamp transactions coexist with an idle Rules test client", async () => {
    const pair = await seedDocumentPair("rules-coexistence");
    const actors = ["admin-actor-a", "admin-actor-b"] as const;
    const instrumentation = createEarlyAbortInstrumentation();
    const { host, port } = readFirestoreEmulatorAddress();
    let rulesTestEnvironment: RulesTestEnvironment | undefined;
    let rulesClient: unknown;
    let rulesInitialized = false;
    let cleanupCompleted = false;
    let diagnostic: Record<string, unknown> | null = null;

    try {
      rulesTestEnvironment = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          host,
          port,
          rules: readFileSync("firestore.rules", "utf8"),
        },
      });
      rulesInitialized = true;
      rulesClient = rulesTestEnvironment
        .authenticatedContext("rules-idle-diagnostic")
        .firestore();

      const outcomes = await Promise.allSettled([
        assignDocumentPairWithEarlyAbortAndTransforms(
          pair,
          actors[0],
          instrumentation,
        ),
        assignDocumentPairWithEarlyAbortAndTransforms(
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

      diagnostic = {
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
        rulesInitialized,
        rulesClientCreated: rulesClient != null,
        rulesClientOperations: 0,
      };
    } finally {
      if (rulesTestEnvironment) {
        await rulesTestEnvironment.cleanup();
        cleanupCompleted = true;
      }
    }

    assert.equal(rulesInitialized, true);
    assert.equal(cleanupCompleted, true);
    assert.ok(diagnostic);
    console.log(
      `RULES_COEXISTENCE_DIAGNOSTIC ${JSON.stringify({
        ...diagnostic,
        cleanupCompleted,
      })}`,
    );
  });

  test("Admin timestamp transactions follow one completed Rules web read", async () => {
    const pair = await seedDocumentPair("rules-web-read");
    const rulesUid = "rules-web-read-diagnostic";
    const expectedWebMarker = "web-read-complete-before-admin";
    await adminDb.collection("users").doc(rulesUid).set({
      marker: expectedWebMarker,
    });

    const actors = ["admin-actor-a", "admin-actor-b"] as const;
    const instrumentation = createEarlyAbortInstrumentation();
    const { host, port } = readFirestoreEmulatorAddress();
    const timeline: string[] = [];
    let rulesTestEnvironment: RulesTestEnvironment | undefined;
    let rulesClient: RulesTestFirestore | undefined;
    let rulesInitialized = false;
    let cleanupCompleted = false;
    let diagnostic: Record<string, unknown> | null = null;

    try {
      rulesTestEnvironment = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          host,
          port,
          rules: readFileSync("firestore.rules", "utf8"),
        },
      });
      rulesInitialized = true;
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
          pair,
          actors[0],
          instrumentation,
        ),
        assignDocumentPairWithEarlyAbortAndTransforms(
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

      diagnostic = {
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
        rulesInitialized,
        rulesClientCreated: rulesClient != null,
        webReadOperations: 1,
        webReadExists: webReadSnapshot.exists(),
        webReadMarker: webReadSnapshot.get("marker"),
        timeline,
      };
    } finally {
      if (rulesTestEnvironment) {
        await rulesTestEnvironment.cleanup();
        cleanupCompleted = true;
      }
    }

    assert.equal(rulesInitialized, true);
    assert.equal(cleanupCompleted, true);
    assert.ok(diagnostic);
    console.log(
      `RULES_WEB_READ_DIAGNOSTIC ${JSON.stringify({
        ...diagnostic,
        cleanupCompleted,
      })}`,
    );
  });
});
