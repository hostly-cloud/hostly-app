import { NextResponse } from "next/server";
import { normalizeHostlyRole } from "@/lib/auth/hostly-capabilities";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  buildAndSyncManagerAutomationCenter,
  updateManagerAutomation,
} from "@/lib/server/operations/manager-automation-center";
import { hasHostlyPlanEntitlement } from "@/lib/subscription/hostly-entitlements";
import { resolveHostlyPlanFromRestaurant } from "@/lib/subscription/hostly-plan";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isManagerRole(role: string): boolean {
  const normalized = normalizeHostlyRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "manager";
}

async function resolveEntitlement(db: Awaited<ReturnType<typeof requireAuthenticatedRestaurant>> extends infer T ? never : never) {
  return db;
}

export async function GET(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!isManagerRole(authCtx.role) || !serverRoleHasCapability(authCtx.role, "operations.audit")) {
    return jsonError(403, "MANAGER_AUTOMATIONS_ROLE_REQUIRED");
  }

  const restaurantSnap = await authCtx.db.collection("restaurants").doc(authCtx.restaurantId).get();
  const plan = resolveHostlyPlanFromRestaurant((restaurantSnap.data() ?? null) as Record<string, unknown> | null).effectivePlan;
  const entitled = hasHostlyPlanEntitlement(plan, "operations.managerAutomations");
  if (!entitled) {
    return NextResponse.json({
      ok: true,
      effectivePlan: plan,
      entitled: false,
      active: [],
      history: [],
    });
  }

  try {
    const center = await buildAndSyncManagerAutomationCenter(authCtx.db, authCtx.restaurantId);
    return NextResponse.json({
      ok: true,
      effectivePlan: plan,
      entitled: true,
      ...center,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[operations/automations] GET failed", {
      restaurantId: authCtx.restaurantId,
      uid: authCtx.uid,
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
    return jsonError(500, "MANAGER_AUTOMATIONS_FAILED");
  }
}

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!isManagerRole(authCtx.role) || !serverRoleHasCapability(authCtx.role, "operations.audit")) {
    return jsonError(403, "MANAGER_AUTOMATIONS_ROLE_REQUIRED");
  }

  const restaurantSnap = await authCtx.db.collection("restaurants").doc(authCtx.restaurantId).get();
  const plan = resolveHostlyPlanFromRestaurant((restaurantSnap.data() ?? null) as Record<string, unknown> | null).effectivePlan;
  if (!hasHostlyPlanEntitlement(plan, "operations.managerAutomations")) {
    return jsonError(403, "MANAGER_AUTOMATIONS_PLAN_REQUIRED");
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "INVALID_JSON");
  const action = typeof body.action === "string" ? body.action : "";
  if (action !== "acknowledge" && action !== "resolve") return jsonError(400, "INVALID_ACTION");
  const automationId = typeof body.automationId === "string" ? body.automationId.trim() : "";
  if (!automationId) return jsonError(400, "AUTOMATION_REQUIRED");

  try {
    await updateManagerAutomation(authCtx.db, authCtx.restaurantId, automationId, action, authCtx.uid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MANAGER_AUTOMATION_ACTION_FAILED";
    if (code === "AUTOMATION_NOT_FOUND") return jsonError(404, code);
    console.error("[operations/automations] POST failed", {
      restaurantId: authCtx.restaurantId,
      uid: authCtx.uid,
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
    return jsonError(500, "MANAGER_AUTOMATION_ACTION_FAILED");
  }
}
