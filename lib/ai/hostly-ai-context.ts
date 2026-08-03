import type { Firestore } from "firebase-admin/firestore";
import { assertServerRestauranteAllowed } from "@/lib/hostly/restaurant-scope";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";

export type HostlyAiTenantContext =
  | {
      ok: true;
      uid: string;
      restaurantId: string;
      role: string;
      db: Firestore;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

/**
 * Valida identidad (Firebase ID token) y resuelve tenant (restaurantId) solo desde Firestore de perfil.
 * No acepta restaurantId del cliente como fuente de verdad.
 */
export async function resolveHostlyAiTenant(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
): Promise<HostlyAiTenantContext> {
  const authContext = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authContext)) {
    const payload = (await authContext.json().catch(() => null)) as
      | { error?: string }
      | null;
    return {
      ok: false,
      error: payload?.error || "AUTHORIZATION_FAILED",
      status: authContext.status,
    };
  }

  try {
    assertServerRestauranteAllowed(authContext.restaurantId);
  } catch {
    return { ok: false, error: "HOSTLY_RESTAURANTE_NOT_ALLOWED", status: 403 };
  }

  return {
    ok: true,
    uid: authContext.uid,
    restaurantId: authContext.restaurantId,
    role: authContext.role,
    db: authContext.db,
  };
}
