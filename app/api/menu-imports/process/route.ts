import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import {
  ProcessMenuImportDraftError,
  processMenuImportDraft,
} from "@/lib/server/menu-imports/process-menu-import-draft";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export async function POST(req: Request) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(authCtx)) {
      return authCtx;
    }

    const body = (await req.json().catch(() => null)) as { draftId?: string } | null;
    if (!body || typeof body !== "object") {
      return jsonError(400, "INVALID_JSON");
    }

    const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
    if (!draftId) {
      return jsonError(400, "MISSING_DRAFT_ID", "Envía { draftId }");
    }

    const result = await processMenuImportDraft({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      draftId,
      userId: authCtx.uid,
    });

    return NextResponse.json({
      ok: true,
      draftId: result.draftId,
      status: result.status,
      alreadyProcessed: result.alreadyProcessed,
      itemCount: result.itemCount,
      ...(process.env.NODE_ENV !== "production"
        ? {
            _devPipelineHint:
              "Trazabilidad completa en terminal del servidor: [Hostly][MenuImport Pipeline]",
          }
        : {}),
    });
  } catch (e) {
    if (e instanceof ProcessMenuImportDraftError) {
      return jsonError(e.httpStatus, e.code, e.message);
    }
    const message = e instanceof Error ? e.message : "PROCESS_FAILED";
    console.error("[api/menu-imports/process]", message, e);
    return jsonError(500, "PROCESS_FAILED", message);
  }
}
