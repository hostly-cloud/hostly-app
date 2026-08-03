/**
 * Ownership server-side de pedido activo por mesa (Admin SDK).
 *
 * Colección: restaurants/{restaurantId}/tableOrderLocks/{docId}
 * Propietario: orderId activo. Liberación: orderId = null.
 *
 * Política de caducidad equivalente (sin lease temporal agresivo):
 * - create-open repara locks huérfanos o con pedido terminal;
 * - close/finalize liberan solo si el caller es propietario o la mesa queda sin activos;
 * - no hay writers cliente; Rules de orders/orderItems no se tocan.
 */
import { createHash } from "node:crypto";
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { isActiveOrderStatus } from "@/lib/server/tpv/table-group-order-utils";

export type TableOrderLockDocument = {
  restaurantId: string;
  tableId: string;
  /** orderId activo, o null si la mesa está libre. */
  orderId: string | null;
  /** Actor que reclamó por última vez (uid Auth). */
  claimedByUid?: string | null;
  /** Operación server que reclamó/liberó (create_open, close_order, merge, split…). */
  lastOperation?: string | null;
  /** Idempotency / operation key del último claim (si existía). */
  lastClaimKey?: string | null;
  createdAt?: FieldValue;
  updatedAt?: FieldValue;
};

export type TableOrderLockIntegrityError = {
  code: "LOCK_TENANT_MISMATCH" | "LOCK_TABLE_MISMATCH";
  details?: string;
};

export type TableOrderLockClaimMeta = {
  claimedByUid?: string | null;
  lastOperation?: string | null;
  lastClaimKey?: string | null;
};

/** Orden determinista para adquirir varios locks y evitar deadlocks. */
export function sortTableIdsForLockAcquisition(tableIds: readonly string[]): string[] {
  return [...new Set(tableIds.map((id) => id.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** ID de documento Firestore seguro y determinista para tableId. */
export function tableOrderLockDocumentId(tableId: string): string {
  const tid = tableId.trim();
  if (!tid) return "";
  if (/^[A-Za-z0-9_-]{1,700}$/.test(tid)) return tid;
  return createHash("sha256").update(`tableOrderLock\0${tid}`, "utf8").digest("hex");
}

export function tableOrderLockRef(
  db: Firestore,
  restaurantId: string,
  tableId: string,
): DocumentReference {
  const rid = restaurantId.trim();
  const tid = tableId.trim();
  if (!rid || !tid) {
    throw new Error("TABLE_ORDER_LOCK_IDS_REQUIRED");
  }
  const docId = tableOrderLockDocumentId(tid);
  return db.collection("restaurants").doc(rid).collection("tableOrderLocks").doc(docId);
}

export function readTableOrderLockData(
  snap: { exists: boolean; data: () => Record<string, unknown> | undefined },
): TableOrderLockDocument | null {
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  const restaurantId = typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  const tableId = typeof data.tableId === "string" ? data.tableId.trim() : "";
  const rawOrderId = data.orderId;
  const orderId =
    typeof rawOrderId === "string" && rawOrderId.trim()
      ? rawOrderId.trim()
      : null;
  if (!restaurantId || !tableId) return null;
  return {
    restaurantId,
    tableId,
    orderId,
    claimedByUid:
      typeof data.claimedByUid === "string" ? data.claimedByUid.trim() || null : null,
    lastOperation:
      typeof data.lastOperation === "string" ? data.lastOperation.trim() || null : null,
    lastClaimKey:
      typeof data.lastClaimKey === "string" ? data.lastClaimKey.trim() || null : null,
  };
}

export function assertTableOrderLockIntegrity(
  lock: TableOrderLockDocument,
  restaurantId: string,
  tableId: string,
): TableOrderLockIntegrityError | null {
  if (lock.restaurantId !== restaurantId.trim()) {
    return { code: "LOCK_TENANT_MISMATCH", details: lock.restaurantId };
  }
  if (lock.tableId !== tableId.trim()) {
    return { code: "LOCK_TABLE_MISMATCH", details: lock.tableId };
  }
  return null;
}

export type TableOrderLockOwnershipErrorCode =
  | "TABLE_ORDER_LOCK_CONFLICT"
  | "LOCK_TENANT_MISMATCH"
  | "LOCK_TABLE_MISMATCH";

/**
 * Ownership de mesa para mutaciones sobre pedido existente (upsert/persist).
 * No reclama ni libera: exige lock presente y orderId propietario.
 */
export function assertTableOrderLockOwner(
  lock: TableOrderLockDocument | null,
  params: { restaurantId: string; tableId: string; orderId: string },
): TableOrderLockOwnershipErrorCode | null {
  if (!lock) return "TABLE_ORDER_LOCK_CONFLICT";
  const integrity = assertTableOrderLockIntegrity(
    lock,
    params.restaurantId,
    params.tableId,
  );
  if (integrity) return integrity.code;
  const lockedOrderId = lock.orderId?.trim() || "";
  if (!lockedOrderId || lockedOrderId !== params.orderId.trim()) {
    return "TABLE_ORDER_LOCK_CONFLICT";
  }
  return null;
}

export function writeTableOrderLockClaim(
  tx: Transaction,
  ref: DocumentReference,
  params: {
    restaurantId: string;
    tableId: string;
    orderId: string;
    create: boolean;
  } & TableOrderLockClaimMeta,
): void {
  const payload: Record<string, unknown> = {
    restaurantId: params.restaurantId.trim(),
    tableId: params.tableId.trim(),
    orderId: params.orderId.trim(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (params.claimedByUid !== undefined) {
    payload.claimedByUid = params.claimedByUid?.trim() || null;
  }
  if (params.lastOperation !== undefined) {
    payload.lastOperation = params.lastOperation?.trim() || null;
  }
  if (params.lastClaimKey !== undefined) {
    payload.lastClaimKey = params.lastClaimKey?.trim() || null;
  }
  if (params.create) {
    payload.createdAt = FieldValue.serverTimestamp();
    tx.set(ref, payload);
  } else {
    tx.set(ref, payload, { merge: true });
  }
}

export function writeTableOrderLockRelease(
  tx: Transaction,
  ref: DocumentReference,
  params: { restaurantId: string; tableId: string } & TableOrderLockClaimMeta,
): void {
  const payload: Record<string, unknown> = {
    restaurantId: params.restaurantId.trim(),
    tableId: params.tableId.trim(),
    orderId: null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (params.claimedByUid !== undefined) {
    payload.claimedByUid = params.claimedByUid?.trim() || null;
  }
  if (params.lastOperation !== undefined) {
    payload.lastOperation = params.lastOperation?.trim() || null;
  }
  if (params.lastClaimKey !== undefined) {
    payload.lastClaimKey = params.lastClaimKey?.trim() || null;
  }
  tx.set(ref, payload, { merge: true });
}

/**
 * Libera el lock solo si apunta a `orderId` (propietario).
 * No toca un lock ya reasignado a otro pedido.
 */
export function releaseTableOrderLockIfOwnerInTransaction(
  tx: Transaction,
  lockRef: DocumentReference,
  lockSnap: { exists: boolean; data: () => Record<string, unknown> | undefined },
  params: { restaurantId: string; tableId: string; orderId: string } & TableOrderLockClaimMeta,
): { released: boolean; reason?: string } {
  const lock = readTableOrderLockData(lockSnap);
  if (!lock) {
    writeTableOrderLockRelease(tx, lockRef, params);
    return { released: true, reason: "missing_lock_normalized" };
  }
  const integrity = assertTableOrderLockIntegrity(
    lock,
    params.restaurantId,
    params.tableId,
  );
  if (integrity) {
    return { released: false, reason: integrity.code };
  }
  if (lock.orderId == null || lock.orderId === "") {
    return { released: true, reason: "already_free" };
  }
  if (lock.orderId !== params.orderId.trim()) {
    return { released: false, reason: "lock_owned_by_other_order" };
  }
  writeTableOrderLockRelease(tx, lockRef, params);
  return { released: true };
}

export type ActiveOrderDoc = {
  id: string;
  status: string;
  restaurantId: string;
  tableId: string;
};

/**
 * Filtra pedidos activos con el mismo criterio que merge/split/lifecycle de main
 * (`open` | `sent`).
 */
export function filterActiveOrdersForTable(
  docs: Array<{ id: string; data: () => Record<string, unknown> | undefined }>,
  restaurantId: string,
  tableId: string,
): ActiveOrderDoc[] {
  const rid = restaurantId.trim();
  const tid = tableId.trim();
  const out: ActiveOrderDoc[] = [];
  for (const doc of docs) {
    const data = doc.data() ?? {};
    if (String(data.restaurantId ?? "").trim() !== rid) continue;
    if (String(data.tableId ?? "").trim() !== tid) continue;
    if (!isActiveOrderStatus(data.status)) continue;
    out.push({
      id: doc.id,
      status: String(data.status ?? ""),
      restaurantId: rid,
      tableId: tid,
    });
  }
  return out;
}
