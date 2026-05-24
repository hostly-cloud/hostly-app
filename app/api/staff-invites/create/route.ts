import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import {
  CreateStaffInviteError,
  createStaffInvite,
} from "@/lib/server/staff-invites/create-staff-invite";
import { normalizeStaffInviteInputRole } from "@/lib/staff-invites/map-onboarding-role";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export async function POST(req: Request) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(authCtx)) {
      return authCtx;
    }

    const body = (await req.json().catch(() => null)) as
      | {
          email?: string;
          displayName?: string;
          role?: string;
          restaurantName?: string;
        }
      | null;

    if (!body || typeof body !== "object") {
      return jsonError(400, "INVALID_JSON");
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : undefined;
    const roleRaw = typeof body.role === "string" ? body.role.trim() : "operativo";
    const restaurantName =
      typeof body.restaurantName === "string" ? body.restaurantName.trim() : undefined;

    const role = normalizeStaffInviteInputRole(roleRaw);
    const invite = await createStaffInvite({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      createdByUid: authCtx.uid,
      email,
      displayName,
      role,
      restaurantName,
    });

    return NextResponse.json({ ok: true, invite });
  } catch (error) {
    if (error instanceof CreateStaffInviteError) {
      return jsonError(error.httpStatus, error.code, error.message);
    }
    console.error("[staff-invites/create]", error);
    return jsonError(500, "INVITE_CREATE_FAILED", "No se pudo crear la invitación");
  }
}
