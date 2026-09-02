import { NextResponse } from "next/server";
import type { CatalogImageCreditAccountSummary } from "@/lib/productos/catalog-image-credit-contract";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantContext,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { readCatalogImageCreditSummary } from "@/lib/server/product-images/read-catalog-image-credit-summary";
import {
  reconcileExpiredCatalogImageCreditReservations,
  type CatalogImageCreditReconciliationResult,
} from "@/lib/server/product-images/reconcile-catalog-image-credits";

type Authenticate = (
  req: Request,
) => Promise<AuthenticatedRestaurantContext | NextResponse>;

export type CatalogImageCreditRequestDependencies = {
  authenticate?: Authenticate;
  readSummary?: (params: {
    db: AuthenticatedRestaurantContext["db"];
    restaurantId: string;
  }) => Promise<CatalogImageCreditAccountSummary>;
  reconcile?: (params: {
    db: AuthenticatedRestaurantContext["db"];
    restaurantId: string;
    actorId: string;
  }) => Promise<CatalogImageCreditReconciliationResult>;
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false as const, error, details: details ?? null },
    { status },
  );
}

async function authorize(
  req: Request,
  dependencies?: CatalogImageCreditRequestDependencies,
) {
  const authenticate =
    dependencies?.authenticate ??
    ((request: Request) => requireAuthenticatedRestaurant(request));
  const auth = await authenticate(req);
  if (isAuthErrorResponse(auth)) return auth;
  if (!serverRoleHasCapability(auth.role, "settings.manage")) {
    return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
  }
  return auth;
}

export async function handleCatalogImageCreditSummaryRequest(
  req: Request,
  dependencies?: CatalogImageCreditRequestDependencies,
) {
  const auth = await authorize(req, dependencies);
  if (isAuthErrorResponse(auth)) return auth;
  const readSummary = dependencies?.readSummary ?? readCatalogImageCreditSummary;
  const summary = await readSummary({
    db: auth.db,
    restaurantId: auth.restaurantId,
  });
  return NextResponse.json({ ok: true as const, summary });
}

export async function handleCatalogImageCreditReconciliationRequest(
  req: Request,
  dependencies?: CatalogImageCreditRequestDependencies,
) {
  const auth = await authorize(req, dependencies);
  if (isAuthErrorResponse(auth)) return auth;
  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    confirmReconciliation?: unknown;
    restaurantId?: unknown;
  } | null;
  if (!body) return jsonError(400, "INVALID_JSON");
  if (body.restaurantId != null) {
    return jsonError(400, "RESTAURANT_ID_NOT_ALLOWED");
  }
  if (body.action !== "reconcile_expired") {
    return jsonError(400, "INVALID_CREDIT_ACTION");
  }
  if (body.confirmReconciliation !== true) {
    return jsonError(400, "CREDIT_RECONCILIATION_CONFIRMATION_REQUIRED");
  }
  const reconcile =
    dependencies?.reconcile ?? reconcileExpiredCatalogImageCreditReservations;
  const result = await reconcile({
    db: auth.db,
    restaurantId: auth.restaurantId,
    actorId: auth.uid,
  });
  const readSummary = dependencies?.readSummary ?? readCatalogImageCreditSummary;
  const summary = await readSummary({
    db: auth.db,
    restaurantId: auth.restaurantId,
  });
  return NextResponse.json({ ok: true as const, result, summary });
}

export async function handleCatalogImageCreditRequestSafe(
  label: string,
  handler: () => Promise<NextResponse>,
) {
  try {
    return await handler();
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "CATALOG_IMAGE_CREDIT_REQUEST_FAILED";
    const message = error instanceof Error ? error.message : code;
    console.error(`[api/catalog/product-image-credits/${label}]`, { code, message });
    return jsonError(500, code, message);
  }
}
