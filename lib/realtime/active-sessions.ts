import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { dbgSetDoc, type FsWriteDebugContext } from "@/lib/firestore/instrumentedWrites";

export const ACTIVE_SESSION_HEARTBEAT_MS = 30_000;
export const ACTIVE_SESSION_STALE_MS = 90_000;

export type ActiveSessionDocument = {
  id: string;
  restaurantId: string;
  sessionId: string;
  deviceId: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  route?: string;
  userAgent?: string;
  online: boolean;
  lastSeenAt: number;
  createdAt: number;
  lastOnlineAt?: number;
  lastOfflineAt?: number;
};

export type UpsertActiveSessionParams = {
  restaurantId: string;
  sessionId: string;
  deviceId: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  route?: string;
  userAgent?: string;
  online?: boolean;
  isFirstWrite?: boolean;
};

export type ResolvedActiveSessionsState = {
  active: ActiveSessionDocument[];
  stale: ActiveSessionDocument[];
  onlineCount: number;
  offlineCount: number;
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

function sanitizeSessionDocId(sessionId: string): string {
  return sessionId.trim().replace(/\//g, "_").slice(0, 120);
}

export function activeSessionsCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "activeSessions");
}

export function activeSessionDocRef(restaurantId: string, sessionId: string) {
  return doc(
    activeSessionsCollectionRef(restaurantId),
    sanitizeSessionDocId(sessionId),
  );
}

export function normalizeActiveSessionDocument(
  docId: string,
  raw: unknown,
  restaurantId: string,
): ActiveSessionDocument | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const rid = readTrimmedString(data.restaurantId, 120) ?? restaurantId.trim();
  const sessionId = readTrimmedString(data.sessionId, 120);
  const deviceId = readTrimmedString(data.deviceId, 120);
  const lastSeenAt = readFiniteNumber(data.lastSeenAt);
  const createdAt = readFiniteNumber(data.createdAt) ?? lastSeenAt ?? Date.now();
  if (!rid || !sessionId || !deviceId || lastSeenAt == null) return null;

  return {
    id: docId.trim(),
    restaurantId: rid,
    sessionId,
    deviceId,
    online: data.online === false ? false : true,
    lastSeenAt,
    createdAt,
    ...(readTrimmedString(data.userId, 120)
      ? { userId: readTrimmedString(data.userId, 120) }
      : {}),
    ...(readTrimmedString(data.userName, 200)
      ? { userName: readTrimmedString(data.userName, 200) }
      : {}),
    ...(readTrimmedString(data.userRole, 40)
      ? { userRole: readTrimmedString(data.userRole, 40) }
      : {}),
    ...(readTrimmedString(data.route, 200)
      ? { route: readTrimmedString(data.route, 200) }
      : {}),
    ...(readTrimmedString(data.userAgent, 200)
      ? { userAgent: readTrimmedString(data.userAgent, 200) }
      : {}),
    ...(readFiniteNumber(data.lastOnlineAt) != null
      ? { lastOnlineAt: readFiniteNumber(data.lastOnlineAt) }
      : {}),
    ...(readFiniteNumber(data.lastOfflineAt) != null
      ? { lastOfflineAt: readFiniteNumber(data.lastOfflineAt) }
      : {}),
  };
}

export function isActiveSessionFresh(
  entry: ActiveSessionDocument,
  nowMs: number = Date.now(),
): boolean {
  return nowMs - entry.lastSeenAt <= ACTIVE_SESSION_STALE_MS;
}

export function resolveActiveSessionState(
  entries: readonly ActiveSessionDocument[],
  nowMs: number = Date.now(),
): ResolvedActiveSessionsState {
  const bySession = new Map<string, ActiveSessionDocument>();
  for (const entry of entries) {
    const key = entry.sessionId.trim();
    if (!key) continue;
    const prev = bySession.get(key);
    if (!prev || entry.lastSeenAt >= prev.lastSeenAt) {
      bySession.set(key, entry);
    }
  }

  const deduped = [...bySession.values()];
  const active = deduped.filter((entry) => isActiveSessionFresh(entry, nowMs));
  const stale = deduped.filter((entry) => !isActiveSessionFresh(entry, nowMs));

  active.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  stale.sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  return {
    active,
    stale,
    onlineCount: active.filter((entry) => entry.online).length,
    offlineCount: active.filter((entry) => !entry.online).length,
  };
}

export async function upsertActiveSession(
  params: UpsertActiveSessionParams,
): Promise<void> {
  const rid = params.restaurantId.trim();
  const sessionId = params.sessionId.trim();
  const deviceId = params.deviceId.trim();
  if (!rid || !sessionId || !deviceId || !isAuthReady()) return;

  const now = Date.now();
  const online = params.online !== false;
  const ref = activeSessionDocRef(rid, sessionId);
  const payload: Record<string, unknown> = {
    restaurantId: rid,
    sessionId,
    deviceId,
    online,
    lastSeenAt: now,
    ...(params.isFirstWrite ? { createdAt: now } : {}),
    ...(online ? { lastOnlineAt: now } : { lastOfflineAt: now }),
    ...(params.userId?.trim() ? { userId: params.userId.trim().slice(0, 120) } : {}),
    ...(params.userName?.trim() ? { userName: params.userName.trim().slice(0, 200) } : {}),
    ...(params.userRole?.trim() ? { userRole: params.userRole.trim().slice(0, 40) } : {}),
    ...(params.route?.trim() ? { route: params.route.trim().slice(0, 200) } : {}),
    ...(params.userAgent?.trim() ? { userAgent: params.userAgent.trim().slice(0, 200) } : {}),
  };

  const ctx: FsWriteDebugContext = {
    label: "activeSessions:upsert",
    collection: "activeSessions",
    restaurantId: rid,
  };

  try {
    await dbgSetDoc(ref, payload, ctx, { merge: true });
  } catch (error) {
    console.warn("[Hostly ActiveSession] upsert failed", error);
  }
}

export async function markActiveSessionOffline(
  restaurantId: string,
  sessionId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  const sid = sessionId.trim();
  if (!rid || !sid || !isAuthReady()) return;

  const now = Date.now();
  const ref = activeSessionDocRef(rid, sid);
  const ctx: FsWriteDebugContext = {
    label: "activeSessions:offline",
    collection: "activeSessions",
    restaurantId: rid,
  };

  try {
    await dbgSetDoc(
      ref,
      {
        online: false,
        lastSeenAt: now,
        lastOfflineAt: now,
      },
      ctx,
      { merge: true },
    );
  } catch (error) {
    console.warn("[Hostly ActiveSession] offline mark failed", error);
  }
}

export async function removeActiveSession(
  restaurantId: string,
  sessionId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  const sid = sessionId.trim();
  if (!rid || !sid || !isAuthReady()) return;

  try {
    await deleteDoc(activeSessionDocRef(rid, sid));
  } catch (error) {
    console.warn("[Hostly ActiveSession] remove failed", error);
  }
}

export function listenActiveSessions(
  restaurantId: string,
  onData: (sessions: ActiveSessionDocument[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  return onSnapshot(
    activeSessionsCollectionRef(rid),
    (snap) => {
      const items: ActiveSessionDocument[] = [];
      for (const docSnap of snap.docs) {
        const parsed = normalizeActiveSessionDocument(
          docSnap.id,
          docSnap.data(),
          rid,
        );
        if (parsed) items.push(parsed);
      }
      onData(items);
    },
    (error) => {
      console.error("[Hostly ActiveSession] listen", error);
      onError?.(error);
      onData([]);
    },
  );
}

export function compactSessionId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 10) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

export function compactDeviceId(value: string): string {
  return compactSessionId(value);
}
