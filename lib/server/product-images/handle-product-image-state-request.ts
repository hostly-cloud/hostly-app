import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantContext,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import type { ProductImageReviewResolution } from "@/lib/productos/product-image-review-contract";
import { resolveProductImageReviewState } from "@/lib/server/product-images/resolve-product-image-review-state";

type Authenticate = (
  req: Request,
) => Promise<AuthenticatedRestaurantContext | NextResponse>;

type ResolveState = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
  productName: string;
}) => Promise<ProductImageReviewResolution>;

export type ProductImageStateRequestDependencies = {
  authenticate?: Authenticate;
  resolveState?: ResolveState;
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false as const, error, details: details ?? null },
    { status },
  );
}

export async function handleProductImageStateRequest(
  req: Request,
  dependencies?: ProductImageStateRequestDependencies,
) {
  const authenticate =
    dependencies?.authenticate ??
    ((request: Request) => requireAuthenticatedRestaurant(request));
  const authCtx = await authenticate(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
    return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
  }

  const url = new URL(req.url);
  if (url.searchParams.has("restaurantId")) {
    return jsonError(
      400,
      "RESTAURANT_ID_NOT_ALLOWED",
      "restaurantId se resuelve en servidor",
    );
  }

  const productName = url.searchParams.get("name")?.trim() ?? "";
  if (!productName) return jsonError(400, "MISSING_PRODUCT_NAME");
  if (productName.length > 180) return jsonError(400, "PRODUCT_NAME_TOO_LONG");

  const resolveState =
    dependencies?.resolveState ?? resolveProductImageReviewState;
  const state = await resolveState({
    db: authCtx.db,
    restaurantId: authCtx.restaurantId,
    productName,
  });

  return NextResponse.json({ ok: true as const, state });
}

export async function handleProductImageStateRequestSafe(
  req: Request,
  dependencies?: ProductImageStateRequestDependencies,
) {
  try {
    return await handleProductImageStateRequest(req, dependencies);
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "PRODUCT_IMAGE_STATE_FAILED";
    const httpStatus =
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      typeof error.httpStatus === "number"
        ? error.httpStatus
        : 500;
    const message =
      error instanceof Error ? error.message : "PRODUCT_IMAGE_STATE_FAILED";
    if (httpStatus >= 500) {
      console.error("[api/catalog/product-image-state]", { code, message });
    }
    return jsonError(httpStatus, code, message);
  }
}
