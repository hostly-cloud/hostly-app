import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  listRestaurantUserRoster,
  type RestaurantUserRosterEntry,
} from "@/lib/server/users/list-restaurant-user-roster";

export type RosterRouteDependencies = AuthenticatedRestaurantDependencies & {
  listRoster?: (
    db: AuthenticatedRestaurantDependencies["db"],
    restaurantId: string,
  ) => Promise<RestaurantUserRosterEntry[]>;
};

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function handleListRestaurantUserRosterRequest(
  req: Request,
  dependencies?: RosterRouteDependencies,
) {
  const authContext = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authContext)) return authContext;

  const canReadRoster =
    serverRoleHasCapability(authContext.role, "tpv.sell") ||
    serverRoleHasCapability(authContext.role, "kds.manage") ||
    serverRoleHasCapability(authContext.role, "users.manage");
  if (!canReadRoster) return jsonError(403, "ROSTER_READ_REQUIRED");

  const listRoster = dependencies?.listRoster ?? listRestaurantUserRoster;
  const users = await listRoster(authContext.db, authContext.restaurantId);
  return NextResponse.json(
    { ok: true, users },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
