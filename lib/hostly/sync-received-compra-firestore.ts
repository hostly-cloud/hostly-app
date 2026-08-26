/**
 * Tras guardar en localStorage una compra recibida con stock aplicado, intenta replicar en Firestore.
 * Importar solo desde componentes cliente (p. ej. página Compras).
 */

import { applyReceivedCompraStockAction, type ApplyReceivedCompraStockActionResult } from "@/app/actions/compras-stock";
import type { CompraLocal } from "@/lib/compras-local";
import { auth } from "@/lib/firebase/client";
import { loadStock, saveStock } from "@/lib/stock-local";

type FirestoreApplyOk = Extract<ApplyReceivedCompraStockActionResult, { productUpdates: unknown }>;

function isFirestoreApplyOk(res: ApplyReceivedCompraStockActionResult): res is FirestoreApplyOk {
  return res.ok === true && !("mode" in res);
}

export type SyncReceivedCompraResult =
  | { status: "skipped" }
  | { status: "local_only" }
  | { status: "synced"; skippedProductIds: string[] }
  | { status: "error"; code: string; skippedProductIds?: string[] };

export async function syncReceivedCompraToFirestoreIfConfigured(compra: CompraLocal): Promise<SyncReceivedCompraResult> {
  if (compra.estado !== "recibido" || !compra.stock_aplicado) {
    return { status: "skipped" };
  }

  try {
    const user = auth.currentUser;
    if (!user) {
      return { status: "error", code: "UNAUTHORIZED" };
    }

    const idToken = await user.getIdToken();
    const res = await applyReceivedCompraStockAction({
      idToken,
      compra,
    });

    if (!res.ok) {
      return { status: "error", code: res.code, skippedProductIds: res.skippedProductIds };
    }

    if (!isFirestoreApplyOk(res)) {
      return { status: "local_only" };
    }

    const applied = res;
    if (applied.productUpdates.length > 0) {
      const st = loadStock();
      const next = st.map((p) => {
        const u = applied.productUpdates.find((x) => x.productoId === p.id);
        return u ? { ...p, stock_actual: u.cantidadActual } : p;
      });
      saveStock(next);
    }

    return { status: "synced", skippedProductIds: applied.skippedProductIds };
  } catch {
    return { status: "error", code: "NETWORK" };
  }
}
