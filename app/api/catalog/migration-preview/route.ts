import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import {
  BuildCatalogMigrationPreviewError,
  buildCatalogMigrationPreview,
} from "@/lib/server/catalog/build-catalog-migration-preview";

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
      restaurantId?: unknown;
    } | null;

    if (!body || typeof body !== "object") {
      return jsonError(400, "INVALID_JSON");
    }

    if ("restaurantId" in body && body.restaurantId != null) {
      return jsonError(400, "RESTAURANT_ID_NOT_ALLOWED", "restaurantId se resuelve en servidor");
    }

    const preview = await buildCatalogMigrationPreview({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      legacyPlatosRaw: body.legacyPlatos,
    });

    return NextResponse.json({ ok: true, preview });
  } catch (e) {
    if (e instanceof BuildCatalogMigrationPreviewError) {
      return jsonError(e.httpStatus, e.code, e.message);
    }
    const message = e instanceof Error ? e.message : "PREVIEW_FAILED";
    console.error("[api/catalog/migration-preview]", message, e);
    return jsonError(500, "PREVIEW_FAILED", message);
  }
}
