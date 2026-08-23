import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantContext,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import type {
  ProductCommercialIdentity,
  ProductCommercialIdentityInput,
} from "@/lib/productos/product-commercial-identity-contract";
import {
  normalizeProductCommercialIdentityInput,
  readProductCommercialIdentity,
  updateProductCommercialIdentity,
} from "@/lib/server/product-images/product-commercial-identity";

type Authenticate = (
  req: Request,
) => Promise<AuthenticatedRestaurantContext | NextResponse>;

type ReadIdentity = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
  productId: string;
}) => Promise<ProductCommercialIdentity>;

type UpdateIdentity = (params: {
  db: AuthenticatedRestaurantContext["db"];
  restaurantId: string;
  userId: string;
  input: ProductCommercialIdentityInput;
}) => Promise<ProductCommercialIdentity>;

export type ProductCommercialIdentityRequestDependencies = {
  authenticate?: Authenticate;
  readIdentity?: ReadIdentity;
  updateIdentity?: UpdateIdentity;
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false as const, error, details: details ?? null },
    { status },
  );
}

function assertNoClientTenant(urlOrBody: URLSearchParams | Record<string, unknown>) {
  const hasTenant =
    urlOrBody instanceof URLSearchParams
      ? urlOrBody.has("restaurantId")
      : "restaurantId" in urlOrBody && urlOrBody.restaurantId != null;
  return hasTenant
    ? jsonError(
        400,
        "RESTAURANT_ID_NOT_ALLOWED",
        "restaurantId se resuelve en servidor",
      )
    : null;
}

export async function handleGetProductCommercialIdentityRequest(
  req: Request,
  dependencies?: ProductCommercialIdentityRequestDependencies,
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
  const tenantError = assertNoClientTenant(url.searchParams);
  if (tenantError) return tenantError;
  const productId = url.searchParams.get("productId")?.trim() ?? "";
  if (!productId) return jsonError(400, "MISSING_PRODUCT_ID");

  const readIdentity = dependencies?.readIdentity ?? readProductCommercialIdentity;
  const identity = await readIdentity({
    db: authCtx.db,
    restaurantId: authCtx.restaurantId,
    productId,
  });
  return NextResponse.json({ ok: true as const, identity });
}

export async function handleUpdateProductCommercialIdentityRequest(
  req: Request,
  dependencies?: ProductCommercialIdentityRequestDependencies,
) {
  const authenticate =
    dependencies?.authenticate ??
    ((request: Request) => requireAuthenticatedRestaurant(request));
  const authCtx = await authenticate(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
    return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "INVALID_JSON");
  const tenantError = assertNoClientTenant(body);
  if (tenantError) return tenantError;

  const input = normalizeProductCommercialIdentityInput({
    productId: typeof body.productId === "string" ? body.productId : "",
    brand: body.brand,
    quantity: body.quantity,
    barcode: body.barcode,
  });
  const updateIdentity =
    dependencies?.updateIdentity ?? updateProductCommercialIdentity;
  const identity = await updateIdentity({
    db: authCtx.db,
    restaurantId: authCtx.restaurantId,
    userId: authCtx.uid,
    input,
  });
  return NextResponse.json({ ok: true as const, identity });
}

export async function handleProductCommercialIdentityRequestSafe(
  req: Request,
  method: "GET" | "POST",
  dependencies?: ProductCommercialIdentityRequestDependencies,
) {
  try {
    return method === "GET"
      ? await handleGetProductCommercialIdentityRequest(req, dependencies)
      : await handleUpdateProductCommercialIdentityRequest(req, dependencies);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "PRODUCT_COMMERCIAL_IDENTITY_FAILED";
    const httpStatus =
      error && typeof error === "object" && "httpStatus" in error &&
      typeof error.httpStatus === "number"
        ? error.httpStatus
        : 500;
    const message =
      error instanceof Error ? error.message : "PRODUCT_COMMERCIAL_IDENTITY_FAILED";
    if (httpStatus >= 500) {
      console.error("[api/catalog/product-identity]", { code, message });
    }
    return jsonError(httpStatus, code, message);
  }
}
