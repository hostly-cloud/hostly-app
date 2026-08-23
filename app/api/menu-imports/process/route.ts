import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { isMenuImportDebugReportEnabled } from "@/lib/carta/menu-import-debug-report-types";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export type ProcessRouteDependencies = AuthenticatedRestaurantDependencies & {
  processDraft?: typeof import("@/lib/server/menu-imports/process-menu-import-draft")["processMenuImportDraft"];
  promotePhotoVision?: typeof import("@/lib/server/menu-imports/ai-import-v2/promote-photo-vision-items")["promoteValidatedPhotoVisionItems"];
};

export async function handleProcessMenuImportRequest(
  req: Request,
  dependencies?: ProcessRouteDependencies,
) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req, dependencies);
    if (isAuthErrorResponse(authCtx)) {
      return authCtx;
    }
    if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
      return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
    }

    const body = (await req.json().catch(() => null)) as { draftId?: string } | null;
    if (!body || typeof body !== "object") {
      return jsonError(400, "INVALID_JSON");
    }

    const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
    if (!draftId) {
      return jsonError(400, "MISSING_DRAFT_ID", "Envía { draftId }");
    }

    const processDraft =
      dependencies?.processDraft ??
      (
        await import("@/lib/server/menu-imports/process-menu-import-draft")
      ).processMenuImportDraft;
    const result = await processDraft({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      draftId,
      userId: authCtx.uid,
    });

    let visionRecoveredCount = 0;
    if (!result.alreadyProcessed && result.aiImportV2Shadow) {
      try {
        const promotePhotoVision =
          dependencies?.promotePhotoVision ??
          (
            await import(
              "@/lib/server/menu-imports/ai-import-v2/promote-photo-vision-items"
            )
          ).promoteValidatedPhotoVisionItems;
        const promoted = await promotePhotoVision({
          db: authCtx.db,
          restaurantId: authCtx.restaurantId,
          draftId,
          userId: authCtx.uid,
          report: result.aiImportV2Shadow,
        });
        visionRecoveredCount = promoted.recoveredCount;
      } catch (promotionError) {
        console.warn("[api/menu-imports/process] photo vision promotion skipped", {
          error:
            promotionError instanceof Error
              ? promotionError.message
              : "PHOTO_VISION_PROMOTION_FAILED",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      draftId: result.draftId,
      status: result.status,
      alreadyProcessed: result.alreadyProcessed,
      itemCount: result.itemCount + visionRecoveredCount,
      ...(visionRecoveredCount > 0 ? { visionRecoveredCount } : {}),
      ...(result.operationalWarnings?.length
        ? { operationalWarnings: result.operationalWarnings }
        : {}),
      ...(isMenuImportDebugReportEnabled() && result.debugReport
        ? { debugReport: result.debugReport }
        : {}),
    });
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "name" in e &&
      e.name === "ProcessMenuImportDraftError" &&
      "httpStatus" in e &&
      typeof e.httpStatus === "number" &&
      "code" in e &&
      typeof e.code === "string"
    ) {
      return jsonError(e.httpStatus, e.code);
    }
    console.error("[api/menu-imports/process]", { code: "PROCESS_FAILED" });
    return jsonError(500, "PROCESS_FAILED");
  }
}

export async function POST(req: Request) {
  return handleProcessMenuImportRequest(req);
}
