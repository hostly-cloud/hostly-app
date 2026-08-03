import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildReleaseEventId,
  buildReleaseEventMaterial,
} from "@/lib/carta/release-event-id";
import { runReleaseSideEffectsExactlyOnce } from "@/lib/carta/run-release-side-effects-exactly-once";

describe("buildReleaseEventId (3B-2B)", () => {
  test("12. estable para el mismo material", async () => {
    const params = {
      restaurantId: "rest-a",
      orderId: "ord-1",
      releaseAction: "send_to_comanda",
      lineIds: ["b", "a"],
      markSent: true,
    };
    const a = await buildReleaseEventId(params);
    const b = await buildReleaseEventId({
      ...params,
      lineIds: ["a", "b"],
    });
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  test("release distinto cuando cambian líneas o action", async () => {
    const base = {
      restaurantId: "rest-a",
      orderId: "ord-1",
      releaseAction: "send_to_comanda",
      lineIds: ["a"],
      markSent: true,
    };
    const id1 = await buildReleaseEventId(base);
    const id2 = await buildReleaseEventId({ ...base, lineIds: ["a", "b"] });
    const id3 = await buildReleaseEventId({
      ...base,
      releaseAction: "marchar",
    });
    assert.notEqual(id1, id2);
    assert.notEqual(id1, id3);
  });

  test("material canónico ordena lineIds", () => {
    const m1 = buildReleaseEventMaterial({
      restaurantId: "r",
      orderId: "o",
      releaseAction: "send_to_comanda",
      lineIds: ["z", "a"],
      markSent: true,
    });
    const m2 = buildReleaseEventMaterial({
      restaurantId: "r",
      orderId: "o",
      releaseAction: "send_to_comanda",
      lineIds: ["a", "z"],
      markSent: true,
    });
    assert.equal(m1, m2);
  });
});

type EffectSlot = {
  completed: boolean;
  leaseOwner: string | null;
  leaseUntil: number | null;
};

function makeLeaseStore(nowMs: { current: number }) {
  const effects = new Map<string, EffectSlot>();

  return {
    claimReleaseEffectViaApi: async (params: {
      releaseEventId: string;
      effect: "print" | "activity";
      leaseOwner: string;
    }) => {
      const key = `${params.releaseEventId}:${params.effect}`;
      const cur = effects.get(key) ?? {
        completed: false,
        leaseOwner: null,
        leaseUntil: null,
      };
      if (cur.completed) {
        return {
          ok: true as const,
          releaseEventId: params.releaseEventId,
          effect: params.effect,
          acquired: false,
          claimed: false,
          alreadyCompleted: true,
          leaseHeld: false,
          alreadyProcessed: true,
          leaseOwner: cur.leaseOwner,
          leaseUntil: cur.leaseUntil,
        };
      }
      if (
        cur.leaseOwner &&
        cur.leaseUntil != null &&
        cur.leaseUntil > nowMs.current &&
        cur.leaseOwner !== params.leaseOwner
      ) {
        return {
          ok: true as const,
          releaseEventId: params.releaseEventId,
          effect: params.effect,
          acquired: false,
          claimed: false,
          alreadyCompleted: false,
          leaseHeld: true,
          alreadyProcessed: true,
          leaseOwner: cur.leaseOwner,
          leaseUntil: cur.leaseUntil,
        };
      }
      const next = {
        completed: false,
        leaseOwner: params.leaseOwner,
        leaseUntil: nowMs.current + 60_000,
      };
      effects.set(key, next);
      return {
        ok: true as const,
        releaseEventId: params.releaseEventId,
        effect: params.effect,
        acquired: true,
        claimed: true,
        alreadyCompleted: false,
        leaseHeld: false,
        alreadyProcessed: false,
        leaseOwner: next.leaseOwner,
        leaseUntil: next.leaseUntil,
      };
    },
    completeReleaseEffectViaApi: async (params: {
      releaseEventId: string;
      effect: "print" | "activity";
      leaseOwner: string;
    }) => {
      const key = `${params.releaseEventId}:${params.effect}`;
      const cur = effects.get(key);
      if (!cur) return { ok: false as const, error: "RELEASE_EFFECT_NOT_FOUND" };
      if (cur.completed) {
        return {
          ok: true as const,
          releaseEventId: params.releaseEventId,
          effect: params.effect,
          completed: true,
        };
      }
      if (cur.leaseOwner !== params.leaseOwner) {
        return { ok: false as const, error: "LEASE_OWNER_MISMATCH" };
      }
      effects.set(key, {
        completed: true,
        leaseOwner: null,
        leaseUntil: null,
      });
      return {
        ok: true as const,
        releaseEventId: params.releaseEventId,
        effect: params.effect,
        completed: true,
      };
    },
    effects,
  };
}

describe("runReleaseSideEffectsExactlyOnce (3B-2B.1 lease)", () => {
  test("1+6+7. lease nuevo + replay + doble click → print/activity una vez", async () => {
    const nowMs = { current: 1_000_000 };
    const store = makeLeaseStore(nowMs);
    let printCount = 0;
    let activityCount = 0;
    let ownerSeq = 0;
    const deps = {
      ...store,
      buildReleaseEventId: async () => "a".repeat(64),
      newLeaseOwner: () => `owner-${++ownerSeq}`,
    };

    const run = () =>
      runReleaseSideEffectsExactlyOnce(
        {
          restaurantId: "r",
          orderId: "o",
          releaseAction: "send_to_comanda",
          lineIds: ["l1"],
          markSent: true,
          runPrint: async () => {
            printCount += 1;
          },
          runActivity: async () => {
            activityCount += 1;
          },
        },
        deps,
      );

    await run();
    await run(); // replay / doble click
    assert.equal(printCount, 1);
    assert.equal(activityCount, 1);
  });

  test("4+5. retry tras caída (lease expirado) → efectivamente una impresión", async () => {
    const nowMs = { current: 1_000_000 };
    const store = makeLeaseStore(nowMs);
    let printCount = 0;
    let ownerSeq = 0;
    const deps = {
      ...store,
      buildReleaseEventId: async () => "b".repeat(64),
      newLeaseOwner: () => `owner-${++ownerSeq}`,
    };

    // Cliente 1: lease + crash antes de print (no complete)
    const lease = await store.claimReleaseEffectViaApi({
      releaseEventId: "b".repeat(64),
      effect: "print",
      leaseOwner: "crashed-owner",
    });
    assert.equal(lease.ok && lease.acquired, true);

    // Lease expira
    nowMs.current += 120_000;

    await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["x"],
        releaseEventId: "b".repeat(64),
        runPrint: async () => {
          printCount += 1;
        },
        runActivity: async () => {},
      },
      deps,
    );
    assert.equal(printCount, 1);

    // Replay tras completed
    await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["x"],
        releaseEventId: "b".repeat(64),
        runPrint: async () => {
          printCount += 1;
        },
        runActivity: async () => {},
      },
      deps,
    );
    assert.equal(printCount, 1);
  });

  test("9. print falla → no completed → retry puede reimprimir", async () => {
    const nowMs = { current: 1_000_000 };
    const store = makeLeaseStore(nowMs);
    let attempts = 0;
    let ownerSeq = 0;
    const deps = {
      ...store,
      buildReleaseEventId: async () => "c".repeat(64),
      newLeaseOwner: () => `owner-${++ownerSeq}`,
    };

    await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["f"],
        releaseEventId: "c".repeat(64),
        runPrint: async () => {
          attempts += 1;
          throw new Error("PRINT_FAILED");
        },
        runActivity: async () => {},
      },
      deps,
    );
    assert.equal(attempts, 1);

    // Mismo lease aún válido → segundo cliente no puede (leaseHeld)
    const held = await store.claimReleaseEffectViaApi({
      releaseEventId: "c".repeat(64),
      effect: "print",
      leaseOwner: "other",
    });
    assert.equal(held.ok && held.leaseHeld, true);

    nowMs.current += 120_000;
    await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["f"],
        releaseEventId: "c".repeat(64),
        runPrint: async () => {
          attempts += 1;
        },
        runActivity: async () => {},
      },
      deps,
    );
    assert.equal(attempts, 2);
  });

  test("10. activity falla → no completed", async () => {
    const nowMs = { current: 1_000_000 };
    const store = makeLeaseStore(nowMs);
    let activityAttempts = 0;
    let ownerSeq = 0;
    const deps = {
      ...store,
      buildReleaseEventId: async () => "d".repeat(64),
      newLeaseOwner: () => `owner-${++ownerSeq}`,
    };

    const result = await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["a"],
        releaseEventId: "d".repeat(64),
        runPrint: async () => {},
        runActivity: async () => {
          activityAttempts += 1;
          throw new Error("ACTIVITY_FAILED");
        },
      },
      deps,
    );
    assert.equal(result.activityLogged, false);
    assert.equal(activityAttempts, 1);
    const slot = store.effects.get(`${"d".repeat(64)}:activity`);
    assert.equal(slot?.completed, false);
  });

  test("11. markCompleted tras éxito bloquea", async () => {
    const nowMs = { current: 1_000_000 };
    const store = makeLeaseStore(nowMs);
    let printCount = 0;
    let ownerSeq = 0;
    const deps = {
      ...store,
      buildReleaseEventId: async () => "e".repeat(64),
      newLeaseOwner: () => `owner-${++ownerSeq}`,
    };
    await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["z"],
        releaseEventId: "e".repeat(64),
        runPrint: async () => {
          printCount += 1;
        },
        runActivity: async () => {},
      },
      deps,
    );
    assert.equal(store.effects.get(`${"e".repeat(64)}:print`)?.completed, true);
    await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["z"],
        releaseEventId: "e".repeat(64),
        runPrint: async () => {
          printCount += 1;
        },
        runActivity: async () => {},
      },
      deps,
    );
    assert.equal(printCount, 1);
  });
});
