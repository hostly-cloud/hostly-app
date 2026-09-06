import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { rollbackPosLayoutMigration } from "@/lib/server/pos-migrations/rollback-layout-migration";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export type PosLayoutRollbackRouteDependencies = AuthenticatedRestaurantDependencies & {
  rollbackMigration?: typeof rollbackPosLayoutMigration;
};

export async function handlePosLayoutRollbackRequest(
  req: Request,
  dependencies?: PosLayoutRollbackRouteDependencies,
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

    const rollbackMigration = dependencies?.rollbackMigration ?? rollbackPosLayoutMigration;
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
      error.name === "RollbackPosLayoutMigrationError" &&
      "httpStatus" in error &&
      typeof error.httpStatus === "number" &&
      "code" in error &&
      typeof error.code === "string"
    ) {
      return jsonError(
        error.httpStatus,
        error.code,
        "message" in error && typeof error.message === "string" ? error.message : undefined,
      );
    }
    console.error("[api/pos-migrations/layout/rollback]", { code: "LAYOUT_ROLLBACK_FAILED" });
    return jsonError(500, "LAYOUT_ROLLBACK_FAILED");
  }
}

export async function POST(req: Request) {
  return handlePosLayoutRollbackRequest(req);
}
