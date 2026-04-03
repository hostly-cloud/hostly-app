/**
 * Mermas ↔ inventario: resta al aplicar, revierte al editar/eliminar. Sin dependencia de Compras.
 */

import type { MermaLocal } from "@/lib/mermas-local";
import type { StockProducto } from "@/lib/stock-local";

function cloneStock(stock: StockProducto[]): StockProducto[] {
  return stock.map((p) => ({ ...p }));
}

function parseMermaQty(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return undefined;
    const n = Number(t);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

export function undoMermaStockEffect(merma: MermaLocal, stock: StockProducto[]): StockProducto[] {
  if (!merma.stock_aplicado) return stock;
  const id = merma.producto_stock_id?.trim();
  if (!id) return stock;
  const q = parseMermaQty(merma.cantidad);
  if (q == null || q <= 0) return stock;
  const s = cloneStock(stock);
  const idx = s.findIndex((p) => p.id === id);
  if (idx < 0) return s;
  s[idx] = { ...s[idx], stock_actual: s[idx].stock_actual + q };
  return s;
}

export function reconcileMermaStock(
  previous: MermaLocal | null,
  next: MermaLocal,
  stock: StockProducto[],
): { stock: StockProducto[]; merma: MermaLocal; error?: string } {
  const backup = cloneStock(stock);
  let s = cloneStock(stock);

  if (previous?.stock_aplicado) {
    const idPrev = previous.producto_stock_id?.trim();
    const qtyPrev = parseMermaQty(previous.cantidad);
    if (idPrev && qtyPrev != null && qtyPrev > 0) {
      const ix = s.findIndex((p) => p.id === idPrev);
      if (ix >= 0) {
        s[ix] = { ...s[ix], stock_actual: s[ix].stock_actual + qtyPrev };
      }
    }
  }

  const base: MermaLocal = { ...next, stock_aplicado: false };
  const id = base.producto_stock_id?.trim();
  const qn = parseMermaQty(base.cantidad);

  if (!id || qn == null || qn <= 0) {
    return {
      stock: backup,
      merma: previous ?? base,
      error: "Selecciona producto y una cantidad válida mayor que cero.",
    };
  }

  const idx = s.findIndex((p) => p.id === id);
  if (idx < 0) {
    return {
      stock: backup,
      merma: previous ?? base,
      error: "El producto no está en inventario.",
    };
  }

  const row = s[idx];
  if (row.stock_actual < qn) {
    return {
      stock: backup,
      merma: previous ?? base,
      error: `Stock insuficiente: hay ${row.stock_actual} ${row.unidad}; no puedes registrar ${qn} ${row.unidad}.`,
    };
  }

  s[idx] = { ...row, stock_actual: row.stock_actual - qn };
  const applied: MermaLocal = {
    ...base,
    cantidad: qn,
    stock_aplicado: true,
    producto_stock_nombre: row.nombre,
    unidad: row.unidad,
    producto_stock_id: id,
  };
  return { stock: s, merma: applied };
}
