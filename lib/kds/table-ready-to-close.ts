/** Línea mínima para evaluar si una mesa puede cerrarse operativamente. */
export type TableReadyToCloseLine = {
  status?: string;
};

export type TableReadyToCloseOrder = {
  status?: string;
  tableId?: string | null;
  table?: string | null;
  items: TableReadyToCloseLine[];
};

const TERMINAL_ORDER_STATUSES = new Set([
  "closed",
  "paid",
  "cancelled",
  "canceled",
  "merged",
]);

function normalizeStatus(raw: string | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Misma clave de mesa que Sala KDS y mapa TPV cuando hay `tableId`. */
export function resolveTableReadyToCloseKey(order: {
  tableId?: string | null;
  table?: string | null;
}): string {
  const tableLabel =
    (order.table && order.table.trim()) ||
    (order.tableId ? `Mesa ${order.tableId}` : "Sin mesa");
  return order.tableId?.trim() || tableLabel;
}

export function isActiveOrderForReadyToClose(status: string | undefined): boolean {
  if (!status) return true;
  return !TERMINAL_ORDER_STATUSES.has(normalizeStatus(status));
}

/**
 * Una línea bloquea el cierre si el servicio de esa línea no ha terminado:
 * pending (incl. por marchar), sent, preparing, prepared/ready.
 */
export function isOrderItemBlockingReadyToClose(
  status: string | undefined,
): boolean {
  const normalized = normalizeStatus(status);
  if (
    normalized === "served" ||
    normalized === "cancelled" ||
    normalized === "canceled"
  ) {
    return false;
  }
  return true;
}

/** Pedido activo sin líneas bloqueantes → servicio de comanda terminado. */
export function isOrderReadyToClose(order: TableReadyToCloseOrder): boolean {
  if (!isActiveOrderForReadyToClose(order.status)) return false;
  if (!Array.isArray(order.items) || order.items.length === 0) return false;
  return !order.items.some((item) =>
    isOrderItemBlockingReadyToClose(item.status),
  );
}

/**
 * Mesas cuya comanda activa no tiene ninguna línea operativa pendiente.
 * Responde: «¿Ha terminado completamente el servicio de comanda?»
 * Si hay varios pedidos activos en la misma mesa, todos deben estar completos.
 */
export function computeTablesReadyToClose(
  orders: TableReadyToCloseOrder[],
  options?: {
    matchesOrder?: (order: TableReadyToCloseOrder) => boolean;
  },
): Set<string> {
  const matchesOrder = options?.matchesOrder ?? (() => true);
  const blockingByTable = new Map<string, boolean>();

  for (const order of orders) {
    if (!isActiveOrderForReadyToClose(order.status)) continue;
    if (!matchesOrder(order)) continue;

    const tableKey = resolveTableReadyToCloseKey(order);
    if (!Array.isArray(order.items) || order.items.length === 0) continue;
    const hasBlocking = order.items.some((item) =>
      isOrderItemBlockingReadyToClose(item.status),
    );

    if (hasBlocking) {
      blockingByTable.set(tableKey, true);
    } else if (!blockingByTable.has(tableKey)) {
      blockingByTable.set(tableKey, false);
    }
  }

  const ready = new Set<string>();
  for (const [tableKey, hasBlocking] of blockingByTable) {
    if (!hasBlocking) ready.add(tableKey);
  }
  return ready;
}
