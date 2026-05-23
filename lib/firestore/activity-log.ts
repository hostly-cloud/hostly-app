import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import {
  dbgAddDoc,
  dbgSetDoc,
  type FsWriteDebugContext,
} from "@/lib/firestore/instrumentedWrites";
import {
  getRuntimeSessionContext,
  isRuntimeSessionAvailable,
} from "@/lib/client/runtime-session";

export type ActivityLogType =
  | "order_created"
  | "order_updated"
  | "order_cancelled"
  | "payment_created"
  | "payment_refunded"
  | "stock_adjusted"
  | "purchase_order_created"
  | "purchase_received"
  | "supplier_invoice_recorded"
  | "user_login"
  | "user_logout"
  | "session_online"
  | "session_offline"
  | "session_reconnect"
  | "role_changed"
  | "table_joined"
  | "table_separated";

export type ActivityLogEntityType =
  | "order"
  | "payment"
  | "product"
  | "purchaseOrder"
  | "supplierInvoice"
  | "table"
  | "user";

export type ActivityLogDocument = {
  id: string;
  restaurantId: string;
  type: ActivityLogType;
  entityType: ActivityLogEntityType;
  entityId: string;
  actorUserId?: string;
  actorUserName?: string;
  actorRole?: string;
  deviceId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
};

export type ActivityLogCategory = "tpv" | "inventory" | "purchases" | "users";

export type CreateActivityLogParams = {
  restaurantId: string;
  type: ActivityLogType;
  entityType: ActivityLogEntityType;
  entityId: string;
  actorUserId?: string;
  actorUserName?: string;
  actorRole?: string;
  deviceId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  /** Si se indica, el doc usa este id y no se duplica si ya existe. */
  idempotencyKey?: string;
  route?: string;
};

const METADATA_MAX_KEYS = 32;
const METADATA_MAX_STRING = 500;
const METADATA_MAX_DEPTH = 3;

const TPV_TYPES = new Set<ActivityLogType>([
  "order_created",
  "order_updated",
  "order_cancelled",
  "payment_created",
  "payment_refunded",
  "table_joined",
  "table_separated",
]);

const INVENTORY_TYPES = new Set<ActivityLogType>(["stock_adjusted"]);

const PURCHASES_TYPES = new Set<ActivityLogType>([
  "purchase_order_created",
  "purchase_received",
  "supplier_invoice_recorded",
]);

const USERS_TYPES = new Set<ActivityLogType>([
  "user_login",
  "user_logout",
  "session_online",
  "session_offline",
  "session_reconnect",
  "role_changed",
]);

export function activityLogsCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "activityLogs");
}

export function activityLogDocRef(restaurantId: string, logId: string) {
  return doc(activityLogsCollectionRef(restaurantId), logId.trim());
}

function authUidOrUndefined(): string | undefined {
  const uid = auth.currentUser?.uid?.trim();
  return uid || undefined;
}

function readTrimmedString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function sanitizeIdempotencyKey(key: string): string {
  return key.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function isFirestoreIndexError(error: unknown): boolean {
  const code =
    typeof error === "object" &&
    error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? String((error as { code: string }).code)
      : "";
  return code === "failed-precondition";
}

function sanitizeMetadataValue(
  value: unknown,
  depth: number,
): unknown | undefined {
  if (depth > METADATA_MAX_DEPTH) return undefined;
  if (value == null) return value;
  if (typeof value === "string") {
    return value.slice(0, METADATA_MAX_STRING);
  }
  if (
    typeof value === "number" &&
    (Number.isFinite(value) || value === 0)
  ) {
    return value;
  }
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, METADATA_MAX_KEYS)
      .map((item) => sanitizeMetadataValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (count >= METADATA_MAX_KEYS) break;
      const safeKey = readTrimmedString(key, 64);
      if (!safeKey) continue;
      const safeValue = sanitizeMetadataValue(nested, depth + 1);
      if (safeValue === undefined) continue;
      out[safeKey] = safeValue;
      count += 1;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return undefined;
}

/** Limpia metadata antes de persistir (tamaño, profundidad, tipos primitivos). */
export function sanitizeActivityMetadata(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const sanitized = sanitizeMetadataValue(raw, 0);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return undefined;
  }
  return sanitized as Record<string, unknown>;
}

/** Construye metadata operacional segura a partir de pares conocidos. */
export function buildActivityMetadata(
  fields: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return sanitizeActivityMetadata(fields);
}

export function normalizeActivityLogDocument(
  logId: string,
  raw: unknown,
  restaurantId: string,
): ActivityLogDocument | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const rid = readTrimmedString(data.restaurantId, 120) ?? restaurantId.trim();
  if (!rid) return null;

  const type = readTrimmedString(data.type, 64) as ActivityLogType | undefined;
  const entityType = readTrimmedString(data.entityType, 64) as
    | ActivityLogEntityType
    | undefined;
  const entityId = readTrimmedString(data.entityId, 200);
  const createdAtRaw = data.createdAt;
  const createdAt =
    typeof createdAtRaw === "number" && Number.isFinite(createdAtRaw)
      ? createdAtRaw
      : Date.now();

  if (!type || !entityType || !entityId) return null;

  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? sanitizeActivityMetadata(data.metadata as Record<string, unknown>)
      : undefined;

  return {
    id: logId.trim(),
    restaurantId: rid,
    type,
    entityType,
    entityId,
    ...(readTrimmedString(data.actorUserId, 120)
      ? { actorUserId: readTrimmedString(data.actorUserId, 120) }
      : {}),
    ...(readTrimmedString(data.actorUserName, 200)
      ? { actorUserName: readTrimmedString(data.actorUserName, 200) }
      : {}),
    ...(readTrimmedString(data.actorRole, 40)
      ? { actorRole: readTrimmedString(data.actorRole, 40) }
      : {}),
    ...(readTrimmedString(data.deviceId, 120)
      ? { deviceId: readTrimmedString(data.deviceId, 120) }
      : {}),
    ...(readTrimmedString(data.sessionId, 120)
      ? { sessionId: readTrimmedString(data.sessionId, 120) }
      : {}),
    ...(metadata ? { metadata } : {}),
    createdAt,
  };
}

export function activityLogCategory(type: ActivityLogType): ActivityLogCategory {
  if (TPV_TYPES.has(type)) return "tpv";
  if (INVENTORY_TYPES.has(type)) return "inventory";
  if (PURCHASES_TYPES.has(type)) return "purchases";
  if (USERS_TYPES.has(type)) return "users";
  return "tpv";
}

export function activityLogTypeLabel(type: ActivityLogType): string {
  switch (type) {
    case "order_created":
      return "Comanda creada";
    case "order_updated":
      return "Comanda actualizada";
    case "order_cancelled":
      return "Comanda cancelada";
    case "payment_created":
      return "Cobro registrado";
    case "payment_refunded":
      return "Devolución";
    case "stock_adjusted":
      return "Stock ajustado";
    case "purchase_order_created":
      return "Pedido de compra";
    case "purchase_received":
      return "Recepción de compra";
    case "supplier_invoice_recorded":
      return "Factura registrada";
    case "user_login":
      return "Inicio de sesión";
    case "user_logout":
      return "Cierre de sesión";
    case "session_online":
      return "Sesión online";
    case "session_offline":
      return "Sesión offline";
    case "session_reconnect":
      return "Sesión reconectada";
    case "role_changed":
      return "Rol cambiado";
    case "table_joined":
      return "Mesas unidas";
    case "table_separated":
      return "Mesa separada";
    default:
      return type;
  }
}

export type ListenActivityLogsOptions = {
  limit?: number;
  onError?: (error: unknown) => void;
  onFallback?: () => void;
};

export function listenActivityLogs(
  restaurantId: string,
  onData: (logs: ActivityLogDocument[]) => void,
  options?: ListenActivityLogsOptions,
): Unsubscribe {
  const rid = restaurantId.trim();
  const lim = Math.min(Math.max(options?.limit ?? 80, 1), 200);
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const col = activityLogsCollectionRef(rid);
  let fallbackActive = false;
  let innerUnsub: Unsubscribe | null = null;

  const emitSorted = (docs: ActivityLogDocument[]) => {
    const sorted = [...docs].sort((a, b) => b.createdAt - a.createdAt);
    onData(sorted.slice(0, lim));
  };

  const mapSnapshot = (snap: { docs: Array<{ id: string; data: () => unknown }> }) => {
    const items: ActivityLogDocument[] = [];
    for (const docSnap of snap.docs) {
      const parsed = normalizeActivityLogDocument(docSnap.id, docSnap.data(), rid);
      if (parsed) items.push(parsed);
    }
    emitSorted(items);
  };

  const attachFallback = () => {
    if (fallbackActive) return;
    fallbackActive = true;
    options?.onFallback?.();
    innerUnsub?.();
    innerUnsub = onSnapshot(
      col,
      (snap) => mapSnapshot(snap),
      (error) => {
        console.error("[Hostly ActivityLog] listen fallback", error);
        options?.onError?.(error);
        onData([]);
      },
    );
  };

  innerUnsub = onSnapshot(
    query(col, orderBy("createdAt", "desc"), limit(lim)),
    (snap) => mapSnapshot(snap),
    (error) => {
      if (isFirestoreIndexError(error)) {
        attachFallback();
        return;
      }
      console.error("[Hostly ActivityLog] listen", error);
      options?.onError?.(error);
      onData([]);
    },
  );

  return () => {
    innerUnsub?.();
  };
}

/**
 * Append-only activity log. Fallos no relanzan para no bloquear operaciones TPV.
 */
export async function createActivityLog(
  params: CreateActivityLogParams,
): Promise<string | null> {
  const rid = params.restaurantId.trim();
  const entityId = params.entityId.trim();
  if (!rid || !entityId || !isAuthReady()) return null;

  const uid = params.actorUserId?.trim() || authUidOrUndefined();
  const metadata = sanitizeActivityMetadata(params.metadata);
  const createdAt = Date.now();

  let deviceId = params.deviceId?.trim();
  let sessionId = params.sessionId?.trim();
  if (isRuntimeSessionAvailable() && (!deviceId || !sessionId)) {
    const runtime = getRuntimeSessionContext();
    if (!deviceId && runtime.deviceId !== "ssr-device") {
      deviceId = runtime.deviceId;
    }
    if (!sessionId && runtime.sessionId !== "ssr-session") {
      sessionId = runtime.sessionId;
    }
  }

  const payload: Record<string, unknown> = {
    restaurantId: rid,
    type: params.type,
    entityType: params.entityType,
    entityId,
    createdAt,
    ...(uid ? { actorUserId: uid } : {}),
    ...(params.actorUserName?.trim()
      ? { actorUserName: params.actorUserName.trim().slice(0, 200) }
      : {}),
    ...(params.actorRole?.trim()
      ? { actorRole: params.actorRole.trim().slice(0, 40) }
      : {}),
    ...(deviceId ? { deviceId: deviceId.slice(0, 120) } : {}),
    ...(sessionId ? { sessionId: sessionId.slice(0, 120) } : {}),
    ...(metadata ? { metadata } : {}),
  };

  const ctx: FsWriteDebugContext = {
    label: `activityLog:${params.type}`,
    collection: "activityLogs",
    restaurantId: rid,
  };

  try {
    const idempotencyKey = params.idempotencyKey?.trim();
    if (idempotencyKey) {
      const docId = sanitizeIdempotencyKey(idempotencyKey);
      const ref = activityLogDocRef(rid, docId);
      const existing = await getDoc(ref);
      if (existing.exists()) return ref.id;
      await dbgSetDoc(ref, payload, ctx);
      return ref.id;
    }

    const ref = await dbgAddDoc(activityLogsCollectionRef(rid), payload, ctx);
    return ref.id;
  } catch (error) {
    console.warn("[Hostly ActivityLog] create failed", params.type, error);
    return null;
  }
}
