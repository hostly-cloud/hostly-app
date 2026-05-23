import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import {
  PublishMenuImportDraftError,
  publishMenuImportDraft,
} from "@/lib/server/menu-imports/publish-menu-import-draft";

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
      confirmDuplicates?: unknown;
    } | null;

    if (!body || typeof body !== "object") {
      return jsonError(400, "INVALID_JSON");
    }

    const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
    if (!draftId) {
      return jsonError(400, "MISSING_DRAFT_ID", "Envía { draftId, itemIds?, confirmDuplicates? }");
    }

    const itemIds = Array.isArray(body.itemIds)
      ? body.itemIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : undefined;

    const confirmDuplicates = Array.isArray(body.confirmDuplicates)
      ? body.confirmDuplicates.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      : undefined;

    const result = await publishMenuImportDraft({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      draftId,
      userId: authCtx.uid,
      itemIds,
      confirmDuplicates,
    });

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (e instanceof PublishMenuImportDraftError) {
      return jsonError(e.httpStatus, e.code, e.message);
    }
    const message = e instanceof Error ? e.message : "PUBLISH_FAILED";
    console.error("[api/menu-imports/publish]", message, e);
    return jsonError(500, "PUBLISH_FAILED", message);
  }
}
