import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { rollbackPosMigration } from "@/lib/server/pos-migrations/rollback-pos-migration";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export type PosMigrationRollbackRouteDependencies = AuthenticatedRestaurantDependencies & {
  rollbackMigration?: typeof rollbackPosMigration;
};

export async function handlePosMigrationRollbackRequest(
  req: Request,
  dependencies?: PosMigrationRollbackRouteDependencies,
) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req, dependencies);
    if (isAuthErrorResponse(authCtx)) return authCtx;
    if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
      return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
    }

    const body = (await req.json().catch(() => null)) as { migrationId?: string } | null;
    if (!body || typeof body !== "object") return jsonError(400, "INVALID_JSON");
    const migrationId = typeof body.migrationId === "string" ? body.migrationId.trim() : "";
    if (!migrationId) return jsonError(400, "MISSING_MIGRATION_ID");

    const rollbackMigration = dependencies?.rollbackMigration ?? rollbackPosMigration;
    const result = await rollbackMigration({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      migrationId,
      userId: authCtx.uid,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "RollbackPosMigrationError" &&
      "httpStatus" in error &&
      typeof error.httpStatus === "number" &&
      "code" in error &&
      typeof error.code === "string"
    ) {
      return jsonError(error.httpStatus, error.code, "message" in error && typeof error.message === "string" ? error.message : undefined);
    }
    console.error("[api/pos-migrations/rollback]", { code: "ROLLBACK_FAILED" });
    return jsonError(500, "ROLLBACK_FAILED");
  }
}

export async function POST(req: Request) {
  return handlePosMigrationRollbackRequest(req);
}
