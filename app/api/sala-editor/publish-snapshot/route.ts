import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { SALA_EDITOR_DOCUMENT_VERSION } from "@/lib/sala-editor/types/editor-document";
import {
  parseSalaEditorDocumentForPublished,
} from "@/lib/sala-editor/persistence/sala-editor-published-contract";
import { saveSalaEditorPublishedWithAdmin } from "@/lib/server/sala-editor/save-published-snapshot";

const DRAFT_DOC_ID = "draft" as const;
const MAPS_COLLECTION = "salaEditorMaps" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  const draftSnap = await authCtx.db
    .collection("restaurants")
    .doc(authCtx.restaurantId)
    .collection(MAPS_COLLECTION)
    .doc(DRAFT_DOC_ID)
    .get();

  if (!draftSnap.exists) {
    return NextResponse.json(
      {
        ok: false,
        error: "DRAFT_NOT_FOUND",
        details: "No existe un borrador del Editor V2 para publicar.",
      },
      { status: 404 },
    );
  }

  const raw = draftSnap.data();
  if (
    !isRecord(raw) ||
    raw.state !== DRAFT_DOC_ID ||
    raw.restaurantId !== authCtx.restaurantId ||
    raw.schemaVersion !== SALA_EDITOR_DOCUMENT_VERSION
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_DRAFT",
        details: "El borrador del Editor V2 no cumple el contrato esperado.",
      },
      { status: 409 },
    );
  }

  let document;
  try {
    document = parseSalaEditorDocumentForPublished(
      raw.document,
      authCtx.restaurantId,
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_DRAFT_DOCUMENT",
        details:
          error instanceof Error && error.message.trim()
            ? error.message
            : "El documento del Editor V2 no es publicable.",
      },
      { status: 409 },
    );
  }

  const sourceDraftUpdatedAt =
    typeof raw.updatedAt === "number" &&
    Number.isFinite(raw.updatedAt) &&
    raw.updatedAt > 0
      ? raw.updatedAt
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
