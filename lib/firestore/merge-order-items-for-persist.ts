/**
 * Merge seguro al persistir borrador TPV: los estados de producción son monotónicos
 * y nunca pueden retroceder por un write del cliente.
 */

export type ProductionLineStatus =
  | "pending"
  | "sent"
  | "preparing"
  | "prepared"
  | "served"
  | "cancelled";

/** Orden: pending → sent → preparing → prepared → served. `cancelled` es terminal. */
export function productionLineStatusRank(status: unknown): number {
  switch (normalizeProductionLineStatus(status)) {
    case "pending":
      return 0;
    case "sent":
      return 1;
    case "preparing":
      return 2;
    case "prepared":
      return 3;
    case "served":
      return 4;
    case "cancelled":
      return 100;
    default:
      return 0;
  }
}

export function normalizeProductionLineStatus(
  raw: unknown,
): ProductionLineStatus {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "pending" || s === "new" || s === "") return "pending";
  if (s === "sent") return "sent";
  if (s === "preparing") return "preparing";
  if (s === "prepared" || s === "ready") return "prepared";
  if (s === "served") return "served";
  if (s === "cancelled" || s === "canceled" || s === "cancelado") {
    return "cancelled";
  }
  return "pending";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function resolvePersistOrderLineId(
  item: Record<string, unknown>,
): string {
  return typeof item.id === "string" ? item.id.trim() : "";
}

const PRODUCTION_SNAPSHOT_KEYS = [
  "status",
  "sentAt",
  "preparedAt",
  "servedAt",
  "cancelledAt",
  "cancelledBy",
  "qty",
  "quantity",
  "total",
  "updatedAt",
  "orderItemDocId",
] as const;

function pickProductionSnapshot(
  item: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PRODUCTION_SNAPSHOT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(item, key)) {
      out[key] = item[key];
    }
  }
  return out;
}

function mergeLineForPersist(
  local: Record<string, unknown>,
  server: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!server) return { ...local };

  const localRank = productionLineStatusRank(local.status);
  const serverRank = productionLineStatusRank(server.status);

  if (serverRank > localRank) {
    return {
      ...local,
      ...pickProductionSnapshot(server),
    };
  }

  return { ...local };
}

/**
 * Fusiona ítems locales con `orders.items` en Firestore antes de persistir borrador.
 * - Líneas nuevas en local (p. ej. bebida pending) se añaden.
 * - Líneas solo en servidor con estado de producción (sent+) se conservan.
 * - Líneas pending solo en servidor omitidas en local se tratan como borradas.
 * - Por `id`, gana el estado de producción más avanzado.
 */
export function mergeOrderItemsForPersist(
  serverItems: unknown,
  localItems: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const serverArr = Array.isArray(serverItems)
    ? serverItems.filter(isRecord)
    : [];

  const serverById = new Map<string, Record<string, unknown>>();
  for (const row of serverArr) {
    const id = resolvePersistOrderLineId(row);
    if (id) serverById.set(id, row);
  }

  const localIds = new Set<string>();
  const merged: Record<string, unknown>[] = [];

  for (const local of localItems) {
    const id = resolvePersistOrderLineId(local);
    if (id) localIds.add(id);
    merged.push(mergeLineForPersist(local, id ? serverById.get(id) : undefined));
  }

  for (const row of serverArr) {
    const id = resolvePersistOrderLineId(row);
    if (id && !localIds.has(id)) {
      // Borrador TPV: una línea pending omitida en local fue eliminada a propósito.
      // Solo conservamos en servidor líneas que ya salieron del bucket draft.
      if (normalizeProductionLineStatus(row.status) === "pending") continue;
      merged.push({ ...row });
    }
  }

  return merged;
}

/**
 * Líneas que pueden pasar por sync de borrador (`persist-draft`).
 * Excluye enviadas / preparación / servidas / canceladas para no degradar
 * producción ni provocar conflictos al incluir lineIds ya autoritativos.
 */
export function selectDraftPersistableFirestoreItems(
  items: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return items.filter(
    (item) => normalizeProductionLineStatus(item.status) === "pending",
  );
}

/** Total facturable tras merge (líneas no canceladas con cantidad > 0). */
export function computeBillableTotalFromPersistItems(
  items: readonly Record<string, unknown>[],
): number {
  let sum = 0;
  for (const it of items) {
    if (normalizeProductionLineStatus(it.status) === "cancelled") continue;
    const q = Number(it.quantity ?? it.qty) || 0;
    if (q <= 0) continue;
    const lineTotal = Number(it.total);
    if (Number.isFinite(lineTotal)) {
      sum += lineTotal;
      continue;
    }
    const price = Number(it.price ?? it.precio) || 0;
    sum += q * price;
  }
  return Math.max(0, sum);
}
