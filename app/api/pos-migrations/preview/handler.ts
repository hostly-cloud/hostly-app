import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { createPosMigrationPreview } from "@/lib/server/pos-migrations/create-pos-migration-preview";
import { restaurantHasPosMigrationEntitlement } from "@/lib/server/pos-migrations/require-pos-migration-entitlement";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export type PosMigrationPreviewRouteDependencies = AuthenticatedRestaurantDependencies & {
  createPreview?: typeof createPosMigrationPreview;
  hasMigrationEntitlement?: typeof restaurantHasPosMigrationEntitlement;
};

export async function handlePosMigrationPreviewRequest(
  req: Request,
  dependencies?: PosMigrationPreviewRouteDependencies,
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
        entitlement: "migration.products",
      }))
    ) {
      return jsonError(403, "POS_MIGRATION_PRODUCTS_PLAN_REQUIRED", "La migración de carta está incluida en Hostly Pro y Ultra.");
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) return jsonError(400, "INVALID_FORM_DATA");
    const file = formData.get("file");
    if (!(file instanceof File)) return jsonError(400, "MISSING_FILE", "Adjunta la exportación de tu TPV en el campo file");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const createPreview = dependencies?.createPreview ?? createPosMigrationPreview;
    const result = await createPreview({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      userId: authCtx.uid,
      fileName: file.name,
      fileBytes: bytes,
    });
    return NextResponse.json({ ok: true, preview: result });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "CreatePosMigrationPreviewError" &&
      "httpStatus" in error &&
      typeof error.httpStatus === "number" &&
      "code" in error &&
      typeof error.code === "string"
    ) {
      return jsonError(error.httpStatus, error.code, "message" in error && typeof error.message === "string" ? error.message : undefined);
    }
    console.error("[api/pos-migrations/preview]", { code: "PREVIEW_FAILED" });
    return jsonError(500, "PREVIEW_FAILED");
  }
}

export async function POST(req: Request) {
  return handlePosMigrationPreviewRequest(req);
}
