import {
  mergeOrderItemsForPersist,
  resolvePersistOrderLineId,
} from "@/lib/firestore/merge-order-items-for-persist";

export type SyncableLineProduction = {
  id: string;
  status: string;
  sentAt?: number;
  preparedAt?: number;
  servedAt?: number;
  cancelledAt?: number;
  cancelledBy?: string | null;
  orderItemDocId?: string;
};

function readOptionalMs(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export function pickProductionFieldsFromFirestoreRow(
  row: Record<string, unknown>,
): Omit<SyncableLineProduction, "id"> {
  const orderItemDocIdRaw = row.orderItemDocId;
  return {
    status: String(row.status ?? "pending").trim().toLowerCase() || "pending",
    ...(readOptionalMs(row.sentAt) != null
      ? { sentAt: readOptionalMs(row.sentAt) }
      : {}),
    ...(readOptionalMs(row.preparedAt) != null
      ? { preparedAt: readOptionalMs(row.preparedAt) }
      : {}),
    ...(readOptionalMs(row.servedAt) != null
      ? { servedAt: readOptionalMs(row.servedAt) }
      : {}),
    ...(readOptionalMs(row.cancelledAt) != null
      ? { cancelledAt: readOptionalMs(row.cancelledAt) }
      : {}),
    ...(typeof row.cancelledBy === "string"
      ? { cancelledBy: row.cancelledBy }
      : {}),
    ...(typeof orderItemDocIdRaw === "string" && orderItemDocIdRaw.trim()
      ? { orderItemDocId: orderItemDocIdRaw.trim() }
      : {}),
  };
}

export function applyProductionFieldsToLine<T extends SyncableLineProduction>(
  line: T,
  row: Record<string, unknown>,
  normalizeStatus: (raw: unknown) => T["status"],
): T {
  const prod = pickProductionFieldsFromFirestoreRow(row);
  return {
    ...line,
    status: normalizeStatus(prod.status),
    ...(prod.sentAt != null ? { sentAt: prod.sentAt } : {}),
    ...(prod.preparedAt != null ? { preparedAt: prod.preparedAt } : {}),
    ...(prod.servedAt != null ? { servedAt: prod.servedAt } : {}),
    ...(prod.cancelledAt != null ? { cancelledAt: prod.cancelledAt } : {}),
    ...(prod.cancelledBy != null ? { cancelledBy: prod.cancelledBy } : {}),
    ...(prod.orderItemDocId != null
      ? { orderItemDocId: prod.orderItemDocId }
      : {}),
  };
}

/**
 * Fusiona estados de producción del servidor en líneas locales TPV sin pisar
 * campos de carrito (cantidad, modificadores, notas). Reutiliza merge monotónico
 * de `mergeOrderItemsForPersist`.
 */
export function mergeLocalLinesProductionFromServerItems<
  T extends SyncableLineProduction,
>(
  localLines: readonly T[],
  serverItems: unknown,
  toFirestoreItem: (line: T) => Record<string, unknown>,
  normalizeStatus: (raw: unknown) => T["status"],
): T[] {
  const localFs = localLines.map(toFirestoreItem);
  const mergedFs = mergeOrderItemsForPersist(serverItems, localFs);
  const mergedById = new Map<string, Record<string, unknown>>();
  for (const row of mergedFs) {
    const id = resolvePersistOrderLineId(row);
    if (id) mergedById.set(id, row);
  }
  return localLines.map((line) => {
    const row = mergedById.get(line.id);
    if (!row) return line;
    return applyProductionFieldsToLine(line, row, normalizeStatus);
  });
}

export function cartLinesProductionSnapshotEqual<
  T extends SyncableLineProduction,
>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (left.id !== right.id) return false;
    if (left.status !== right.status) return false;
    if (left.sentAt !== right.sentAt) return false;
    if (left.preparedAt !== right.preparedAt) return false;
    if (left.servedAt !== right.servedAt) return false;
    if (left.cancelledAt !== right.cancelledAt) return false;
    if ((left.cancelledBy ?? null) !== (right.cancelledBy ?? null)) return false;
    if ((left.orderItemDocId ?? null) !== (right.orderItemDocId ?? null)) {
      return false;
    }
  }
  return true;
}
