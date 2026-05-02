/**
 * Mapea el modelo local de compra (una línea de producto) al documento Firestore con `items[]`.
 */

import type { CompraLocal } from "@/lib/compras-local";
import { parseCantidadRecibida } from "@/lib/compras-local";
import type { FirestoreCompra, FirestoreCompraItem } from "@/lib/hostly/firestore-types";

export function compraLocalItemsToFirestore(c: CompraLocal): FirestoreCompraItem[] {
  const qty = parseCantidadRecibida(c.cantidad_recibida as unknown);
  const pid = c.producto_stock_id?.trim();
  if (!pid || qty == null || qty <= 0) return [];
  const total = typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0;
  const costeUnitario = total > 0 && qty > 0 ? Math.round((total / qty) * 10000) / 10000 : undefined;
  const item: FirestoreCompraItem = {
    productoId: pid,
    nombre: c.producto_stock_nombre?.trim() || undefined,
    cantidad: qty,
    costeUnitario,
  };
  return [item];
}

/** Payload para upsert/merge en Firestore antes de aplicar stock. */
export function compraLocalToFirestoreUpsert(c: CompraLocal, restauranteId: string): Omit<FirestoreCompra, "updatedAt" | "createdAt"> {
  return {
    restauranteId,
    proveedor: c.proveedor,
    estado: c.estado,
    fecha: c.fecha,
    total: typeof c.total === "number" && Number.isFinite(c.total) ? c.total : 0,
    notas: c.notas,
    aplicadoStock: Boolean(c.stock_aplicado),
    items: compraLocalItemsToFirestore(c),
  };
}
