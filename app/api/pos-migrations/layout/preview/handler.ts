import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { createPosLayoutPreview } from "@/lib/server/pos-migrations/create-layout-preview";
import { restaurantHasPosMigrationEntitlement } from "@/lib/server/pos-migrations/require-pos-migration-entitlement";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export type PosLayoutPreviewRouteDependencies = AuthenticatedRestaurantDependencies & {
  createPreview?: typeof createPosLayoutPreview;
  hasMigrationEntitlement?: typeof restaurantHasPosMigrationEntitlement;
};

export async function handlePosLayoutPreviewRequest(
  req: Request,
  dependencies?: PosLayoutPreviewRouteDependencies,
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

    const formData = await req.formData().catch(() => null);
    if (!formData) return jsonError(400, "INVALID_FORM_DATA");
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonError(400, "MISSING_FILE", "Adjunta la exportación de mesas en el campo file");
    }

    const createPreview = dependencies?.createPreview ?? createPosLayoutPreview;
    const preview = await createPreview({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      userId: authCtx.uid,
      fileName: file.name,
      fileBytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "CreatePosLayoutPreviewError" &&
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
    console.error("[api/pos-migrations/layout/preview]", { code: "LAYOUT_PREVIEW_FAILED" });
    return jsonError(500, "LAYOUT_PREVIEW_FAILED");
  }
}

export async function POST(req: Request) {
  return handlePosLayoutPreviewRequest(req);
}
