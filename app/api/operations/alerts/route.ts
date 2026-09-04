import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  buildAndSyncOperationalAlertCenter,
  saveOperationalAlertPolicy,
  updateOperationalAlertIncident,
} from "@/lib/server/operations/operational-alert-center";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  const summaryOnly = new URL(req.url).searchParams.get("summary") === "1";
  const canViewSummary = serverRoleHasCapability(authCtx.role, "operations.audit")
    || serverRoleHasCapability(authCtx.role, "kds.manage")
    || serverRoleHasCapability(authCtx.role, "tpv.sell");
  if (summaryOnly ? !canViewSummary : !serverRoleHasCapability(authCtx.role, "operations.audit")) {
    return jsonError(403, summaryOnly ? "OPERATIONAL_ALERTS_VIEW_REQUIRED" : "OPERATIONS_AUDIT_REQUIRED");
  }

  try {
    const result = await buildAndSyncOperationalAlertCenter(authCtx.db, authCtx.restaurantId);
    if (summaryOnly) {
      return NextResponse.json({ ok: true, alerts: result.alerts });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[operational-alert-center] GET failed", error);
    return jsonError(500, "OPERATIONAL_ALERT_CENTER_FAILED");
  }
}

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "INVALID_JSON");
  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "updateSettings") {
      if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
        return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
      }
      const policy = await saveOperationalAlertPolicy(authCtx.db, authCtx.restaurantId, body.policy, authCtx.uid);
      return NextResponse.json({ ok: true, policy });
    }

    if (!serverRoleHasCapability(authCtx.role, "operations.audit")) {
      return jsonError(403, "OPERATIONS_AUDIT_REQUIRED");
    }
    if (action !== "acknowledge" && action !== "snooze" && action !== "resolve") {
      return jsonError(400, "INVALID_ACTION");
    }
    const incidentId = typeof body.incidentId === "string" ? body.incidentId.trim() : "";
    if (!incidentId) return jsonError(400, "INCIDENT_REQUIRED");
    await updateOperationalAlertIncident(
      authCtx.db,
      authCtx.restaurantId,
      incidentId,
      action,
      authCtx.uid,
      Number(body.snoozeMinutes),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OPERATIONAL_ALERT_ACTION_FAILED";
    if (code === "ALERT_NOT_FOUND") return jsonError(404, code);
    console.error("[operational-alert-center] POST failed", error);
    return jsonError(500, "OPERATIONAL_ALERT_ACTION_FAILED");
  }
}
