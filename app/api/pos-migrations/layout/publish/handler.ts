import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { publishPosLayoutMigration } from "@/lib/server/pos-migrations/publish-layout-migration";
import { restaurantHasPosMigrationEntitlement } from "@/lib/server/pos-migrations/require-pos-migration-entitlement";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export type PosLayoutPublishRouteDependencies = AuthenticatedRestaurantDependencies & {
  publishMigration?: typeof publishPosLayoutMigration;
  hasMigrationEntitlement?: typeof restaurantHasPosMigrationEntitlement;
};

export async function handlePosLayoutPublishRequest(
  req: Request,
  dependencies?: PosLayoutPublishRouteDependencies,
) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req, dependencies);
    if (isAuthErrorResponse(authCtx)) return authCtx;
    if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
      return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
    }
    const hasMigrationEntitlement =
      dependencies?.hasMigrationEntitlement ?? restaurantHasPosMigrationEntitlement;
    if (
      !(await hasMigrationEntitlement({
        db: authCtx.db,
        restaurantId: authCtx.restaurantId,
        entitlement: "migration.full",
      }))
    ) {
      return jsonError(403, "POS_MIGRATION_FULL_PLAN_REQUIRED", "La migración completa de salas, zonas y mesas está incluida en Hostly Ultra.");
    }

    const body = (await req.json().catch(() => null)) as
      | { migrationId?: string; confirmReviewItemIds?: string[] }
      | null;
    if (!body || typeof body !== "object") return jsonError(400, "INVALID_JSON");
    const migrationId = typeof body.migrationId === "string" ? body.migrationId.trim() : "";
    if (!migrationId) return jsonError(400, "MISSING_MIGRATION_ID");

    const publishMigration = dependencies?.publishMigration ?? publishPosLayoutMigration;
    const result = await publishMigration({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      migrationId,
      userId: authCtx.uid,
      confirmReviewItemIds: Array.isArray(body.confirmReviewItemIds)
        ? body.confirmReviewItemIds.filter((value): value is string => typeof value === "string")
        : [],
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "PublishPosLayoutMigrationError" &&
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
    console.error("[api/pos-migrations/layout/publish]", { code: "LAYOUT_PUBLISH_FAILED" });
    return jsonError(500, "LAYOUT_PUBLISH_FAILED");
  }
}

export async function POST(req: Request) {
  return handlePosLayoutPublishRequest(req);
}
