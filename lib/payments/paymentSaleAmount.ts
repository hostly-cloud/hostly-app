/**
 * Importe de venta a usar en analíticas y listados: prioriza `finalTotal` (neto con descuento)
 * y vuelve a `total` para pagos antiguos u órdenes que solo tengan importe bruto.
 */
export function paymentSaleAmount(p: unknown): number {
  if (p == null || typeof p !== "object") return 0;
  const o = p as { finalTotal?: unknown; total?: unknown };
  if (o.finalTotal !== undefined && o.finalTotal !== null) {
    const n = Number(o.finalTotal);
    return Number.isFinite(n) ? n : 0;
  }
  const t = Number(o.total ?? 0);
  return Number.isFinite(t) ? t : 0;
}
