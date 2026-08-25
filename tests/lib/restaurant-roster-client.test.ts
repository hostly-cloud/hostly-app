import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getUsersByRestaurant,
  RestaurantRosterError,
  type RestaurantRosterUser,
} from "@/lib/firestore/users";

function createUser(token = "firebase-id-token"): {
  user: RestaurantRosterUser;
  getIdTokenCalls: () => number;
} {
  let calls = 0;
  return {
    user: {
      uid: "user-1",
      getIdToken: async () => {
        calls += 1;
        return token;
      },
    },
    getIdTokenCalls: () => calls,
  };
}

function rosterResponse(
  status: number,
  payload: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getUsersByRestaurant", () => {
  test("usa exclusivamente el usuario explícito y consulta el endpoint canónico", async (t) => {
    const { user, getIdTokenCalls } = createUser();
    const fetchMock = t.mock.method(
      globalThis,
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        assert.equal(input, "/api/users/roster");
        assert.equal(init?.cache, "no-store");
        assert.equal(
          new Headers(init?.headers).get("Authorization"),
          "Bearer firebase-id-token",
        );
        return rosterResponse(200, {
          ok: true,
          users: [{ id: "waiter-1", displayName: "Camarero 1" }],
        });
      },
    );

    const result = await getUsersByRestaurant({
      restaurantId: "restaurant-client-context",
      user,
    });

    assert.deepEqual(result, [
      { id: "waiter-1", displayName: "Camarero 1" },
    ]);
    assert.equal(getIdTokenCalls(), 1);
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  test("funciona sin depender de auth.currentUser cuando el usuario explícito es válido", async (t) => {
    const { user } = createUser();
    t.mock.method(globalThis, "fetch", async () =>
      rosterResponse(200, { ok: true, users: [] }),
    );

    const result = await getUsersByRestaurant({
      restaurantId: "restaurant-1",
      user,
    });

    assert.deepEqual(result, []);
  });

  test("rechaza usuario ausente sin obtener token ni ejecutar fetch", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () =>
      rosterResponse(200, { ok: true, users: [] }),
    );

    await assert.rejects(
      getUsersByRestaurant({ restaurantId: "restaurant-1", user: null }),
      (error: unknown) =>
        error instanceof RestaurantRosterError &&
        error.kind === "unauthorized" &&
        error.httpStatus === 401 &&
        error.message === "UNAUTHORIZED",
    );
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  test("restaurantId solo valida contexto y nunca se envía como autoridad tenant", async (t) => {
    const { user } = createUser();
    const fetchMock = t.mock.method(
      globalThis,
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        assert.equal(input, "/api/users/roster");
        assert.equal(init?.method, undefined);
        return rosterResponse(200, { ok: true, users: [] });
      },
    );

    await getUsersByRestaurant({
      restaurantId: "client-value-must-not-select-server-tenant",
      user,
    });

    assert.equal(fetchMock.mock.callCount(), 1);
  });

  test("conserva la clasificación de respuestas 401, 403 y 409", async (t) => {
    const { user } = createUser();
    const cases = [
      { status: 401, error: "UNAUTHORIZED", kind: "unauthorized" },
      { status: 403, error: "ROSTER_READ_REQUIRED", kind: "unauthorized" },
      { status: 409, error: "PROFILE_TENANT_CONFLICT", kind: "identity_conflict" },
    ] as const;
    let currentCase = 0;
    t.mock.method(globalThis, "fetch", async () => {
      const item = cases[currentCase];
      assert.ok(item);
      currentCase += 1;
      return rosterResponse(item.status, { ok: false, error: item.error });
    });

    for (const item of cases) {
      await assert.rejects(
        getUsersByRestaurant({ restaurantId: "restaurant-1", user }),
        (error: unknown) =>
          error instanceof RestaurantRosterError &&
          error.kind === item.kind &&
          error.httpStatus === item.status &&
          error.message === item.error,
      );
    }
  });

  test("conserva la clasificación de fallos de red", async (t) => {
    const { user } = createUser();
    t.mock.method(globalThis, "fetch", async () => {
      throw new Error("network unavailable");
    });

    await assert.rejects(
      getUsersByRestaurant({ restaurantId: "restaurant-1", user }),
      (error: unknown) =>
        error instanceof RestaurantRosterError &&
        error.kind === "network" &&
        error.httpStatus === null &&
        error.message === "network unavailable",
    );
  });
});
