import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantContext,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import type { CatalogProductImageAttachResult } from "@/lib/productos/catalog-product-image-contract";
import { attachCatalogProductImage } from "@/lib/server/product-images/attach-catalog-product-image";

type Authenticate = (
  req: Request,
) => Promise<AuthenticatedRestaurantContext | NextResponse>;

type AttachCatalog = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
  productId: string;
  externalReference: string;
  userId: string;
}) => Promise<CatalogProductImageAttachResult>;

export type AttachCatalogProductImageRequestDependencies = {
  authenticate?: Authenticate;
  attachCatalog?: AttachCatalog;
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false as const, error, details: details ?? null },
    { status },
  );
}

export async function handleAttachCatalogProductImageRequest(
  req: Request,
  dependencies?: AttachCatalogProductImageRequestDependencies,
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
    externalReference?: unknown;
    confirmSelection?: unknown;
    restaurantId?: unknown;
    imageUrl?: unknown;
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
  if ("imageUrl" in body && body.imageUrl != null) {
    return jsonError(
      400,
      "CATALOG_IMAGE_URL_NOT_ALLOWED_FROM_CLIENT",
      "La imagen se vuelve a resolver desde el proveedor usando su referencia",
    );
  }

  const productId =
    typeof body.productId === "string" ? body.productId.trim() : "";
  const externalReference =
    typeof body.externalReference === "string"
      ? body.externalReference.trim()
      : "";
  if (!productId) return jsonError(400, "MISSING_PRODUCT_ID");
  if (!externalReference) {
    return jsonError(400, "MISSING_CATALOG_REFERENCE");
  }
  if (body.confirmSelection !== true) {
    return jsonError(
      400,
      "CATALOG_SELECTION_CONFIRMATION_REQUIRED",
      "Envía confirmSelection: true después de que el usuario elija el candidato",
    );
  }

  const attachCatalog =
    dependencies?.attachCatalog ?? attachCatalogProductImage;
  const result = await attachCatalog({
    db: authCtx.db,
    restaurantId: authCtx.restaurantId,
    productId,
    externalReference,
    userId: authCtx.uid,
  });

  return NextResponse.json({ ok: true as const, result });
}

export async function handleAttachCatalogProductImageRequestSafe(
  req: Request,
  dependencies?: AttachCatalogProductImageRequestDependencies,
) {
  try {
    return await handleAttachCatalogProductImageRequest(req, dependencies);
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "CATALOG_IMAGE_ATTACH_FAILED";
    const httpStatus =
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      typeof error.httpStatus === "number"
        ? error.httpStatus
        : 500;
    const message =
      error instanceof Error ? error.message : "CATALOG_IMAGE_ATTACH_FAILED";
    if (httpStatus >= 500) {
      console.error("[api/catalog/attach-product-image]", { code, message });
    }
    return jsonError(httpStatus, code, message);
  }
}
