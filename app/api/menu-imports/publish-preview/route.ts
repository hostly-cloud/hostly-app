import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import {
  BuildPublishPreviewError,
  buildMenuImportPublishPreview,
} from "@/lib/server/menu-imports/build-publish-preview";
import { updateMenuImportDraftAdmin } from "@/lib/server/menu-imports/menu-import-draft-admin";

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
      draftId?: string;
      itemIds?: unknown;
    } | null;

    if (!body || typeof body !== "object") {
      return jsonError(400, "INVALID_JSON");
    }

    const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
    if (!draftId) {
      return jsonError(400, "MISSING_DRAFT_ID", "Envía { draftId, itemIds? }");
    }

    const itemIds = Array.isArray(body.itemIds)
      ? body.itemIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : undefined;

    const preview = await buildMenuImportPublishPreview({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      draftId,
      itemIds,
    });

    await updateMenuImportDraftAdmin(authCtx.db, authCtx.restaurantId, draftId, {
      lastPublishPreview: preview,
      updatedBy: authCtx.uid,
    }).catch(() => {
      /* preview still valid if cache write fails */
    });

    return NextResponse.json({ ok: true, preview });
  } catch (e) {
    if (e instanceof BuildPublishPreviewError) {
      return jsonError(e.httpStatus, e.code, e.message);
    }
    const message = e instanceof Error ? e.message : "PREVIEW_FAILED";
    console.error("[api/menu-imports/publish-preview]", message, e);
    return jsonError(500, "PREVIEW_FAILED", message);
  }
}
