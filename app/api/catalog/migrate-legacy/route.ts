import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { MAX_LEGACY_PLATOS_MIGRATION_PREVIEW_SERVER } from "@/lib/server/catalog/build-catalog-migration-preview";
import { BuildCatalogMigrationPreviewError } from "@/lib/server/catalog/build-catalog-migration-preview";
import {
  MigrateLegacyCatalogError,
  migrateLegacyCatalog,
} from "@/lib/server/catalog/migrate-legacy-catalog";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export async function POST(req: Request) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(authCtx)) {
      return authCtx;
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
  } catch (e) {
    if (e instanceof MigrateLegacyCatalogError) {
      return jsonError(e.httpStatus, e.code, e.message);
    }
    if (e instanceof BuildCatalogMigrationPreviewError) {
      return jsonError(e.httpStatus, e.code, e.message);
    }
    const message = e instanceof Error ? e.message : "MIGRATE_FAILED";
    console.error("[api/catalog/migrate-legacy]", message, e);
    return jsonError(500, "MIGRATE_FAILED", message);
  }
}
