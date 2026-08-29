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

export type PublishRouteDependencies = AuthenticatedRestaurantDependencies & {
  publishDraft?: typeof import("@/lib/server/menu-imports/publish-menu-import-draft")["publishMenuImportDraft"];
};

export async function handlePublishMenuImportRequest(
  req: Request,
  dependencies?: PublishRouteDependencies,
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
      confirmDuplicates?: unknown;
      confirmReviews?: unknown;
    } | null;

    if (!body || typeof body !== "object") {
      return jsonError(400, "INVALID_JSON");
    }

    const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
    if (!draftId) {
      return jsonError(
        400,
        "MISSING_DRAFT_ID",
        "Envía { draftId, itemIds?, confirmDuplicates?, confirmReviews? }",
      );
    }

    const itemIds = Array.isArray(body.itemIds)
      ? body.itemIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : undefined;

    const confirmDuplicates = Array.isArray(body.confirmDuplicates)
      ? body.confirmDuplicates.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      : undefined;

    const confirmReviews = Array.isArray(body.confirmReviews)
      ? body.confirmReviews.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      : undefined;

    const publishDraft =
      dependencies?.publishDraft ??
      (
        await import("@/lib/server/menu-imports/publish-menu-import-draft")
      ).publishMenuImportDraft;
    const result = await publishDraft({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      draftId,
      userId: authCtx.uid,
      itemIds,
      confirmDuplicates,
      confirmReviews,
    });

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "name" in e &&
      e.name === "PublishMenuImportDraftError" &&
      "httpStatus" in e &&
      typeof e.httpStatus === "number" &&
      "code" in e &&
      typeof e.code === "string"
    ) {
      return jsonError(e.httpStatus, e.code);
    }
    console.error("[api/menu-imports/publish]", { code: "PUBLISH_FAILED" });
    return jsonError(500, "PUBLISH_FAILED");
  }
}

export async function POST(req: Request) {
  return handlePublishMenuImportRequest(req);
}
