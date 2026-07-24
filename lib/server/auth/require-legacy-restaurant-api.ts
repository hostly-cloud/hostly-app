import { NextResponse } from "next/server";
import type { HostlyCapability } from "@/lib/auth/hostly-capabilities";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantContext,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";

function tenantMismatchResponse() {
  return NextResponse.json(
    { ok: false, error: "RESTAURANT_ID_MISMATCH" },
    { status: 403 },
  );
}

function hasContradictoryRestaurantId(
  value: unknown,
  canonicalRestaurantId: string,
): boolean {
  if (value == null || value === "") return false;
  return (
    typeof value !== "string" ||
    value.trim() !== canonicalRestaurantId
  );
}

async function requestHasContradictoryRestaurantId(
  req: Request,
  canonicalRestaurantId: string,
): Promise<boolean> {
  const url = new URL(req.url);
  for (const key of ["restaurantId", "restauranteId"] as const) {
    for (const value of url.searchParams.getAll(key)) {
      if (hasContradictoryRestaurantId(value, canonicalRestaurantId)) {
        return true;
      }
    }
  }

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) return false;
  const body = (await req.clone().json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  return (
    hasContradictoryRestaurantId(
      record.restaurantId,
      canonicalRestaurantId,
    ) ||
    hasContradictoryRestaurantId(
      record.restauranteId,
      canonicalRestaurantId,
    )
  );
}

export async function requireLegacyRestaurantApi(
  req: Request,
  capability: HostlyCapability,
  dependencies?: AuthenticatedRestaurantDependencies,
): Promise<AuthenticatedRestaurantContext | NextResponse> {
  const authContext = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authContext)) return authContext;
  if (!serverRoleHasCapability(authContext.role, capability)) {
    return NextResponse.json(
      { ok: false, error: "CAPABILITY_REQUIRED" },
      { status: 403 },
    );
  }
  if (
    await requestHasContradictoryRestaurantId(
      req,
      authContext.restaurantId,
    )
  ) {
    return tenantMismatchResponse();
  }
  return authContext;
}
