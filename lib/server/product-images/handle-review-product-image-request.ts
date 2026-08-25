import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantContext,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import type {
  ProductImageReviewAction,
  ProductImageReviewResolvedState,
} from "@/lib/productos/product-image-review-contract";
import { reviewProductImage } from "@/lib/server/product-images/review-product-image";

type Authenticate = (
  req: Request,
) => Promise<AuthenticatedRestaurantContext | NextResponse>;

type Review = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
  productId: string;
  userId: string;
  action: ProductImageReviewAction;
}) => Promise<ProductImageReviewResolvedState>;

export type ReviewProductImageRequestDependencies = {
  authenticate?: Authenticate;
  review?: Review;
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false as const, error, details: details ?? null },
    { status },
  );
}

export async function handleReviewProductImageRequest(
  req: Request,
  dependencies?: ReviewProductImageRequestDependencies,
) {
  const authenticate =
    dependencies?.authenticate ??
    ((request: Request) => requireAuthenticatedRestaurant(request));
  const authCtx = await authenticate(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
    return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
  }

  const body = (await req.json().catch(() => null)) as {
    productId?: unknown;
    action?: unknown;
    restaurantId?: unknown;
  } | null;

  if (!body || typeof body !== "object") {
    return jsonError(400, "INVALID_JSON");
  }
  if ("restaurantId" in body && body.restaurantId != null) {
    return jsonError(
      400,
      "RESTAURANT_ID_NOT_ALLOWED",
      "restaurantId se resuelve en servidor",
    );
  }

  const productId =
    typeof body.productId === "string" ? body.productId.trim() : "";
  if (!productId) return jsonError(400, "MISSING_PRODUCT_ID");

  const action = body.action;
  if (action !== "approve" && action !== "reject") {
    return jsonError(400, "INVALID_IMAGE_REVIEW_ACTION");
  }

  const review = dependencies?.review ?? reviewProductImage;
  const state = await review({
    db: authCtx.db,
    restaurantId: authCtx.restaurantId,
    productId,
    userId: authCtx.uid,
    action,
  });

  return NextResponse.json({ ok: true as const, state });
}

export async function handleReviewProductImageRequestSafe(
  req: Request,
  dependencies?: ReviewProductImageRequestDependencies,
) {
  try {
    return await handleReviewProductImageRequest(req, dependencies);
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "PRODUCT_IMAGE_REVIEW_FAILED";
    const httpStatus =
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      typeof error.httpStatus === "number"
        ? error.httpStatus
        : 500;
    const message =
      error instanceof Error ? error.message : "PRODUCT_IMAGE_REVIEW_FAILED";
    if (httpStatus >= 500) {
      console.error("[api/catalog/review-product-image]", { code, message });
    }
    return jsonError(httpStatus, code, message);
  }
}
