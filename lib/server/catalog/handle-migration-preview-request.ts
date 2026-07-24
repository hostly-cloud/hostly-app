import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export async function handleMigrationPreviewRequest(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
) {
  const authCtx = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authCtx)) {
    return authCtx;
  }
  if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
    return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
  }

  const body = (await req.json().catch(() => null)) as {
    legacyPlatos?: unknown;
    restaurantId?: unknown;
  } | null;

  if (!body || typeof body !== "object") {
    return jsonError(400, "INVALID_JSON");
  }

  if ("restaurantId" in body && body.restaurantId != null) {
    return jsonError(400, "RESTAURANT_ID_NOT_ALLOWED", "restaurantId se resuelve en servidor");
  }

  const { buildCatalogMigrationPreview } = await import(
    "@/lib/server/catalog/build-catalog-migration-preview"
  );
  const preview = await buildCatalogMigrationPreview({
    db: authCtx.db,
    restaurantId: authCtx.restaurantId,
    legacyPlatosRaw: body.legacyPlatos,
  });

  return NextResponse.json({ ok: true, preview });
}

export async function handleMigrationPreviewRequestSafe(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
) {
  try {
    return await handleMigrationPreviewRequest(req, dependencies);
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e && typeof e.code === "string"
        ? e.code
        : "PREVIEW_FAILED";
    const httpStatus =
      e && typeof e === "object" && "httpStatus" in e && typeof e.httpStatus === "number"
        ? e.httpStatus
        : 500;
    const message = e instanceof Error ? e.message : "PREVIEW_FAILED";
    if (httpStatus === 500) console.error("[api/catalog/migration-preview]", message, e);
    return jsonError(httpStatus, code, message);
  }
}
