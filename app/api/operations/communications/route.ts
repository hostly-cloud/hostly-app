import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  readOperationalCommunicationHistory,
  readOperationalCommunicationPolicy,
  saveOperationalCommunicationPolicy,
} from "@/lib/server/operations/operational-communication-center";
import { getOperationalNotificationProviderAvailability } from "@/lib/server/operations/operational-notification-dispatcher";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!serverRoleHasCapability(authCtx.role, "operations.audit")) {
    return jsonError(403, "OPERATIONS_AUDIT_REQUIRED");
  }
  try {
    const [policy, history] = await Promise.all([
      readOperationalCommunicationPolicy(authCtx.db, authCtx.restaurantId),
      readOperationalCommunicationHistory(authCtx.db, authCtx.restaurantId),
    ]);
    return NextResponse.json({
      ok: true,
      policy,
      history,
      providers: getOperationalNotificationProviderAvailability(),
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[operational-communications] GET failed", error);
    return jsonError(500, "OPERATIONAL_COMMUNICATIONS_FAILED");
  }
}

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
    return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "INVALID_JSON");
  try {
    const policy = await saveOperationalCommunicationPolicy(
      authCtx.db,
      authCtx.restaurantId,
      body.policy,
      authCtx.uid,
    );
    return NextResponse.json({ ok: true, policy });
  } catch (error) {
    console.error("[operational-communications] POST failed", error);
    return jsonError(500, "OPERATIONAL_COMMUNICATIONS_SAVE_FAILED");
  }
}
