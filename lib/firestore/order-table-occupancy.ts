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

/** `orders.updatedAt` en número (ms) o Firestore Timestamp / fecha. */
export function readOrderUpdatedAtMs(updatedAt: unknown): number | undefined {
  if (typeof updatedAt === "number" && Number.isFinite(updatedAt))
    return updatedAt;
  if (updatedAt instanceof Timestamp) return updatedAt.toMillis();
  if (
    updatedAt &&
    typeof updatedAt === "object" &&
    "toDate" in updatedAt &&
    typeof (updatedAt as { toDate?: () => Date }).toDate === "function"
  ) {
    return (updatedAt as { toDate: () => Date }).toDate().getTime();
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

/** Línea de pedido con cantidad > 0 y no cancelada → cuenta para “mesa ocupada” en mapa. */
export function isFirestoreOrderLineActiveForOccupancy(
  it: Record<string, unknown>,
): boolean {
  const st = String(it.status ?? "")
    .trim()
    .toLowerCase();
  if (
    st === "cancelled" ||
    st === "canceled" ||
    st === "cancelado"
  ) {
    return false;
  }
  const q = Number(it.quantity ?? it.qty) || 0;
  return q > 0;
}

/**
 * Total mostrado en mapa: solo líneas no canceladas con cantidad > 0.
 * Si el documento no trae `items`, se usa `total` (órdenes legacy sin ítems).
 * No usa `total` del documento cuando existe `items` (evita importe obsoleto).
 */
export function computeBillableTotalFromOrderDocLike(data: {
  total?: unknown;
  items?: unknown;
}): number {
  if (!Array.isArray(data.items)) {
    const t = data.total;
    if (typeof t === "number" && Number.isFinite(t)) return Math.max(0, t);
    return 0;
  }
  let sum = 0;
  for (const raw of data.items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    if (!isFirestoreOrderLineActiveForOccupancy(it)) continue;
    if (typeof it.total === "number" && Number.isFinite(it.total)) {
      sum += it.total;
      continue;
    }
    const q = Number(it.quantity ?? it.qty) || 0;
    const p = Number(it.price ?? it.precio) || 0;
    sum += q * p;
  }
  return sum;
}

/**
 * Documento de pedido “ocupa mesa” si el estado es activo y hay líneas reales o total legacy.
 */
export function orderDocHasActiveLinesForMapOccupancy(data: {
  status?: unknown;
  items?: unknown;
  total?: unknown;
}): boolean {
  if (
    !isOrderStatusActiveForTableOccupancy(
      typeof data.status === "string" ? data.status : undefined,
    )
  ) {
    return false;
  }
  if (Array.isArray(data.items)) {
    for (const raw of data.items) {
      if (!raw || typeof raw !== "object") continue;
      if (isFirestoreOrderLineActiveForOccupancy(raw as Record<string, unknown>)) {
        return true;
      }
    }
    return false;
  }
  const t = data.total;
  return typeof t === "number" && Number.isFinite(t) && t > 0;
}
