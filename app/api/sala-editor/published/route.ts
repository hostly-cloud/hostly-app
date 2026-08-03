import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { loadSalaEditorPublishedAdmin } from "@/lib/server/sala-editor/publish-sala-editor-map";
import { resolveTpvMapSource } from "@/lib/sala-editor/persistence/sala-editor-published-types";

/**
 * Lectura Admin de salaEditorMaps/published (TPV no depende de Rules deploy).
 * Nunca devuelve draft.
 */
export async function GET(req: Request) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(authCtx)) return authCtx;

    const published = await loadSalaEditorPublishedAdmin({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
    });
    const source = resolveTpvMapSource(published);

    return NextResponse.json({
      ok: true,
      source,
      published: source === "v2-published" ? published : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "LOAD_PUBLISHED_FAILED";
    console.error("[api/sala-editor/published]", message, e);
    return NextResponse.json(
      {
        ok: true,
        source: "legacy-fallback",
        published: null,
        details: message,
      },
      { status: 200 },
    );
  }
}
