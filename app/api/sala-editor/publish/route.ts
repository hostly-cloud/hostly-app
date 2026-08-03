import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import {
  PublishSalaEditorMapError,
  publishSalaEditorMap,
} from "@/lib/server/sala-editor/publish-sala-editor-map";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false, error, details: details ?? null },
    { status },
  );
}

/** Publicación explícita draft → salaEditorMaps/published (+ sync legacy). */
export async function POST(req: Request) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(authCtx)) return authCtx;

    // restaurantId solo del perfil autenticado (no del body).
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body && "restaurantId" in body && body.restaurantId != null) {
      return jsonError(400, "RESTAURANT_ID_NOT_ALLOWED");
    }

    const result = await publishSalaEditorMap({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      uid: authCtx.uid,
    });

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (e instanceof PublishSalaEditorMapError) {
      return jsonError(e.httpStatus, e.code, e.message);
    }
    const message = e instanceof Error ? e.message : "PUBLISH_FAILED";
    console.error("[api/sala-editor/publish]", message, e);
    return jsonError(500, "PUBLISH_FAILED", message);
  }
}
