import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { assertTransitionLineStatusCapability } from "@/lib/server/tpv/handle-tpv-order-mutations";
import {
  buildStableIdempotencyKey,
  persistDraftItemsViaApi,
  transitionLineStatusViaApi,
} from "@/lib/firestore/tpv-mutations-via-api";

const KDS_SALA_MODULES = [
  "components/kds/order-items-board.tsx",
  "components/kds/sala-view.tsx",
  "app/dashboard/cocina/page.tsx",
  "app/dashboard/sala/page.tsx",
] as const;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function mockCtx(role: "waiter" | "kitchen" | "viewer" | "manager") {
  return {
    uid: "u1",
    email: `${role}@test.com`,
    emailVerified: true,
    restaurantId: "r1",
    role,
    canManageUsers: false,
    db: {} as Firestore,
  };
}

describe("KDS/Sala authoritative lifecycle — no client writers", () => {
  for (const path of KDS_SALA_MODULES) {
    test(`${path} no escribe orders/orderItems en cliente`, () => {
      const src = read(path);
      assert.doesNotMatch(src, /\bdbgUpdateDoc\b/);
      assert.doesNotMatch(src, /\bDbgWriteBatch\b/);
      assert.doesNotMatch(src, /\bdbgRunTransaction\b/);
      assert.doesNotMatch(src, /\bupdateDoc\s*\(/);
      assert.doesNotMatch(src, /\bwriteBatch\s*\(/);
      assert.doesNotMatch(src, /\brunTransaction\s*\(/);
      assert.match(src, /advanceKdsLineViaApi/);
    });
  }

  test("order-items-board usa advance API para mark-next y pase", () => {
    const src = read("components/kds/order-items-board.tsx");
    assert.match(src, /advanceKdsLineViaApi/);
    assert.match(src, /handleMarkNext/);
    assert.match(src, /handlePreparePassChunk/);
    assert.doesNotMatch(src, /items:\s*sanitizedItems/);
  });

  test("sala-view sirve vía API (línea completa)", () => {
    const src = read("components/kds/sala-view.tsx");
    assert.match(src, /nextStatus:\s*["']served["']/);
    assert.match(src, /quantity:\s*1/);
  });
});

describe("transition-line-status permissions", () => {
  test("waiter + tpv.sell puede prepared/ready → served", () => {
    const waiter = mockCtx("waiter");
    assert.equal(assertTransitionLineStatusCapability(waiter, "served"), null);
  });

  test("kitchen + kds.manage puede served y prepared", () => {
    const kitchen = mockCtx("kitchen");
    assert.equal(assertTransitionLineStatusCapability(kitchen, "served"), null);
    assert.equal(assertTransitionLineStatusCapability(kitchen, "prepared"), null);
    assert.equal(assertTransitionLineStatusCapability(kitchen, "preparing"), null);
  });

  test("waiter sin kds.manage no puede prepared/preparing", () => {
    const waiter = mockCtx("waiter");
    const prepared = assertTransitionLineStatusCapability(waiter, "prepared");
    assert.equal(prepared?.error, "KDS_MANAGE_REQUIRED");
    const preparing = assertTransitionLineStatusCapability(waiter, "preparing");
    assert.equal(preparing?.error, "KDS_MANAGE_REQUIRED");
  });

  test("viewer no puede served ni prepared", () => {
    const viewer = mockCtx("viewer");
    assert.equal(
      assertTransitionLineStatusCapability(viewer, "served")?.error,
      "TPV_SELL_REQUIRED",
    );
    assert.equal(
      assertTransitionLineStatusCapability(viewer, "prepared")?.error,
      "KDS_MANAGE_REQUIRED",
    );
  });
});

describe("idempotencia A → B → A (persist-draft / transition-status)", () => {
  test("buildStableIdempotencyKey con operationId distinto no colisiona", () => {
    const a1 = buildStableIdempotencyKey("persist-draft", "op-a1");
    const b = buildStableIdempotencyKey("persist-draft", "op-b");
    const a2 = buildStableIdempotencyKey("persist-draft", "op-a2");
    assert.notEqual(a1, b);
    assert.notEqual(a1, a2);
    assert.equal(
      buildStableIdempotencyKey("persist-draft", "op-a1"),
      a1,
    );
  });

  test("persistDraftItemsViaApi usa operationId, no fingerprint de items", async () => {
    const bodies: unknown[] = [];
    const apiFetch = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({
          ok: true,
          orderId: "o1",
          total: 0,
          items: [],
          pendingRemoved: 0,
          nonPendingPreserved: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const fingerprintItems = [
      { id: "line-a", productId: "p1", quantity: 1, status: "pending" },
    ];

    const first = await persistDraftItemsViaApi(
      { orderId: "o1", items: fingerprintItems, operationId: "mut-1" },
      { apiFetch },
    );
    const mid = await persistDraftItemsViaApi(
      {
        orderId: "o1",
        items: [
          { id: "line-b", productId: "p2", quantity: 2, status: "pending" },
        ],
        operationId: "mut-2",
      },
      { apiFetch },
    );
    const again = await persistDraftItemsViaApi(
      { orderId: "o1", items: fingerprintItems, operationId: "mut-3" },
      { apiFetch },
    );

    assert.equal(first.ok && mid.ok && again.ok, true);
    const keys = (bodies as Array<{ idempotencyKey: string }>).map(
      (b) => b.idempotencyKey,
    );
    assert.equal(keys.length, 3);
    assert.equal(new Set(keys).size, 3);
    assert.equal(keys[0], "persist-draft:mut-1");
    assert.equal(keys[2], "persist-draft:mut-3");
  });

  test("transitionLineStatusViaApi A→B→A usa claves distintas por operationId", async () => {
    const bodies: unknown[] = [];
    const apiFetch = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({
          ok: true,
          orderId: "o1",
          lineId: "l1",
          status: "prepared",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await transitionLineStatusViaApi(
      {
        orderId: "o1",
        lineId: "l1",
        expectedStatus: "sent",
        nextStatus: "prepared",
        operationId: "ts-1",
      },
      { apiFetch },
    );
    await transitionLineStatusViaApi(
      {
        orderId: "o1",
        lineId: "l1",
        expectedStatus: "prepared",
        nextStatus: "served",
        operationId: "ts-2",
      },
      { apiFetch },
    );
    await transitionLineStatusViaApi(
      {
        orderId: "o1",
        lineId: "l1",
        expectedStatus: "sent",
        nextStatus: "prepared",
        operationId: "ts-3",
      },
      { apiFetch },
    );

    const keys = (bodies as Array<{ idempotencyKey: string }>).map(
      (b) => b.idempotencyKey,
    );
    assert.equal(new Set(keys).size, 3);
    assert.equal(keys[0], "transition-status:ts-1");
    assert.equal(keys[2], "transition-status:ts-3");
  });
});

describe("apertura mesa agrupada sin invalidación prematura", () => {
  test("handleOpenTableOrder no invalida cache de grupo al abrir", () => {
    const src = read("app/dashboard/carta/carta-page-content.tsx");
    const openBlock = src.slice(
      src.indexOf("const handleOpenTableOrder = useCallback"),
      src.indexOf("const persistGuestCount = useCallback"),
    );
    assert.ok(openBlock.length > 200);
    assert.doesNotMatch(openBlock, /invalidateTableGroupOrderCache\s*\(/);
    assert.match(openBlock, /No invalidar cache al abrir/);
  });

  test("invalidación de grupo se conserva para mutaciones confirmadas", () => {
    const src = read("app/dashboard/carta/carta-page-content.tsx");
    assert.match(src, /invalidateTableGroupOrderCache\(detail\.memberIds/);
  });
});

describe("advanceKdsLineViaApi structural wiring", () => {
  before(() => {
    // Ensure module resolves in unit suite.
    assert.ok(typeof assertTransitionLineStatusCapability === "function");
  });

  test("helper existe y exporta mapping orderItems→orders", async () => {
    const mod = await import("@/lib/kds/advance-kds-line-via-api");
    assert.equal(mod.orderItemsUiStatusToOrdersExpected("pending"), "sent");
    assert.equal(mod.orderItemsUiStatusToOrdersExpected("preparing"), "preparing");
    assert.equal(mod.orderItemsUiStatusToOrdersExpected("ready"), "prepared");
    assert.equal(mod.resolveOrderItemLineId({ id: "doc1", lineId: "line-9" }), "line-9");
    assert.equal(mod.resolveOrderItemLineId({ id: "doc1" }), "doc1");
  });
});