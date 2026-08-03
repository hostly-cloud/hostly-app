import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildReleaseEventId,
  buildReleaseEventMaterial,
} from "@/lib/carta/release-event-id";
import { runReleaseSideEffectsExactlyOnce } from "@/lib/carta/run-release-side-effects-exactly-once";
import type { ReleaseSideEffectName } from "@/lib/firestore/tpv-mutations-via-api";

describe("buildReleaseEventId", () => {
  test("primera ejecución: id estable y hex-64", async () => {
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

  test("retry distinto: cambia con líneas o action", async () => {
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
      releaseAction: "march_primeros",
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
      effect: ReleaseSideEffectName;
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
      effect: ReleaseSideEffectName;
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

describe("runReleaseSideEffectsExactlyOnce", () => {
  test("primera ejecución + retry mismo operationId + doble click → una vez", async () => {
    const nowMs = { current: 1_000_000 };
    const store = makeLeaseStore(nowMs);
    let stockCount = 0;
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
          runStock: async () => {
            stockCount += 1;
          },
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
    await run();
    assert.equal(stockCount, 1);
    assert.equal(printCount, 1);
    assert.equal(activityCount, 1);
  });

  test("doble stock / print / activity evitados en replay", async () => {
    const nowMs = { current: 1_000_000 };
    const store = makeLeaseStore(nowMs);
    let stockCount = 0;
    let printCount = 0;
    let activityCount = 0;
    let ownerSeq = 0;
    const eventId = "f".repeat(64);
    const deps = {
      ...store,
      buildReleaseEventId: async () => eventId,
      newLeaseOwner: () => `owner-${++ownerSeq}`,
    };
    const params = {
      restaurantId: "r",
      orderId: "o",
      releaseAction: "send_to_comanda",
      lineIds: ["l1"],
      releaseEventId: eventId,
      runStock: async () => {
        stockCount += 1;
      },
      runPrint: async () => {
        printCount += 1;
      },
      runActivity: async () => {
        activityCount += 1;
      },
    };
    await runReleaseSideEffectsExactlyOnce(params, deps);
    await runReleaseSideEffectsExactlyOnce(params, deps);
    await runReleaseSideEffectsExactlyOnce(params, deps);
    assert.equal(stockCount, 1);
    assert.equal(printCount, 1);
    assert.equal(activityCount, 1);
  });

  test("timeout: lease expirado permite un reintento; completed bloquea", async () => {
    const nowMs = { current: 1_000_000 };
    const store = makeLeaseStore(nowMs);
    let printCount = 0;
    let ownerSeq = 0;
    const eventId = "b".repeat(64);
    const deps = {
      ...store,
      buildReleaseEventId: async () => eventId,
      newLeaseOwner: () => `owner-${++ownerSeq}`,
    };

    const lease = await store.claimReleaseEffectViaApi({
      releaseEventId: eventId,
      effect: "print",
      leaseOwner: "crashed-owner",
    });
    assert.equal(lease.ok && lease.acquired, true);

    nowMs.current += 120_000;

    await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["x"],
        releaseEventId: eventId,
        runStock: async () => {},
        runPrint: async () => {
          printCount += 1;
        },
        runActivity: async () => {},
      },
      deps,
    );
    assert.equal(printCount, 1);

    await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["x"],
        releaseEventId: eventId,
        runStock: async () => {},
        runPrint: async () => {
          printCount += 1;
        },
        runActivity: async () => {},
      },
      deps,
    );
    assert.equal(printCount, 1);
  });

  test("concurrencia: lease ajeno vigente bloquea segundo cliente", async () => {
    const nowMs = { current: 1_000_000 };
    const store = makeLeaseStore(nowMs);
    let stockCount = 0;
    let ownerSeq = 0;
    const eventId = "c".repeat(64);
    const deps = {
      ...store,
      buildReleaseEventId: async () => eventId,
      newLeaseOwner: () => `owner-${++ownerSeq}`,
    };

    const held = await store.claimReleaseEffectViaApi({
      releaseEventId: eventId,
      effect: "stock",
      leaseOwner: "first-client",
    });
    assert.equal(held.ok && held.acquired, true);

    await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["f"],
        releaseEventId: eventId,
        runStock: async () => {
          stockCount += 1;
        },
        runPrint: async () => {},
        runActivity: async () => {},
      },
      deps,
    );
    assert.equal(stockCount, 0);
  });

  test("rollback: efecto falla → no completed → retry tras expiry puede reejecutar", async () => {
    const nowMs = { current: 1_000_000 };
    const store = makeLeaseStore(nowMs);
    let attempts = 0;
    let ownerSeq = 0;
    const eventId = "d".repeat(64);
    const deps = {
      ...store,
      buildReleaseEventId: async () => eventId,
      newLeaseOwner: () => `owner-${++ownerSeq}`,
    };

    const first = await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["f"],
        releaseEventId: eventId,
        runStock: async () => {
          attempts += 1;
          throw new Error("STOCK_FAILED");
        },
        runPrint: async () => {},
        runActivity: async () => {},
      },
      deps,
    );
    assert.equal(first.stockApplied, false);
    assert.equal(attempts, 1);
    assert.equal(store.effects.get(`${eventId}:stock`)?.completed, false);

    nowMs.current += 120_000;
    await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["f"],
        releaseEventId: eventId,
        runStock: async () => {
          attempts += 1;
        },
        runPrint: async () => {},
        runActivity: async () => {},
      },
      deps,
    );
    assert.equal(attempts, 2);
    assert.equal(store.effects.get(`${eventId}:stock`)?.completed, true);
  });

  test("orden funcional: stock → print → activity", async () => {
    const nowMs = { current: 1_000_000 };
    const store = makeLeaseStore(nowMs);
    const order: string[] = [];
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
        runStock: async () => {
          order.push("stock");
        },
        runPrint: async () => {
          order.push("print");
        },
        runActivity: async () => {
          order.push("activity");
        },
      },
      deps,
    );
    assert.deepEqual(order, ["stock", "print", "activity"]);
  });

  test("retry distinto releaseEventId ejecuta de nuevo", async () => {
    const nowMs = { current: 1_000_000 };
    const store = makeLeaseStore(nowMs);
    let printCount = 0;
    let ownerSeq = 0;
    const deps = {
      ...store,
      newLeaseOwner: () => `owner-${++ownerSeq}`,
    };
    await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["a"],
        releaseEventId: "1".repeat(64),
        runStock: async () => {},
        runPrint: async () => {
          printCount += 1;
        },
        runActivity: async () => {},
      },
      deps,
    );
    await runReleaseSideEffectsExactlyOnce(
      {
        restaurantId: "r",
        orderId: "o",
        releaseAction: "send_to_comanda",
        lineIds: ["b"],
        releaseEventId: "2".repeat(64),
        runStock: async () => {},
        runPrint: async () => {
          printCount += 1;
        },
        runActivity: async () => {},
      },
      deps,
    );
    assert.equal(printCount, 2);
  });
});
