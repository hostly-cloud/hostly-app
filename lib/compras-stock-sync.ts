/**
 * Sincronización local Compras ↔ Stock (localStorage).
 * Revierte la aplicación previa de `previous` si `stock_aplicado`, luego aplica `next` solo si
 * estado === "recibido" con producto y cantidad válidos. Así no hay doble conteo al recargar ni al editar.
 */

import {
  type CompraLocal,
  compraSumaStockContabilizada,
  parseCantidadRecibida,
} from "@/lib/compras-local";
import type { StockProducto } from "@/lib/stock-local";

function cloneStock(stock: StockProducto[]): StockProducto[] {
  return stock.map((p) => ({ ...p }));
}

function pid(c: CompraLocal): string | undefined {
  return c.producto_stock_id?.trim() || undefined;
}

/** Cantidad efectiva (JSON puede traer string). */
function qtyRecibida(c: CompraLocal): number | undefined {
  return parseCantidadRecibida(c.cantidad_recibida as unknown);
}

export function undoCompraStockEffect(compra: CompraLocal, stock: StockProducto[]): StockProducto[] {
  if (!compraSumaStockContabilizada(compra)) return stock;
  const id = pid(compra);
  if (!id) return stock;
  const q = qtyRecibida(compra);
  if (q == null || q <= 0) return stock;
  const s = cloneStock(stock);
  const idx = s.findIndex((p) => p.id === id);
  if (idx < 0) return s;
  s[idx] = { ...s[idx], stock_actual: Math.max(0, s[idx].stock_actual - q) };
  return s;
}

export function reconcileCompraStock(
  previous: CompraLocal | null,
  next: CompraLocal,
  stock: StockProducto[],
): { stock: StockProducto[]; compra: CompraLocal } {
  const s = cloneStock(stock);
  const c = { ...next };

  if (previous && compraSumaStockContabilizada(previous)) {
    const idPrev = pid(previous);
    const qtyPrev = qtyRecibida(previous);
    if (idPrev && qtyPrev != null && qtyPrev > 0) {
      const idx = s.findIndex((p) => p.id === idPrev);
      if (idx >= 0) {
        s[idx] = { ...s[idx], stock_actual: Math.max(0, s[idx].stock_actual - qtyPrev) };
      }
    }
  }

  c.stock_aplicado = false;

  const idNext = pid(c);
  const qtyNext = qtyRecibida(c);
  const canApply = c.estado === "recibido" && Boolean(idNext) && qtyNext != null && qtyNext > 0;

  if (canApply) {
    const idx = s.findIndex((p) => p.id === idNext);
    if (idx >= 0) {
      s[idx] = { ...s[idx], stock_actual: s[idx].stock_actual + qtyNext };
      c.stock_aplicado = true;
      c.cantidad_recibida = qtyNext;
    }
  }

  return { stock: s, compra: c };
}
