"use server";

import type { CompraLocal } from "@/lib/compras-local";
import { getHostlyFirestore, isFirestoreConfigured } from "@/lib/firebase/admin";
import { compraLocalToFirestoreUpsert } from "@/lib/hostly/compra-firestore-mapper";
import { assertServerRestauranteAllowed } from "@/lib/hostly/restaurant-scope";
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

/**
 * Sincroniza una compra recibida con Firestore y aplica cantidades a `productos` + `movimientosStock`.
 * Sin credenciales Firebase configuradas devuelve `local_only` (la UI sigue solo con localStorage).
 */
export async function applyReceivedCompraStockAction(params: {
  restauranteId: string;
  compra: CompraLocal;
  usuarioId?: string | null;
}): Promise<ApplyReceivedCompraStockActionResult> {
  if (!isFirestoreConfigured()) {
    return { ok: true, mode: "local_only" };
  }

  try {
    assertServerRestauranteAllowed(params.restauranteId);
  } catch {
    return { ok: false, code: "RESTAURANTE_NOT_ALLOWED" };
  }

  const db = getHostlyFirestore();
  if (!db) {
    return { ok: true, mode: "local_only" };
  }

  const upsert = compraLocalToFirestoreUpsert(params.compra, params.restauranteId);
  const result = await applyReceivedCompraToStock(db, {
    restauranteId: params.restauranteId,
    compraId: params.compra.id,
    upsert,
    usuarioId: params.usuarioId ?? null,
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
