import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantContext,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  hasCatalogImageCapability,
  type CatalogImageAccess,
} from "@/lib/productos/catalog-image-plan";
import type { ProductImageReviewResolution } from "@/lib/productos/product-image-review-contract";
import {
  resolveProductImageReviewState,
  resolveProductImageReviewStateById,
} from "@/lib/server/product-images/resolve-product-image-review-state";
import { resolveCatalogImageAccess } from "@/lib/server/product-images/resolve-catalog-image-access";

type Authenticate = (
  req: Request,
) => Promise<AuthenticatedRestaurantContext | NextResponse>;

type ResolveByName = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
  productName: string;
}) => Promise<ProductImageReviewResolution>;

type ResolveById = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
  productId: string;
}) => Promise<ProductImageReviewResolution>;

type ResolveAccess = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
}) => Promise<CatalogImageAccess>;

export type ProductImageStateRequestDependencies = {
  authenticate?: Authenticate;
  resolveState?: ResolveByName;
  resolveStateById?: ResolveById;
  resolveAccess?: ResolveAccess;
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false as const, error, details: details ?? null },
    { status },
  );
}

function applyAccess(
  state: ProductImageReviewResolution,
  access: CatalogImageAccess,
): ProductImageReviewResolution {
  if (state.resolution !== "resolved") return state;
  const canGenerate =
    state.canGenerate &&
    hasCatalogImageCapability(access, "catalog.image.ai.single");
  return {
    ...state,
    canGenerate,
    requiresApprovedImageReplacementConfirmation:
      canGenerate && state.requiresApprovedImageReplacementConfirmation,
    canSearchCatalog:
      state.canSearchCatalog &&
      hasCatalogImageCapability(access, "catalog.image.catalogSearch"),
  };
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

  const resolveAccess =
    dependencies?.resolveAccess ?? resolveCatalogImageAccess;
  const access = await resolveAccess({
    db: authCtx.db,
    restaurantId: authCtx.restaurantId,
  });

  const productId = url.searchParams.get("productId")?.trim() ?? "";
  if (productId) {
    const resolveById =
      dependencies?.resolveStateById ?? resolveProductImageReviewStateById;
    const resolvedState = await resolveById({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      productId,
    });
    return NextResponse.json({
      ok: true as const,
      state: applyAccess(resolvedState, access),
      access,
    });
  }

  const productName = url.searchParams.get("name")?.trim() ?? "";
  if (!productName) return jsonError(400, "MISSING_PRODUCT_ID_OR_NAME");
  if (productName.length > 180) return jsonError(400, "PRODUCT_NAME_TOO_LONG");

  const resolveByName =
    dependencies?.resolveState ?? resolveProductImageReviewState;
  const resolvedState = await resolveByName({
    db: authCtx.db,
    restaurantId: authCtx.restaurantId,
    productName,
  });

  return NextResponse.json({
    ok: true as const,
    state: applyAccess(resolvedState, access),
    access,
  });
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
