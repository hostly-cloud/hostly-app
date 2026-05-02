import { Timestamp } from "firebase/firestore";

/**
 * Órdenes de comanda en Firestore (`orders`): decide si el documento cuenta como
 * “mesa ocupada” en el mapa TPV. Solo se usa `order.tableId` (id de mesa), nunca el nombre.
 */

const TERMINAL_ORDER_STATUSES = new Set([
  "closed",
  "paid",
  "cancelled",
  "canceled",
  "cancelado",
]);

export function isOrderStatusActiveForTableOccupancy(
  status: string | undefined | null,
): boolean {
  if (status == null) return true;
  const s = String(status).trim().toLowerCase();
  if (s === "") return true;
  return !TERMINAL_ORDER_STATUSES.has(s);
}

export type OrderOccupancyRow = {
  tableId?: string | null;
  status?: string | undefined | null;
  createdAt?: unknown;
  /** Si existe, tiene prioridad sobre `createdAt` para “cuándo se abrió” la comanda. */
  openedAt?: unknown;
};

/** `orders.createdAt` en número (ms) o Firestore Timestamp / fecha. */
export function readOrderCreatedAtMs(createdAt: unknown): number | undefined {
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) return createdAt;
  if (createdAt instanceof Timestamp) return createdAt.toMillis();
  if (
    createdAt &&
    typeof createdAt === "object" &&
    "toDate" in createdAt &&
    typeof (createdAt as { toDate: () => Date }).toDate === "function"
  ) {
    return (createdAt as { toDate: () => Date }).toDate().getTime();
  }
  return undefined;
}

export type MapOccupancyFromOrders = {
  occupiedTableIds: Set<string>;
  /** Por `table.id`: instante de la order activa más antigua (`createdAt` mínimo). */
  oldestActiveCreatedAtMsByTableId: Record<string, number>;
};

/**
 * A partir del snapshot de `orders`, mesas ocupadas y referencia temporal
 * para el tiempo de ocupación (order activa más antigua por mesa).
 */
export function mapOccupancyFromOrderRows(
  rows: OrderOccupancyRow[],
): MapOccupancyFromOrders {
  const occupiedTableIds = new Set<string>();
  const oldestActiveCreatedAtMsByTableId: Record<string, number> = {};

  for (const row of rows) {
    if (!isOrderStatusActiveForTableOccupancy(row.status ?? undefined)) continue;
    const raw = row.tableId;
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    occupiedTableIds.add(id);
    const openedMs = readOrderCreatedAtMs(row.openedAt);
    const createdMs = readOrderCreatedAtMs(row.createdAt);
    const ms = openedMs ?? createdMs;
    if (ms == null) continue;
    const prev = oldestActiveCreatedAtMsByTableId[id];
    if (prev == null || ms < prev) oldestActiveCreatedAtMsByTableId[id] = ms;
  }

  return { occupiedTableIds, oldestActiveCreatedAtMsByTableId };
}

/**
 * Devuelve los `table.id` con al menos una order activa (no terminal).
 */
export function occupiedTableIdsFromOrderRows(
  rows: OrderOccupancyRow[],
): Set<string> {
  return mapOccupancyFromOrderRows(rows).occupiedTableIds;
}
