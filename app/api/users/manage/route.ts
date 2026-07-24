import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import {
  listManagedRestaurantUsers,
  ManageRestaurantUsersError,
  updateManagedRestaurantUser,
  type ManagedAssignableRole,
} from "@/lib/server/users/manage-restaurant-users";
import { normalizeAuthorizationRole } from "@/lib/auth/profile-authorization-policy";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseManagedRole(value: unknown): ManagedAssignableRole | undefined {
  const role = normalizeAuthorizationRole(value);
  return role === "admin" ||
    role === "manager" ||
    role === "waiter" ||
    role === "kitchen" ||
    role === "viewer"
    ? role
    : undefined;
}

export async function handleListManagedUsersRequest(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
) {
  const authContext = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authContext)) return authContext;
  if (!authContext.canManageUsers) {
    return jsonError(403, "USERS_MANAGE_REQUIRED");
  }
  const users = await listManagedRestaurantUsers(
    authContext.db,
    authContext.restaurantId,
  );
  return NextResponse.json({ ok: true, users });
}

export async function handleUpdateManagedUserRequest(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
) {
  const authContext = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authContext)) return authContext;
  if (!authContext.canManageUsers) {
    return jsonError(403, "USERS_MANAGE_REQUIRED");
  }

  const body = (await req.json().catch(() => null)) as
    | { userId?: unknown; role?: unknown; status?: unknown }
    | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const role = parseManagedRole(body?.role);
  const status =
    body?.status === "active" || body?.status === "disabled"
      ? body.status
      : undefined;
  if (!userId) return jsonError(400, "USER_ID_REQUIRED");
  if (!role && !status) return jsonError(400, "EMPTY_USER_UPDATE");

  try {
    await updateManagedRestaurantUser({
      db: authContext.db,
      actorUid: authContext.uid,
      actorEmail: authContext.email,
      restaurantId: authContext.restaurantId,
      targetUid: userId,
      role,
      status,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ManageRestaurantUsersError) {
      return jsonError(error.httpStatus, error.code);
    }
    throw error;
  }
}

export async function GET(req: Request) {
  try {
    return await handleListManagedUsersRequest(req);
  } catch (error) {
    console.error("[users/manage:get]", error);
    return jsonError(500, "USER_LIST_FAILED");
  }
}

export async function PATCH(req: Request) {
  try {
    return await handleUpdateManagedUserRequest(req);
  } catch (error) {
    console.error("[users/manage:patch]", error);
    return jsonError(500, "USER_UPDATE_FAILED");
  }
}
