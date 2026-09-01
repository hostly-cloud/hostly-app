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
import type { CatalogProductImageAttachResult } from "@/lib/productos/catalog-product-image-contract";
import { attachCatalogProductImage } from "@/lib/server/product-images/attach-catalog-product-image";
import { getOpenFoodFactsCandidateByCode } from "@/lib/server/product-images/open-food-facts-catalog";
import { normalizeCatalogBarcode } from "@/lib/server/product-images/open-food-facts-exact-product";
import { catalogMatchContextFromProduct } from "@/lib/server/product-images/search-catalog-product-images";
import { assessWineCatalogIdentity } from "@/lib/server/product-images/wine-catalog-identity";
import { resolveCatalogImageAccess } from "@/lib/server/product-images/resolve-catalog-image-access";

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

type ResolveAccess = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
}) => Promise<CatalogImageAccess>;

export type AttachCatalogProductImageRequestDependencies = {
  authenticate?: Authenticate;
  attachCatalog?: AttachCatalog;
  resolveAccess?: ResolveAccess;
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false as const, error, details: details ?? null },
    { status },
  );
}

function readStoredBarcode(data: Record<string, unknown>): string | null {
  for (const key of ["barcode", "ean", "ean13", "gtin"]) {
    const value = data[key];
    if (typeof value === "string") {
      const normalized = normalizeCatalogBarcode(value);
      if (normalized) return normalized;
    }
  }
  return null;
}

async function assertCatalogReferenceMatchesStoredIdentity(params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
  productId: string;
  externalReference: string;
}): Promise<NextResponse | null> {
  const selected = normalizeCatalogBarcode(params.externalReference);
  if (!selected) return jsonError(400, "INVALID_CATALOG_REFERENCE");

  const snap = await params.db
    .collection("restaurants")
    .doc(params.restaurantId)
    .collection("products")
    .doc(params.productId)
    .get();
  if (!snap.exists) return jsonError(404, "PRODUCT_NOT_FOUND");

  const data = snap.data() as Record<string, unknown>;
  const stored = readStoredBarcode(data);
  if (stored && stored !== selected) {
    return jsonError(
      409,
      "CATALOG_BARCODE_MISMATCH",
      "La referencia seleccionada no coincide con el código de barras guardado en Hostly",
    );
  }

  const context = catalogMatchContextFromProduct(data);
  const hasWineIdentity = Boolean(
    context.wineProducer || context.wineAppellation || context.wineVintage,
  );
  if (!hasWineIdentity) return null;

  const candidate = await getOpenFoodFactsCandidateByCode({
    code: selected,
    context,
  });
  const wineAssessment = assessWineCatalogIdentity({ context, candidate });
  if (!wineAssessment.accepted) {
    return jsonError(
      409,
      "CATALOG_WINE_IDENTITY_MISMATCH",
      "La referencia no confirma la bodega, denominación o añada guardadas en Hostly",
    );
  }

  return null;
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

  if (!dependencies?.attachCatalog) {
    const identityError = await assertCatalogReferenceMatchesStoredIdentity({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      productId,
      externalReference,
    });
    if (identityError) return identityError;
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
