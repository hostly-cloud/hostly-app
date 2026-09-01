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
import {
  generateImportedProductImage,
  type GenerateImportedProductImageResult,
} from "@/lib/server/product-images/generate-imported-product-image";
import { resolveCatalogImageAccess } from "@/lib/server/product-images/resolve-catalog-image-access";

type Authenticate = (
  req: Request,
) => Promise<AuthenticatedRestaurantContext | NextResponse>;

type Generate = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
  productId: string;
  userId: string;
  idempotencyKey: string;
  access: CatalogImageAccess;
  description?: string;
}) => Promise<GenerateImportedProductImageResult>;

type ResolveAccess = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
}) => Promise<CatalogImageAccess>;

export type GenerateImportedProductImageRequestDependencies = {
  authenticate?: Authenticate;
  generate?: Generate;
  resolveAccess?: ResolveAccess;
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false as const, error, details: details ?? null },
    { status },
  );
}

export async function handleGenerateImportedProductImageRequest(
  req: Request,
  dependencies?: GenerateImportedProductImageRequestDependencies,
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
  if (!hasCatalogImageCapability(access, "catalog.image.ai.single")) {
    return jsonError(
      403,
      "CATALOG_IMAGE_AI_SINGLE_PLAN_REQUIRED",
      "La generación individual de imágenes está disponible en los planes Pro y Ultra",
    );
  }

  const body = (await req.json().catch(() => null)) as {
    productId?: unknown;
    idempotencyKey?: unknown;
    confirmGeneration?: unknown;
    restaurantId?: unknown;
    description?: unknown;
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
  if (!productId) {
    return jsonError(400, "MISSING_PRODUCT_ID");
  }
  const idempotencyKey =
    typeof body.idempotencyKey === "string"
      ? body.idempotencyKey.trim()
      : "";
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)) {
    return jsonError(400, "INVALID_IMAGE_IDEMPOTENCY_KEY");
  }
  if (body.description != null && typeof body.description !== "string") {
    return jsonError(400, "INVALID_PRODUCT_DESCRIPTION");
  }
  const description =
    typeof body.description === "string"
      ? body.description.replace(/\s+/g, " ").trim().slice(0, 500)
      : "";
  if (body.confirmGeneration !== true) {
    return jsonError(
      400,
      "GENERATION_CONFIRMATION_REQUIRED",
      "Envía confirmGeneration: true; la generación puede tener coste",
    );
  }

  const generate = dependencies?.generate ?? generateImportedProductImage;
  const result = await generate({
    db: authCtx.db,
    restaurantId: authCtx.restaurantId,
    productId,
    userId: authCtx.uid,
    idempotencyKey,
    access,
    ...(description ? { description } : {}),
  });

  return NextResponse.json({ ok: true as const, result });
}

export async function handleGenerateImportedProductImageRequestSafe(
  req: Request,
  dependencies?: GenerateImportedProductImageRequestDependencies,
) {
  try {
    return await handleGenerateImportedProductImageRequest(req, dependencies);
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "IMAGE_GENERATION_FAILED";
    const httpStatus =
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      typeof error.httpStatus === "number"
        ? error.httpStatus
        : 500;
    const message =
      error instanceof Error ? error.message : "IMAGE_GENERATION_FAILED";

    if (httpStatus >= 500) {
      console.error("[api/catalog/generate-product-image]", { code, message });
    }
    return jsonError(httpStatus, code, message);
  }
}
