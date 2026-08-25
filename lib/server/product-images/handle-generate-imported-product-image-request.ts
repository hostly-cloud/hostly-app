import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantContext,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  generateImportedProductImage,
  type GenerateImportedProductImageResult,
} from "@/lib/server/product-images/generate-imported-product-image";

type Authenticate = (
  req: Request,
) => Promise<AuthenticatedRestaurantContext | NextResponse>;

type Generate = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
  productId: string;
  userId: string;
}) => Promise<GenerateImportedProductImageResult>;

export type GenerateImportedProductImageRequestDependencies = {
  authenticate?: Authenticate;
  generate?: Generate;
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

  const body = (await req.json().catch(() => null)) as {
    productId?: unknown;
    confirmGeneration?: unknown;
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
  if (!productId) {
    return jsonError(400, "MISSING_PRODUCT_ID");
  }
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
