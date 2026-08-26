"use server";

import type { CompraLocal } from "@/lib/compras-local";
import { isFirestoreConfigured } from "@/lib/firebase/admin";
import { compraLocalToFirestoreUpsert } from "@/lib/hostly/compra-firestore-mapper";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { applyReceivedCompraToStock } from "@/lib/services/firestore/apply-received-compra-to-stock";

export type ApplyReceivedCompraStockActionResult =
  | { ok: true; mode: "local_only" }
  | {
      ok: true;
      alreadyApplied: boolean;
      aplicadoStock: boolean;
      productUpdates: Array<{ productoId: string; cantidadActual: number }>;
      skippedProductIds: string[];
    }
  | { ok: false; code: string; skippedProductIds?: string[] };

async function authErrorCode(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof payload?.error === "string" && payload.error.trim()
    ? payload.error.trim()
    : "UNAUTHORIZED";
}

/**
 * Sincroniza una compra recibida con Firestore y aplica cantidades a `productos` + `movimientosStock`.
 * El tenant y el usuario se resuelven exclusivamente desde el ID token Firebase verificado en servidor.
 * Sin credenciales Firebase Admin configuradas devuelve `local_only` (la UI sigue solo con localStorage).
 */
export async function applyReceivedCompraStockAction(params: {
  idToken: string;
  compra: CompraLocal;
}): Promise<ApplyReceivedCompraStockActionResult> {
  if (!isFirestoreConfigured()) {
    return { ok: true, mode: "local_only" };
  }

  const idToken = typeof params.idToken === "string" ? params.idToken.trim() : "";
  if (!idToken) {
    return { ok: false, code: "UNAUTHORIZED" };
  }

  const authContext = await requireAuthenticatedRestaurant(
    new Request("http://hostly.internal/actions/compras-stock", {
      headers: { authorization: `Bearer ${idToken}` },
    }),
  );
  if (isAuthErrorResponse(authContext)) {
    return { ok: false, code: await authErrorCode(authContext) };
  }

  if (
    !serverRoleHasCapability(authContext.role, "purchases.manage") ||
    !serverRoleHasCapability(authContext.role, "inventory.edit")
  ) {
    return { ok: false, code: "PURCHASES_INVENTORY_PERMISSION_REQUIRED" };
  }

  const upsert = compraLocalToFirestoreUpsert(params.compra, authContext.restaurantId);
  const result = await applyReceivedCompraToStock(authContext.db, {
    restauranteId: authContext.restaurantId,
    compraId: params.compra.id,
    upsert,
    usuarioId: authContext.uid,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, skippedProductIds: result.skippedProductIds };
  }

  return {
    ok: true,
    alreadyApplied: result.alreadyApplied,
    aplicadoStock: result.aplicadoStock,
    productUpdates: result.productUpdates,
    skippedProductIds: result.skippedProductIds,
  };
}
