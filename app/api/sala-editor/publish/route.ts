import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantContext,
} from "@/lib/server/auth/require-authenticated-restaurant";
import {
  PublishSalaEditorMapError,
  publishSalaEditorMap,
} from "@/lib/server/sala-editor/publish-sala-editor-map";
import {
  canPublishSalaEditorMap,
  resolveProfileRoleForSalaEditorPublish,
  SALA_EDITOR_PUBLISH_FORBIDDEN_ERROR,
} from "@/lib/server/sala-editor/require-sala-editor-publish-capability";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false, error, details: details ?? null },
    { status },
  );
}

export type PublishSalaEditorMapRouteDependencies = {
  authenticate?: (
    req: Request,
  ) => Promise<AuthenticatedRestaurantContext | NextResponse>;
  resolveRole?: (db: Firestore, uid: string) => Promise<unknown>;
  publish?: typeof publishSalaEditorMap;
};

/** Publicación explícita draft → salaEditorMaps/published (+ sync legacy). */
export async function handlePublishSalaEditorMapRequest(
  req: Request,
  dependencies?: PublishSalaEditorMapRouteDependencies,
) {
  try {
    const authenticate =
      dependencies?.authenticate ?? requireAuthenticatedRestaurant;
    const authCtx = await authenticate(req);
    if (isAuthErrorResponse(authCtx)) return authCtx;

    const resolveRole =
      dependencies?.resolveRole ?? resolveProfileRoleForSalaEditorPublish;
    const role = await resolveRole(authCtx.db, authCtx.uid);
    if (!canPublishSalaEditorMap(role)) {
      return jsonError(
        403,
        SALA_EDITOR_PUBLISH_FORBIDDEN_ERROR,
        "Se requiere permiso de configuración para publicar el mapa",
      );
    }

    // restaurantId solo del perfil autenticado (no del body).
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body && "restaurantId" in body && body.restaurantId != null) {
      return jsonError(400, "RESTAURANT_ID_NOT_ALLOWED");
    }

    const publish = dependencies?.publish ?? publishSalaEditorMap;
    const result = await publish({
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

export async function POST(req: Request) {
  return handlePublishSalaEditorMapRequest(req);
}
