import { NextResponse } from "next/server";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function timestampIso(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as Timestamp).toDate === "function"
  ) {
    return (value as Timestamp).toDate().toISOString();
  }
  return null;
}

export async function handleListStaffInvitesRequest(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
) {
  const authContext = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authContext)) return authContext;
  if (!authContext.canManageUsers) {
    return jsonError(403, "USERS_MANAGE_REQUIRED");
  }

  const snapshot = await authContext.db
    .collection("restaurant_invites")
    .where("restaurantId", "==", authContext.restaurantId)
    .where("status", "==", "pending")
    .get();
  const invites = snapshot.docs.map((document) => {
    const data = document.data() as Record<string, unknown>;
    return {
      id: document.id,
      email: typeof data.email === "string" ? data.email : "",
      displayName:
        typeof data.displayName === "string" ? data.displayName : null,
      role: data.role === "admin" ? "admin" : "staff",
      status: "pending" as const,
      expiresAt: timestampIso(data.expiresAt),
    };
  });
  return NextResponse.json({ ok: true, invites });
}

export async function handleRevokeStaffInviteRequest(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
) {
  const authContext = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authContext)) return authContext;
  if (!authContext.canManageUsers) {
    return jsonError(403, "USERS_MANAGE_REQUIRED");
  }
  const body = (await req.json().catch(() => null)) as
    | { inviteId?: unknown }
    | null;
  const inviteId =
    typeof body?.inviteId === "string" ? body.inviteId.trim() : "";
  if (!inviteId) return jsonError(400, "INVITE_ID_REQUIRED");

  const inviteRef = authContext.db
    .collection("restaurant_invites")
    .doc(inviteId);
  await authContext.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(inviteRef);
    if (!snapshot.exists) throw new Error("INVITE_NOT_FOUND");
    const data = snapshot.data() as Record<string, unknown>;
    if (data.restaurantId !== authContext.restaurantId) {
      throw new Error("INVITE_TENANT_MISMATCH");
    }
    if (data.status !== "pending") throw new Error("INVITE_NOT_PENDING");
    transaction.update(inviteRef, {
      status: "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledByUid: authContext.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }).catch((error: unknown) => {
    const code = error instanceof Error ? error.message : "INVITE_REVOKE_FAILED";
    throw Object.assign(new Error(code), { code });
  });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  try {
    return await handleListStaffInvitesRequest(req);
  } catch (error) {
    console.error("[staff-invites/manage:get]", error);
    return jsonError(500, "INVITE_LIST_FAILED");
  }
}

export async function DELETE(req: Request) {
  try {
    return await handleRevokeStaffInviteRequest(req);
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "INVITE_REVOKE_FAILED";
    const status =
      code === "INVITE_NOT_FOUND"
        ? 404
        : code === "INVITE_TENANT_MISMATCH"
          ? 403
          : code === "INVITE_NOT_PENDING"
            ? 409
            : 500;
    if (status === 500) console.error("[staff-invites/manage:delete]", error);
    return jsonError(status, code);
  }
}
