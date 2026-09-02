"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getOrCreateDeviceId, getRuntimeSessionId } from "@/lib/client/runtime-session";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  listenTablePresenceForTable,
  removeTablePresence,
  resolvePresenceState,
  TABLE_PRESENCE_HEARTBEAT_MS,
  type ResolvedPresenceState,
  type TablePresenceDocument,
  upsertTablePresence,
} from "@/lib/realtime/table-presence";

export type UseTablePresenceHeartbeatOptions = {
  enabled: boolean;
  restaurantId: string | null;
  tableId: string | null;
  tableName?: string | null;
  editingOrderId?: string | null;
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  route?: string;
};

const EMPTY_PRESENCE_STATE: ResolvedPresenceState = {
  activeOthers: [],
  staleOthers: [],
  hasConcurrentEdit: false,
  displayLabel: null,
  showConcurrentBadge: false,
};
const EMPTY_PRESENCE_ENTRIES: TablePresenceDocument[] = [];

function buildPresenceContextKey(params: {
  tableId: string;
  tableName?: string | null;
  editingOrderId?: string | null;
  userId?: string | null;
  route?: string;
}): string {
  return [
    params.tableId,
    params.tableName?.trim() ?? "",
    params.editingOrderId?.trim() ?? "",
    params.userId?.trim() ?? "",
    params.route?.trim() ?? "",
  ].join("|");
}

function canSendHeartbeat(): boolean {
  if (typeof document !== "undefined" && document.hidden) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return true;
}

export function useTablePresenceHeartbeat(
  options: UseTablePresenceHeartbeatOptions,
): ResolvedPresenceState & { sessionId: string } {
  const sessionId = useMemo(() => getRuntimeSessionId(), []);
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

  const [presenceSnapshot, setPresenceSnapshot] = useState<{
    key: string;
    entries: TablePresenceDocument[];
  } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const prevTableIdRef = useRef<string | null>(null);
  const firstWriteByTableRef = useRef<Record<string, boolean>>({});
  const lastContextKeyRef = useRef<string>("");
  const lastWriteAtRef = useRef(0);

  const restaurantId = options.restaurantId?.trim() ?? null;
  const tableId = options.tableId?.trim() ?? null;
  const enabled =
    options.enabled &&
    Boolean(restaurantId && tableId && isFirebaseConfigured);
  const presenceKey = enabled && restaurantId && tableId
    ? `${restaurantId}:${tableId}`
    : "";
  const presenceEntries =
    presenceKey && presenceSnapshot?.key === presenceKey
      ? presenceSnapshot.entries
      : EMPTY_PRESENCE_ENTRIES;

  useEffect(() => {
    if (!enabled || !restaurantId || !tableId || !presenceKey) return;

    return listenTablePresenceForTable(restaurantId, tableId, (entries) => {
      setPresenceSnapshot({ key: presenceKey, entries });
    });
  }, [enabled, presenceKey, restaurantId, tableId]);

  useEffect(() => {
    const prevTableId = prevTableIdRef.current;
    if (
      prevTableId &&
      prevTableId !== tableId &&
      restaurantId
    ) {
      void removeTablePresence(restaurantId, prevTableId, sessionId);
      lastContextKeyRef.current = "";
      lastWriteAtRef.current = 0;
    }
    prevTableIdRef.current = tableId;
  }, [tableId, restaurantId, sessionId]);

  useEffect(() => {
    if (!enabled || !restaurantId || !tableId) return;

    const sendHeartbeat = (force = false) => {
      if (!canSendHeartbeat()) return;

      const contextKey = buildPresenceContextKey({
        tableId,
        tableName: options.tableName,
        editingOrderId: options.editingOrderId,
        userId: options.userId,
        route: options.route,
      });

      const now = Date.now();
      const contextChanged = contextKey !== lastContextKeyRef.current;
      const elapsed = now - lastWriteAtRef.current;

      if (!force && !contextChanged && elapsed < TABLE_PRESENCE_HEARTBEAT_MS - 500) {
        return;
      }

      const isFirstWrite = !firstWriteByTableRef.current[tableId];
      if (isFirstWrite) {
        firstWriteByTableRef.current[tableId] = true;
      }

      lastContextKeyRef.current = contextKey;
      lastWriteAtRef.current = now;

      void upsertTablePresence({
        restaurantId,
        tableId,
        tableName: options.tableName?.trim() || undefined,
        sessionId,
        deviceId,
        userId: options.userId?.trim() || undefined,
        userName: options.userName?.trim() || undefined,
        userRole: options.userRole?.trim() || undefined,
        route: options.route,
        editingOrderId: options.editingOrderId?.trim() || undefined,
        status: "active",
        isFirstWrite,
      });
    };

    void sendHeartbeat(true);

    const intervalId = window.setInterval(() => {
      sendHeartbeat(false);
    }, TABLE_PRESENCE_HEARTBEAT_MS);

    const onVisibilityChange = () => {
      if (!document.hidden) sendHeartbeat(true);
    };
    const onOnline = () => sendHeartbeat(true);
    const onPageHide = () => {
      void removeTablePresence(restaurantId, tableId, sessionId);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
      void removeTablePresence(restaurantId, tableId, sessionId);
    };
  }, [
    enabled,
    restaurantId,
    tableId,
    sessionId,
    deviceId,
    options.tableName,
    options.editingOrderId,
    options.userId,
    options.userName,
    options.userRole,
    options.route,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      setNowTick(Date.now());
    }, TABLE_PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  const resolved = useMemo(() => {
    if (!enabled) return EMPTY_PRESENCE_STATE;
    return resolvePresenceState(presenceEntries, {
      selfSessionId: sessionId,
      editingOrderId: options.editingOrderId,
      nowMs: nowTick,
    });
  }, [
    enabled,
    presenceEntries,
    sessionId,
    options.editingOrderId,
    nowTick,
  ]);

  return {
    ...resolved,
    sessionId,
  };
}
