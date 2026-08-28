import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  SALA_EDITOR_MAPS_COLLECTION,
  SALA_EDITOR_PUBLISHED_DOC_ID,
  parseSalaEditorDocumentForPublished,
  parseSalaEditorPublishedDocument,
} from "@/lib/sala-editor/persistence/sala-editor-published-contract";
import { saveSalaEditorPublishedWithAdmin } from "@/lib/server/sala-editor/save-published-snapshot";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  const snapshot = await authCtx.db
    .collection("restaurants")
    .doc(authCtx.restaurantId)
    .collection(SALA_EDITOR_MAPS_COLLECTION)
    .doc(SALA_EDITOR_PUBLISHED_DOC_ID)
    .get();

  if (!snapshot.exists) {
    return NextResponse.json(
      { ok: false, error: "PUBLISHED_NOT_FOUND" },
      { status: 404 },
    );
  }

  try {
    const published = parseSalaEditorPublishedDocument(
      snapshot.data(),
      authCtx.restaurantId,
    );
    return NextResponse.json({ ok: true, published });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_PUBLISHED_SNAPSHOT",
        details:
          error instanceof Error && error.message.trim()
            ? error.message
            : "El snapshot publicado no cumple el contrato V2.",
      },
      { status: 409 },
    );
  }
}

export async function POST(req: Request) {
  const authCtx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
    return NextResponse.json(
      {
        ok: false,
        error: "FORBIDDEN",
        details: "No tienes permiso para publicar la configuración del mapa.",
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!isRecord(body) || !("document" in body)) {
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_REQUEST",
        details: "Falta el documento exacto que se desea publicar.",
      },
      { status: 400 },
    );
  }

  let document;
  try {
    document = parseSalaEditorDocumentForPublished(
      body.document,
      authCtx.restaurantId,
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_PUBLISHED_DOCUMENT",
        details:
          error instanceof Error && error.message.trim()
            ? error.message
            : "El documento del Editor V2 no es publicable.",
      },
      { status: 409 },
    );
  }

  const sourceDraftUpdatedAt =
    typeof body.sourceDraftUpdatedAt === "number" &&
    Number.isFinite(body.sourceDraftUpdatedAt) &&
    body.sourceDraftUpdatedAt > 0
      ? body.sourceDraftUpdatedAt
      : document.updatedAt;

  const published = await saveSalaEditorPublishedWithAdmin({
    db: authCtx.db,
    restaurantId: authCtx.restaurantId,
    document,
    publishedBy: authCtx.uid,
    sourceDraftUpdatedAt,
  });

  return NextResponse.json({
    ok: true,
    publishedAt: published.publishedAt,
    sourceDraftUpdatedAt: published.sourceDraftUpdatedAt ?? null,
    schemaVersion: published.schemaVersion,
    snapshotVersion: published.snapshotVersion,
    counts: {
      espacios: published.document.espacios.length,
      operationalElementInstances:
        published.document.operationalElementInstances.length,
      zones: published.document.zones.length,
      walls: published.document.walls.length,
      wallAttachments: published.document.wallAttachments.length,
      structuralElements: published.document.structuralElements.length,
      landscapeElements: published.document.landscapeElements.length,
      surfaceObjects: published.document.surfaceObjects.length,
    },
  });
}
