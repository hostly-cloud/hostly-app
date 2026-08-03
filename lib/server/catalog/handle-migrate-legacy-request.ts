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

export async function handleMigrateLegacyRequest(
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
    previewId?: unknown;
    restaurantId?: unknown;
  } | null;

  if (!body || typeof body !== "object") {
    return jsonError(400, "INVALID_JSON");
  }

  if ("restaurantId" in body && body.restaurantId != null) {
    return jsonError(400, "RESTAURANT_ID_NOT_ALLOWED", "restaurantId se resuelve en servidor");
  }

  if (!Array.isArray(body.legacyPlatos)) {
    return jsonError(400, "MISSING_LEGACY_PLATOS", "Envía { legacyPlatos: [...] }");
  }

  if (body.legacyPlatos.length === 0) {
    return jsonError(400, "EMPTY_LEGACY", "No hay platos legacy para migrar");
  }

  const { MAX_LEGACY_PLATOS_MIGRATION_PREVIEW_SERVER, migrateLegacyCatalog } =
    await import("@/lib/server/catalog/migrate-legacy-catalog-bundle");

  if (body.legacyPlatos.length > MAX_LEGACY_PLATOS_MIGRATION_PREVIEW_SERVER) {
    return jsonError(
      400,
      "LEGACY_LIMIT_EXCEEDED",
      `Máximo ${MAX_LEGACY_PLATOS_MIGRATION_PREVIEW_SERVER} platos por migración`,
    );
  }

  const result = await migrateLegacyCatalog({
    db: authCtx.db,
    restaurantId: authCtx.restaurantId,
    userId: authCtx.uid,
    legacyPlatosRaw: body.legacyPlatos,
  });

  return NextResponse.json({ ok: true, result });
}

export async function handleMigrateLegacyRequestSafe(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
) {
  try {
    return await handleMigrateLegacyRequest(req, dependencies);
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e && typeof e.code === "string"
        ? e.code
        : "MIGRATE_FAILED";
    const httpStatus =
      e && typeof e === "object" && "httpStatus" in e && typeof e.httpStatus === "number"
        ? e.httpStatus
        : 500;
    const message = e instanceof Error ? e.message : "MIGRATE_FAILED";
    if (httpStatus === 500) console.error("[api/catalog/migrate-legacy]", message, e);
    return jsonError(httpStatus, code, message);
  }
}
