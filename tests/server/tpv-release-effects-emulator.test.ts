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
  handleAcquireReleaseEffectLease,
  handleCompleteReleaseEffect,
  RELEASE_EFFECT_LEASE_MS,
} from "@/lib/server/tpv/handle-claim-release-effect";

const RESTAURANT_A = "rest-a-release-fx";
const MANAGER_UID = "manager-release-fx";
const EVENT_A = "a".repeat(64);
const EVENT_B = "b".repeat(64);
const EVENT_C = "c".repeat(64);
const EVENT_D = "d".repeat(64);
const EVENT_E = "e".repeat(64);

let testEnv: RulesTestEnvironment;
let adminApp: App;
let adminDb: AdminFirestore;

function authCtx(
  restaurantId = RESTAURANT_A,
  role = "manager",
): AuthenticatedRestaurantContext {
  return {
    uid: MANAGER_UID,
    email: "manager-release-fx@example.test",
    emailVerified: true,
    restaurantId,
    role,
    canManageUsers: true,
    db: adminDb,
  };
}

async function readEffectDoc(releaseEventId: string) {
  const snap = await adminDb
    .collection("restaurants")
    .doc(RESTAURANT_A)
    .collection("tpvReleaseEffects")
    .doc(releaseEventId)
    .get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

describe("tpv release-effects emulator", () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-hostly-tpv-release-fx",
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
    adminApp = initializeApp(
      { projectId: "demo-hostly-tpv-release-fx" },
      "tpv-release-fx-admin",
    );
    adminDb = getAdminFirestore(adminApp);
  });

  after(async () => {
    await testEnv.cleanup();
    await deleteApp(adminApp);
  });

  test("1. primera ejecución: claim adquiere lease", async () => {
    const nowMs = 1_000_000;
    const claim = await handleAcquireReleaseEffectLease(authCtx(), {
      releaseEventId: EVENT_A,
      effect: "print",
      leaseOwner: "owner-1",
      nowMs,
    });
    assert.equal("acquired" in claim && claim.acquired, true);
    if (!("acquired" in claim)) return;
    assert.equal(claim.claimed, true);
    assert.equal(claim.alreadyCompleted, false);
    assert.equal(claim.leaseHeld, false);
    assert.equal(claim.leaseOwner, "owner-1");
    assert.equal(claim.leaseUntil, nowMs + RELEASE_EFFECT_LEASE_MS);

    const doc = await readEffectDoc(EVENT_A);
    const effects = doc?.effects as Record<string, Record<string, unknown>>;
    assert.equal(effects.print.completed, false);
    assert.equal(effects.print.leaseOwner, "owner-1");
  });

  test("2. complete marca completed; retry claim no adquiere", async () => {
    const nowMs = 2_000_000;
    const claim = await handleAcquireReleaseEffectLease(authCtx(), {
      releaseEventId: EVENT_B,
      effect: "stock",
      leaseOwner: "owner-stock",
      nowMs,
    });
    assert.equal("acquired" in claim && claim.acquired, true);

    const done = await handleCompleteReleaseEffect(authCtx(), {
      releaseEventId: EVENT_B,
      effect: "stock",
      leaseOwner: "owner-stock",
      nowMs,
    });
    assert.equal("completed" in done && done.completed, true);

    const retry = await handleAcquireReleaseEffectLease(authCtx(), {
      releaseEventId: EVENT_B,
      effect: "stock",
      leaseOwner: "owner-stock-2",
      nowMs: nowMs + 1,
    });
    assert.equal("acquired" in retry && retry.acquired, false);
    if (!("acquired" in retry)) return;
    assert.equal(retry.alreadyCompleted, true);
    assert.equal(retry.alreadyProcessed, true);
  });

  test("3. concurrencia: segundo owner con lease vigente → leaseHeld", async () => {
    const nowMs = 3_000_000;
    const first = await handleAcquireReleaseEffectLease(authCtx(), {
      releaseEventId: EVENT_C,
      effect: "activity",
      leaseOwner: "owner-a",
      nowMs,
    });
    assert.equal("acquired" in first && first.acquired, true);

    const second = await handleAcquireReleaseEffectLease(authCtx(), {
      releaseEventId: EVENT_C,
      effect: "activity",
      leaseOwner: "owner-b",
      nowMs: nowMs + 1_000,
    });
    assert.equal("acquired" in second && second.acquired, false);
    if (!("acquired" in second)) return;
    assert.equal(second.leaseHeld, true);
    assert.equal(second.leaseOwner, "owner-a");
  });

  test("4. timeout: lease expirado se puede reclamar", async () => {
    const nowMs = 4_000_000;
    const first = await handleAcquireReleaseEffectLease(authCtx(), {
      releaseEventId: EVENT_D,
      effect: "print",
      leaseOwner: "crashed",
      nowMs,
      leaseDurationMs: 1_000,
    });
    assert.equal("acquired" in first && first.acquired, true);

    const reclaim = await handleAcquireReleaseEffectLease(authCtx(), {
      releaseEventId: EVENT_D,
      effect: "print",
      leaseOwner: "retry-owner",
      nowMs: nowMs + 5_000,
    });
    assert.equal("acquired" in reclaim && reclaim.acquired, true);
    if (!("acquired" in reclaim)) return;
    assert.equal(reclaim.leaseOwner, "retry-owner");
  });

  test("5. complete con owner incorrecto → LEASE_OWNER_MISMATCH", async () => {
    const nowMs = 5_000_000;
    const claim = await handleAcquireReleaseEffectLease(authCtx(), {
      releaseEventId: EVENT_E,
      effect: "print",
      leaseOwner: "owner-ok",
      nowMs,
    });
    assert.equal("acquired" in claim && claim.acquired, true);

    const mismatch = await handleCompleteReleaseEffect(authCtx(), {
      releaseEventId: EVENT_E,
      effect: "print",
      leaseOwner: "owner-other",
      nowMs,
    });
    assert.equal("error" in mismatch && mismatch.error, "LEASE_OWNER_MISMATCH");
  });

  test("6. efectos independientes: stock completed no bloquea print", async () => {
    const eventId = "f".repeat(64);
    const nowMs = 6_000_000;
    const stockClaim = await handleAcquireReleaseEffectLease(authCtx(), {
      releaseEventId: eventId,
      effect: "stock",
      leaseOwner: "o1",
      nowMs,
    });
    assert.equal("acquired" in stockClaim && stockClaim.acquired, true);
    const stockDone = await handleCompleteReleaseEffect(authCtx(), {
      releaseEventId: eventId,
      effect: "stock",
      leaseOwner: "o1",
      nowMs,
    });
    assert.equal("completed" in stockDone && stockDone.completed, true);

    const printClaim = await handleAcquireReleaseEffectLease(authCtx(), {
      releaseEventId: eventId,
      effect: "print",
      leaseOwner: "o2",
      nowMs,
    });
    assert.equal("acquired" in printClaim && printClaim.acquired, true);
  });

  test("7. releaseEventId inválido → 400", async () => {
    const bad = await handleAcquireReleaseEffectLease(authCtx(), {
      releaseEventId: "not-a-hash",
      effect: "print",
      leaseOwner: "o",
    });
    assert.equal("error" in bad && bad.error, "RELEASE_EVENT_ID_INVALID");
  });
});
