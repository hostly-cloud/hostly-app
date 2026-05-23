import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { dbgSetDoc, type FsWriteDebugContext } from "@/lib/firestore/instrumentedWrites";

export const TABLE_PRESENCE_HEARTBEAT_MS = 15_000;
export const TABLE_PRESENCE_STALE_MS = 45_000;
export const TABLE_PRESENCE_CONCURRENT_MS = 15_000;

export type TablePresenceStatus = "active" | "idle";

export type TablePresenceDocument = {
  id: string;
  restaurantId: string;
  tableId: string;
  tableName?: string;
  sessionId: string;
  deviceId: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  route?: string;
  editingOrderId?: string;
  status: TablePresenceStatus;
  lastSeenAt: number;
  createdAt: number;
};

export type UpsertTablePresenceParams = {
  restaurantId: string;
  tableId: string;
  tableName?: string;
  sessionId: string;
  deviceId: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  route?: string;
  editingOrderId?: string;
  status?: TablePresenceStatus;
  isFirstWrite?: boolean;
};

export type ResolvedPresenceState = {
  activeOthers: TablePresenceDocument[];
  staleOthers: TablePresenceDocument[];
  hasConcurrentEdit: boolean;
  displayLabel: string | null;
  showConcurrentBadge: boolean;
};

function readTrimmedString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function sanitizeDocSegment(value: string): string {
  return value.trim().replace(/\//g, "_").slice(0, 120);
}

export function buildTablePresenceDocId(tableId: string, sessionId: string): string {
  return `${sanitizeDocSegment(tableId)}_${sanitizeDocSegment(sessionId)}`;
}

export function tablePresenceCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "tablePresence");
}

export function tablePresenceDocRef(
  restaurantId: string,
  tableId: string,
  sessionId: string,
) {
  return doc(
    tablePresenceCollectionRef(restaurantId),
    buildTablePresenceDocId(tableId, sessionId),
  );
}

export function normalizeTablePresenceDocument(
  docId: string,
  raw: unknown,
  restaurantId: string,
): TablePresenceDocument | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const rid = readTrimmedString(data.restaurantId, 120) ?? restaurantId.trim();
  const tableId = readTrimmedString(data.tableId, 120);
  const sessionId = readTrimmedString(data.sessionId, 120);
  const deviceId = readTrimmedString(data.deviceId, 120);
  const lastSeenAt = readFiniteNumber(data.lastSeenAt);
  const createdAt = readFiniteNumber(data.createdAt) ?? lastSeenAt ?? Date.now();
  if (!rid || !tableId || !sessionId || !deviceId || lastSeenAt == null) {
    return null;
  }

  const statusRaw = readTrimmedString(data.status, 16);
  const status: TablePresenceStatus =
    statusRaw === "idle" ? "idle" : "active";

  return {
    id: docId.trim(),
    restaurantId: rid,
    tableId,
    sessionId,
    deviceId,
    status,
    lastSeenAt,
    createdAt,
    ...(readTrimmedString(data.tableName, 200)
      ? { tableName: readTrimmedString(data.tableName, 200) }
      : {}),
    ...(readTrimmedString(data.userId, 120)
      ? { userId: readTrimmedString(data.userId, 120) }
      : {}),
    ...(readTrimmedString(data.userName, 200)
      ? { userName: readTrimmedString(data.userName, 200) }
      : {}),
    ...(readTrimmedString(data.userRole, 40)
      ? { userRole: readTrimmedString(data.userRole, 40) }
      : {}),
    ...(readTrimmedString(data.route, 120)
      ? { route: readTrimmedString(data.route, 120) }
      : {}),
    ...(readTrimmedString(data.editingOrderId, 200)
      ? { editingOrderId: readTrimmedString(data.editingOrderId, 200) }
      : {}),
  };
}

export function dedupePresenceBySession(
  entries: readonly TablePresenceDocument[],
): TablePresenceDocument[] {
  const bySession = new Map<string, TablePresenceDocument>();
  for (const entry of entries) {
    const sessionKey = entry.sessionId.trim();
    if (!sessionKey) continue;
    const prev = bySession.get(sessionKey);
    if (!prev || entry.lastSeenAt >= prev.lastSeenAt) {
      bySession.set(sessionKey, entry);
    }
  }
  return [...bySession.values()];
}

export function filterPresenceExcludingSelf(
  entries: readonly TablePresenceDocument[],
  selfSessionId: string,
): TablePresenceDocument[] {
  const self = selfSessionId.trim();
  return entries.filter((entry) => entry.sessionId.trim() !== self);
}

export function isPresenceActive(
  entry: TablePresenceDocument,
  nowMs: number = Date.now(),
): boolean {
  return nowMs - entry.lastSeenAt <= TABLE_PRESENCE_STALE_MS;
}

export function isPresenceRecent(
  entry: TablePresenceDocument,
  nowMs: number = Date.now(),
): boolean {
  return nowMs - entry.lastSeenAt <= TABLE_PRESENCE_CONCURRENT_MS;
}

export function buildPresenceDisplayLabel(params: {
  activeOthers: readonly TablePresenceDocument[];
  staleOthers: readonly TablePresenceDocument[];
  nowMs?: number;
}): string | null {
  const nowMs = params.nowMs ?? Date.now();
  const { activeOthers, staleOthers } = params;

  if (activeOthers.length === 1) {
    const entry = activeOthers[0]!;
    const name =
      entry.userName?.trim() ||
      entry.userId?.slice(0, 8) ||
      "Alguien";
    return `${name} está operando esta mesa`;
  }

  if (activeOthers.length > 1) {
    return `${activeOthers.length} personas operando`;
  }

  if (staleOthers.length > 0) {
    const latest = staleOthers.reduce((best, entry) =>
      entry.lastSeenAt > best.lastSeenAt ? entry : best,
    );
    const minutes = Math.max(
      1,
      Math.round((nowMs - latest.lastSeenAt) / 60_000),
    );
    return `Última actividad hace ${minutes} min`;
  }

  return null;
}

export function resolvePresenceState(
  entries: readonly TablePresenceDocument[],
  options: {
    selfSessionId: string;
    editingOrderId?: string | null;
    nowMs?: number;
  },
): ResolvedPresenceState {
  const nowMs = options.nowMs ?? Date.now();
  const deduped = dedupePresenceBySession([...entries]);
  const others = filterPresenceExcludingSelf(deduped, options.selfSessionId);
  const activeOthers = others.filter((entry) => isPresenceActive(entry, nowMs));
  const staleOthers = others.filter((entry) => !isPresenceActive(entry, nowMs));

  const orderId = options.editingOrderId?.trim() ?? "";
  let hasConcurrentEdit = false;
  if (orderId) {
    const recentSameOrder = deduped.filter(
      (entry) =>
        isPresenceRecent(entry, nowMs) &&
        entry.editingOrderId?.trim() === orderId,
    );
    const distinctSessions = new Set(
      recentSameOrder.map((entry) => entry.sessionId.trim()).filter(Boolean),
    );
    hasConcurrentEdit = distinctSessions.size >= 2;
  }

  const displayLabel = buildPresenceDisplayLabel({
    activeOthers,
    staleOthers,
    nowMs,
  });

  return {
    activeOthers,
    staleOthers,
    hasConcurrentEdit,
    displayLabel,
    showConcurrentBadge: hasConcurrentEdit,
  };
}

export async function upsertTablePresence(
  params: UpsertTablePresenceParams,
): Promise<void> {
  const rid = params.restaurantId.trim();
  const tableId = params.tableId.trim();
  const sessionId = params.sessionId.trim();
  const deviceId = params.deviceId.trim();
  if (!rid || !tableId || !sessionId || !deviceId || !isAuthReady()) return;

  const now = Date.now();
  const ref = tablePresenceDocRef(rid, tableId, sessionId);
  const payload: Record<string, unknown> = {
    restaurantId: rid,
    tableId,
    sessionId,
    deviceId,
    status: params.status ?? "active",
    lastSeenAt: now,
    ...(params.isFirstWrite ? { createdAt: now } : {}),
    ...(params.tableName?.trim() ? { tableName: params.tableName.trim().slice(0, 200) } : {}),
    ...(params.userId?.trim() ? { userId: params.userId.trim().slice(0, 120) } : {}),
    ...(params.userName?.trim() ? { userName: params.userName.trim().slice(0, 200) } : {}),
    ...(params.userRole?.trim() ? { userRole: params.userRole.trim().slice(0, 40) } : {}),
    ...(params.route?.trim() ? { route: params.route.trim().slice(0, 120) } : {}),
    ...(params.editingOrderId?.trim()
      ? { editingOrderId: params.editingOrderId.trim().slice(0, 200) }
      : {}),
  };

  const ctx: FsWriteDebugContext = {
    label: "tablePresence:upsert",
    collection: "tablePresence",
    restaurantId: rid,
    tableId,
  };

  try {
    await dbgSetDoc(ref, payload, ctx, { merge: true });
  } catch (error) {
    console.warn("[Hostly Presence] upsert failed", error);
  }
}

export async function removeTablePresence(
  restaurantId: string,
  tableId: string,
  sessionId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  const tid = tableId.trim();
  const sid = sessionId.trim();
  if (!rid || !tid || !sid || !isAuthReady()) return;

  try {
    await deleteDoc(tablePresenceDocRef(rid, tid, sid));
  } catch (error) {
    console.warn("[Hostly Presence] remove failed", error);
  }
}

export function listenTablePresenceForTable(
  restaurantId: string,
  tableId: string,
  onData: (entries: TablePresenceDocument[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  const tid = tableId.trim();
  if (!rid || !tid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const q = query(
    tablePresenceCollectionRef(rid),
    where("tableId", "==", tid),
  );

  return onSnapshot(
    q,
    (snap) => {
      const items: TablePresenceDocument[] = [];
      for (const docSnap of snap.docs) {
        const parsed = normalizeTablePresenceDocument(
          docSnap.id,
          docSnap.data(),
          rid,
        );
        if (parsed) items.push(parsed);
      }
      onData(dedupePresenceBySession(items));
    },
    (error) => {
      console.error("[Hostly Presence] listen", error);
      onError?.(error);
      onData([]);
    },
  );
}
