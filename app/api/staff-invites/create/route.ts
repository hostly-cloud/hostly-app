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
import type { AuthenticatedRestaurantDependencies } from "@/lib/server/auth/require-authenticated-restaurant";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export async function handleCreateStaffInviteRequest(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies & { sendEmail?: boolean },
) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req, dependencies);
    if (isAuthErrorResponse(authCtx)) {
      return authCtx;
    }
    if (!authCtx.canManageUsers) {
      return jsonError(403, "USERS_MANAGE_REQUIRED");
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
    const roleRaw = typeof body.role === "string" ? body.role.trim() : "";
    const restaurantName =
      typeof body.restaurantName === "string" ? body.restaurantName.trim() : undefined;

    if (roleRaw.toLowerCase() === "owner") {
      return jsonError(403, "INVITE_OWNER_FORBIDDEN");
    }
    const role = normalizeStaffInviteInputRole(roleRaw);
    if (!role) {
      return jsonError(400, "INVITE_ROLE_INVALID");
    }
    const invite = await createStaffInvite({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      createdByUid: authCtx.uid,
      createdByRole: authCtx.role,
      email,
      displayName,
      role,
      restaurantName,
      sendEmail: dependencies?.sendEmail,
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

export async function POST(req: Request) {
  return handleCreateStaffInviteRequest(req);
}
