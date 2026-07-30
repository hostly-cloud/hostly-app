/**
 * Pedido activo para invariante mesa (ocupancy TPV).
 * Alineado con `isOrderStatusActiveForTableOccupancy` sin importar SDK cliente.
 */

const TERMINAL_TPV_ORDER_STATUSES = new Set([
  "closed",
  "paid",
  "cancelled",
  "canceled",
  "cancelado",
  "merged",
]);

export function isTerminalTpvOrderStatus(status: unknown): boolean {
  if (status == null) return false;
  const s = String(status).trim().toLowerCase();
  if (s === "") return false;
  return TERMINAL_TPV_ORDER_STATUSES.has(s);
}

/** true = cuenta como pedido activo de mesa (incluye status vacío/null). */
export function isActiveTpvOrderStatus(status: unknown): boolean {
  return !isTerminalTpvOrderStatus(status);
}
