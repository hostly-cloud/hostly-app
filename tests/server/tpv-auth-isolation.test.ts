import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  isAuthErrorResponse,
  requireAuthorizedTpvRestaurant,
} from "@/lib/server/tpv/require-authorized-tpv-restaurant";
import { requireTpvCapability } from "@/lib/server/tpv/handle-tpv-order-mutations";

process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= "test-api-key";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??= "test.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= "test-project";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??= "test.appspot.com";
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??= "123456789";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??= "1:123456789:web:abc";

const TPV_ROUTES = [
  "app/api/tpv/orders/create-open/route.ts",
  "app/api/tpv/orders/upsert-sale-lines/route.ts",
  "app/api/tpv/orders/persist-draft/route.ts",
  "app/api/tpv/orders/cancel-lines/route.ts",
  "app/api/tpv/orders/transition-line-status/route.ts",
  "app/api/tpv/orders/transition-line-quantity/route.ts",
  "app/api/tpv/orders/close/route.ts",
  "app/api/tpv/orders/reopen/route.ts",
  "app/api/tpv/orders/resolve-active-for-table/route.ts",
  "app/api/tpv/orders/pay-table/route.ts",
  "app/api/tpv/orders/merge-table-group/route.ts",
] as const;

const LEGACY_API_ROUTES = [
  "app/api/supplier-invoices/extract/route.ts",
  "app/api/staff-invites/create/route.ts",
  "app/api/printing/process-pending/route.ts",
  "app/api/menu-imports/publish-preview/route.ts",
  "app/api/menu-imports/publish/route.ts",
  "app/api/menu-imports/process/route.ts",
  "app/api/menu-imports/create-categories/route.ts",
  "app/api/catalog/migration-preview/route.ts",
  "app/api/catalog/migrate-legacy/route.ts",
] as const;

function requestWithToken(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request("https://hostly.test/api/tpv/orders/create-open", {
    method: "POST",
    headers,
    body: JSON.stringify({ restaurantId: "client-tenant-override" }),
  });
}

function activeProfileDoc(uid: string, email: string, restaurantId: string, role: string) {
  return {
    uid,
    email,
    restaurantId,
    role,
    status: "active",
  };
}

function createProfileDb(input: {
  uid: string;
  email: string;
  restaurantId: string;
  role: string;
  mirrorMissing?: boolean;
  disabled?: boolean;
}): Firestore {
  const status = input.disabled ? "disabled" : "active";
  const canonical = { ...activeProfileDoc(input.uid, input.email, input.restaurantId, input.role), status };
  const mirror = input.mirrorMissing
    ? null
    : { ...activeProfileDoc(input.uid, input.email, input.restaurantId, input.role), status };

  return {
    collection: (name: string) => ({
      doc: (uid: string) => ({
        id: uid,
        path: `${name}/${uid}`,
      }),
    }),
    getAll: async (...refs: Array<{ path: string }>) =>
      refs.map((ref) => {
        if (ref.path.startsWith("users/")) {
          return {
            exists: true,
            data: () => canonical,
          };
        }
        if (!mirror) {
          return { exists: false, data: () => undefined };
        }
        return {
          exists: true,
          data: () => mirror,
        };
      }),
  } as unknown as Firestore;
}

function normalizeSource(source: string): string {
  return source.replace(/\r\n/g, "\n").trimEnd();
}

function mainAuthHelperSource(): string {
  return normalizeSource(
    execSync("git show origin/main:lib/server/auth/require-authenticated-restaurant.ts", {
      encoding: "utf8",
    }),
  );
}

function walkRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkRouteFiles(full, acc);
      continue;
    }
    if (entry === "route.ts") acc.push(full.replace(/\\/g, "/"));
  }
  return acc;
}

describe("TPV auth isolation (Corrección 1)", () => {
  test("global helper restored to main contract (structural parity)", () => {
    const src = readFileSync("lib/server/auth/require-authenticated-restaurant.ts", "utf8");
    assert.doesNotMatch(src, /readAuthorizedProfile|checkRevoked|emailVerified|canManageUsers/);
    assert.match(src, /verifyIdToken\(token\)/);
    assert.match(src, /restaurantId: string;\s+db: Firestore;/);
  });

  test("TPV routes import strict helper only", () => {
    for (const route of TPV_ROUTES) {
      const src = readFileSync(route, "utf8");
      assert.match(src, /requireAuthorizedTpvRestaurant/);
      assert.doesNotMatch(src, /requireAuthenticatedRestaurant/);
    }
  });

  test("legacy APIs keep global helper and do not import strict TPV helper", () => {
    for (const route of LEGACY_API_ROUTES) {
      const src = readFileSync(route, "utf8");
      assert.match(src, /requireAuthenticatedRestaurant/);
      assert.doesNotMatch(src, /requireAuthorizedTpvRestaurant/);
    }
  });

  test("no non-TPV route imports strict TPV helper", () => {
    const allRoutes = walkRouteFiles("app/api");
    const offenders = allRoutes.filter((path) => {
      if (path.includes("/api/tpv/")) return false;
      const src = readFileSync(path, "utf8");
      return src.includes("require-authorized-tpv-restaurant");
    });
    assert.deepEqual(offenders, []);
  });

  test("TPV: token absent is rejected", async () => {
    const result = await requireAuthorizedTpvRestaurant(requestWithToken(), {
      auth: { verifyIdToken: async () => ({ uid: "u1", email: "a@test.com" }) },
      db: createProfileDb({ uid: "u1", email: "a@test.com", restaurantId: "r1", role: "manager" }),
    });
    assert.equal(isAuthErrorResponse(result), true);
    if (!isAuthErrorResponse(result)) return;
    assert.equal(result.status, 401);
  });

  test("TPV: invalid token is rejected", async () => {
    const result = await requireAuthorizedTpvRestaurant(requestWithToken("bad"), {
      auth: {
        verifyIdToken: async () => {
          throw new Error("invalid");
        },
      },
      db: createProfileDb({ uid: "u1", email: "a@test.com", restaurantId: "r1", role: "manager" }),
    });
    assert.equal(isAuthErrorResponse(result), true);
    if (!isAuthErrorResponse(result)) return;
    assert.equal(result.status, 401);
  });

  test("TPV: token without email is rejected", async () => {
    const result = await requireAuthorizedTpvRestaurant(requestWithToken("tok"), {
      auth: { verifyIdToken: async () => ({ uid: "u1" }) },
      db: createProfileDb({ uid: "u1", email: "a@test.com", restaurantId: "r1", role: "manager" }),
    });
    assert.equal(isAuthErrorResponse(result), true);
    if (!isAuthErrorResponse(result)) return;
    assert.equal(result.status, 403);
    const body = (await result.json()) as { error?: string };
    assert.equal(body.error, "AUTH_EMAIL_REQUIRED");
  });

  test("TPV: profile without tenant is rejected", async () => {
    const result = await requireAuthorizedTpvRestaurant(requestWithToken("tok"), {
      auth: {
        verifyIdToken: async (_token, checkRevoked) => {
          assert.equal(checkRevoked, true);
          return { uid: "u1", email: "a@test.com", email_verified: true };
        },
      },
      db: createProfileDb({ uid: "u1", email: "a@test.com", restaurantId: "", role: "manager" }),
    });
    assert.equal(isAuthErrorResponse(result), true);
    if (!isAuthErrorResponse(result)) return;
    assert.equal(result.status, 409);
    const body = (await result.json()) as { error?: string };
    assert.equal(body.error, "PROFILE_TENANT_MISSING");
  });

  test("TPV: disabled profile is rejected", async () => {
    const result = await requireAuthorizedTpvRestaurant(requestWithToken("tok"), {
      auth: { verifyIdToken: async () => ({ uid: "u1", email: "a@test.com", email_verified: true }) },
      db: createProfileDb({
        uid: "u1",
        email: "a@test.com",
        restaurantId: "r1",
        role: "manager",
        disabled: true,
      }),
    });
    assert.equal(isAuthErrorResponse(result), true);
    if (!isAuthErrorResponse(result)) return;
    assert.equal(result.status, 403);
    const body = (await result.json()) as { error?: string };
    assert.equal(body.error, "PROFILE_DISABLED");
  });

  test("TPV: valid tenant resolves server-side restaurantId", async () => {
    const result = await requireAuthorizedTpvRestaurant(requestWithToken("tok"), {
      auth: { verifyIdToken: async () => ({ uid: "u1", email: "a@test.com", email_verified: true }) },
      db: createProfileDb({ uid: "u1", email: "a@test.com", restaurantId: "server-r1", role: "manager" }),
    });
    assert.equal(isAuthErrorResponse(result), false);
    if (isAuthErrorResponse(result)) return;
    assert.equal(result.restaurantId, "server-r1");
    assert.equal(result.role, "manager");
    assert.equal(result.uid, "u1");
  });

  test("TPV: body restaurantId does not override authenticated tenant", async () => {
    const result = await requireAuthorizedTpvRestaurant(
      new Request("https://hostly.test/api/tpv/orders/create-open", {
        method: "POST",
        headers: { Authorization: "Bearer tok" },
        body: JSON.stringify({ restaurantId: "client-tenant-override" }),
      }),
      {
        auth: { verifyIdToken: async () => ({ uid: "u1", email: "a@test.com", email_verified: true }) },
        db: createProfileDb({ uid: "u1", email: "a@test.com", restaurantId: "server-r1", role: "manager" }),
      },
    );
    assert.equal(isAuthErrorResponse(result), false);
    if (isAuthErrorResponse(result)) return;
    assert.equal(result.restaurantId, "server-r1");
    assert.notEqual(result.restaurantId, "client-tenant-override");
  });

  test("TPV capability: viewer cannot sell", () => {
    const err = requireTpvCapability(
      {
        uid: "u1",
        email: "v@test.com",
        emailVerified: true,
        restaurantId: "r1",
        role: "viewer",
        canManageUsers: false,
        db: {} as Firestore,
      },
      "tpv.sell",
    );
    assert.equal(err?.error, "TPV_SELL_REQUIRED");
    assert.equal(err?.status, 403);
  });

  test("TPV capability: kitchen cannot cancel lines", () => {
    const err = requireTpvCapability(
      {
        uid: "u1",
        email: "k@test.com",
        emailVerified: true,
        restaurantId: "r1",
        role: "kitchen",
        canManageUsers: false,
        db: {} as Firestore,
      },
      "tpv.cancel_line",
    );
    assert.equal(err?.error, "TPV_CANCEL_REQUIRED");
  });

  test("TPV capability: waiter can sell and kitchen can manage KDS", () => {
    const waiterCtx = {
      uid: "u1",
      email: "w@test.com",
      emailVerified: true,
      restaurantId: "r1",
      role: "waiter",
      canManageUsers: false,
      db: {} as Firestore,
    };
    assert.equal(requireTpvCapability(waiterCtx, "tpv.sell"), null);

    const kitchenCtx = { ...waiterCtx, role: "kitchen", email: "k@test.com" };
    assert.equal(requireTpvCapability(kitchenCtx, "kds.manage"), null);
  });
});

describe("global auth legacy contract", () => {
  test("global helper source matches origin/main exactly", () => {
    const current = normalizeSource(readFileSync("lib/server/auth/require-authenticated-restaurant.ts", "utf8"));
    assert.equal(current, mainAuthHelperSource());
  });

  test("legacy helper does not require canonical profile modules", () => {
    const src = readFileSync("lib/server/auth/require-authenticated-restaurant.ts", "utf8");
    assert.doesNotMatch(src, /authorized-profile|profile-role|profile-authorization-policy/);
  });

  test("representative legacy API route still references global helper only", () => {
    const src = readFileSync("app/api/catalog/migration-preview/route.ts", "utf8");
    assert.match(src, /requireAuthenticatedRestaurant/);
    assert.doesNotMatch(src, /requireAuthorizedTpvRestaurant/);
  });
});
