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
import type { CatalogProductImageSearchResult } from "@/lib/productos/catalog-product-image-contract";
import { searchCatalogProductImages } from "@/lib/server/product-images/search-catalog-product-images";
import { resolveCatalogImageAccess } from "@/lib/server/product-images/resolve-catalog-image-access";
import {
  finalizeCatalogImageOperation,
  reserveCatalogImageOperation,
} from "@/lib/server/product-images/meter-catalog-image-operation";
import { reconcileExpiredCatalogImageCreditReservations } from "@/lib/server/product-images/reconcile-catalog-image-credits";

type Authenticate = (
  req: Request,
) => Promise<AuthenticatedRestaurantContext | NextResponse>;

type SearchCatalog = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
  productId: string;
  query: string;
}) => Promise<CatalogProductImageSearchResult>;

type ResolveAccess = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
}) => Promise<CatalogImageAccess>;

export type SearchCatalogProductImagesRequestDependencies = {
  authenticate?: Authenticate;
  searchCatalog?: SearchCatalog;
  resolveAccess?: ResolveAccess;
  reconcileExpiredReservations?: typeof reconcileExpiredCatalogImageCreditReservations;
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false as const, error, details: details ?? null },
    { status },
  );
}

export async function handleSearchCatalogProductImagesRequest(
  req: Request,
  dependencies?: SearchCatalogProductImagesRequestDependencies,
) {
  const authenticate =
    dependencies?.authenticate ??
    ((request: Request) => requireAuthenticatedRestaurant(request));
  const authCtx = await authenticate(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
    return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
  }

  const resolveAccess = dependencies?.resolveAccess ?? resolveCatalogImageAccess;
  const access = await resolveAccess({
    db: authCtx.db,
    restaurantId: authCtx.restaurantId,
  });
  if (!hasCatalogImageCapability(access, "catalog.image.catalogSearch")) {
    return jsonError(
      403,
      "CATALOG_IMAGE_SEARCH_PLAN_REQUIRED",
      "La búsqueda de imágenes reales está disponible en los planes Pro y Ultra",
    );
  }

  const body = (await req.json().catch(() => null)) as {
    productId?: unknown;
    query?: unknown;
    idempotencyKey?: unknown;
    confirmSearch?: unknown;
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

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query.length > 160) return jsonError(400, "CATALOG_QUERY_TOO_LONG");

  if (body.confirmSearch !== true) {
    return jsonError(
      400,
      "CATALOG_SEARCH_CONFIRMATION_REQUIRED",
      "Confirma expresamente la búsqueda antes de consultar el catálogo",
    );
  }

  const idempotencyKey =
    typeof body.idempotencyKey === "string"
      ? body.idempotencyKey.trim()
      : "";
  if (access.meteringMode === "credit_balance") {
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)) {
      return jsonError(400, "INVALID_IMAGE_IDEMPOTENCY_KEY");
    }
    const reconcileExpiredReservations = dependencies
      ? dependencies.reconcileExpiredReservations
      : reconcileExpiredCatalogImageCreditReservations;
    if (reconcileExpiredReservations) {
      await reconcileExpiredReservations({
        db: authCtx.db,
        restaurantId: authCtx.restaurantId,
        actorId: authCtx.uid,
      }).catch((error) => {
        console.error("[catalog-image-credits/reconcile-before-search]", {
          message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        });
      });
    }
    await reserveCatalogImageOperation({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      productId,
      userId: authCtx.uid,
      idempotencyKey,
      capability: "catalog.image.catalogSearch",
      operation: "catalog_image_catalog_search_single",
      provider: "open_food_facts",
    });
  }

  const searchCatalog =
    dependencies?.searchCatalog ?? searchCatalogProductImages;
  let result: CatalogProductImageSearchResult;
  try {
    result = await searchCatalog({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      productId,
      query,
    });
    if (access.meteringMode === "credit_balance") {
      await finalizeCatalogImageOperation({
        db: authCtx.db,
        restaurantId: authCtx.restaurantId,
        idempotencyKey,
        result: result.candidates.length > 0 ? "candidates" : "not_found",
        succeeded: true,
        metadata: { candidateCount: result.candidates.length },
      });
    }
  } catch (error) {
    if (access.meteringMode === "credit_balance") {
      const failureReason =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "CATALOG_IMAGE_SEARCH_FAILED";
      await finalizeCatalogImageOperation({
        db: authCtx.db,
        restaurantId: authCtx.restaurantId,
        idempotencyKey,
        result: "failed",
        succeeded: false,
        failureReason,
      }).catch(() => undefined);
    }
    throw error;
  }

  return NextResponse.json({ ok: true as const, result });
}

export async function handleSearchCatalogProductImagesRequestSafe(
  req: Request,
  dependencies?: SearchCatalogProductImagesRequestDependencies,
) {
  try {
    return await handleSearchCatalogProductImagesRequest(req, dependencies);
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "CATALOG_IMAGE_SEARCH_FAILED";
    const httpStatus =
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      typeof error.httpStatus === "number"
        ? error.httpStatus
        : 500;
    const message =
      error instanceof Error ? error.message : "CATALOG_IMAGE_SEARCH_FAILED";
    if (httpStatus >= 500) {
      console.error("[api/catalog/search-product-images]", { code, message });
    }
    return jsonError(httpStatus, code, message);
  }
}
