import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export type PreviewRouteDependencies = AuthenticatedRestaurantDependencies & {
  buildPreview?: typeof import("@/lib/server/menu-imports/build-publish-preview")["buildMenuImportPublishPreview"];
  updateDraft?: typeof import("@/lib/server/menu-imports/menu-import-draft-admin")["updateMenuImportDraftAdmin"];
};

export async function handlePublishMenuImportPreviewRequest(
  req: Request,
  dependencies?: PreviewRouteDependencies,
) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req, dependencies);
    if (isAuthErrorResponse(authCtx)) {
      return authCtx;
    }
    if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
      return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
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

    const buildPreview =
      dependencies?.buildPreview ??
      (
        await import("@/lib/server/menu-imports/build-publish-preview")
      ).buildMenuImportPublishPreview;
    const preview = await buildPreview({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      draftId,
      itemIds,
    });

    const updateDraft =
      dependencies?.updateDraft ??
      (
        await import("@/lib/server/menu-imports/menu-import-draft-admin")
      ).updateMenuImportDraftAdmin;
    await updateDraft(authCtx.db, authCtx.restaurantId, draftId, {
      lastPublishPreview: preview,
      updatedBy: authCtx.uid,
    }).catch(() => {
      /* preview still valid if cache write fails */
    });

    return NextResponse.json({ ok: true, preview });
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "name" in e &&
      e.name === "BuildPublishPreviewError" &&
      "httpStatus" in e &&
      typeof e.httpStatus === "number" &&
      "code" in e &&
      typeof e.code === "string"
    ) {
      return jsonError(e.httpStatus, e.code);
    }
    console.error("[api/menu-imports/publish-preview]", {
      code: "PREVIEW_FAILED",
    });
    return jsonError(500, "PREVIEW_FAILED");
  }
}

export async function POST(req: Request) {
  return handlePublishMenuImportPreviewRequest(req);
}
