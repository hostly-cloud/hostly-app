import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { normalizeHostlyRole } from "@/lib/auth/hostly-capabilities";
import { resolveHostlyPlanFromRestaurant } from "@/lib/subscription/hostly-plan";
import { hasHostlyPlanEntitlement } from "@/lib/subscription/hostly-entitlements";
import {
  generateAndPersistSommelierSnapshot,
  loadPersistedSommelierSnapshot,
} from "@/lib/server/sommelier/sommelier-pairing-engine";
import type { SommelierApiResponse } from "@/lib/sommelier/sommelier-types";

function error(status: number, code: string) {
  const body: SommelierApiResponse = { ok: false, error: code };
  return NextResponse.json(body, { status });
}

async function resolveAccess(req: Request) {
  const auth = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(auth)) return { response: auth } as const;
  if (!serverRoleHasCapability(auth.role, "tpv.sell")) {
    return { response: error(403, "TPV_ACCESS_REQUIRED") } as const;
  }
  const restaurantSnap = await auth.db
    .collection("restaurants")
    .doc(auth.restaurantId)
    .get();
  const restaurant = (restaurantSnap.data() ?? null) as Record<string, unknown> | null;
  const plan = resolveHostlyPlanFromRestaurant(restaurant).effectivePlan;
  const entitled = hasHostlyPlanEntitlement(plan, "ai.sommelierPairing");
  const role = normalizeHostlyRole(auth.role);
  const canRegenerate = role === "owner" || role === "admin" || role === "manager";
  return { auth, plan, entitled, canRegenerate } as const;
}

export async function GET(req: Request) {
  const access = await resolveAccess(req);
  if ("response" in access) return access.response;
  const snapshot = await loadPersistedSommelierSnapshot({
    db: access.auth.db,
    restaurantId: access.auth.restaurantId,
  });
  const body: SommelierApiResponse = {
    ok: true,
    effectivePlan: access.plan,
    entitled: access.entitled,
    canRegenerate: access.canRegenerate,
    snapshot,
  };
  return NextResponse.json(body);
}

export async function POST(req: Request) {
  const access = await resolveAccess(req);
  if ("response" in access) return access.response;
  if (!access.entitled) return error(403, "SOMMELIER_ULTRA_REQUIRED");
  if (!access.canRegenerate) return error(403, "SOMMELIER_REGENERATE_MANAGER_REQUIRED");

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "generate";
  if (action !== "generate") return error(400, "INVALID_SOMMELIER_ACTION");

  try {
    const snapshot = await generateAndPersistSommelierSnapshot({
      db: access.auth.db,
      restaurantId: access.auth.restaurantId,
      userId: access.auth.uid,
    });
    const response: SommelierApiResponse = {
      ok: true,
      effectivePlan: access.plan,
      entitled: true,
      canRegenerate: true,
      snapshot,
    };
    return NextResponse.json(response);
  } catch (generationError) {
    console.error("[ai/sommelier] generation_failed", {
      restaurantId: access.auth.restaurantId,
      uid: access.auth.uid,
      code: generationError instanceof Error ? generationError.name : "UNKNOWN",
    });
    return error(500, "SOMMELIER_GENERATION_FAILED");
  }
}
