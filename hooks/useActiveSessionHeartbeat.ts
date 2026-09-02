"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  getBrowserUserAgentSummary,
  getOrCreateDeviceId,
  getRuntimeSessionId,
} from "@/lib/client/runtime-session";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  buildActivityMetadata,
  createActivityLog,
} from "@/lib/firestore/activity-log";
import {
  ACTIVE_SESSION_HEARTBEAT_MS,
  markActiveSessionOffline,
  removeActiveSession,
  upsertActiveSession,
} from "@/lib/realtime/active-sessions";

export type UseActiveSessionHeartbeatOptions = {
  enabled: boolean;
  restaurantId: string | null;
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  route?: string | null;
};

function canSendHeartbeat(): boolean {
  if (typeof document !== "undefined" && document.hidden) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return true;
}

function buildSessionContextKey(params: {
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  route?: string | null;
}): string {
  return [
    params.userId?.trim() ?? "",
    params.userName?.trim() ?? "",
    params.userRole?.trim() ?? "",
    params.route?.trim() ?? "",
  ].join("|");
}

function logSessionActivity(params: {
  restaurantId: string;
  type:
    | "user_login"
    | "user_logout"
    | "session_online"
    | "session_offline"
    | "session_reconnect";
  userId?: string;
  userName?: string;
  userRole?: string;
  sessionId: string;
  deviceId: string;
  route?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}) {
  const entityId = params.userId?.trim() || params.sessionId;
  void createActivityLog({
    restaurantId: params.restaurantId,
    type: params.type,
    entityType: "user",
    entityId,
    actorUserId: params.userId,
    actorUserName: params.userName,
    actorRole: params.userRole,
    deviceId: params.deviceId,
    sessionId: params.sessionId,
    idempotencyKey: params.idempotencyKey,
    metadata: buildActivityMetadata({
      route: params.route,
      deviceId: params.deviceId,
      sessionId: params.sessionId,
      userAgent: getBrowserUserAgentSummary(),
      ...params.metadata,
    }),
  });
}

export function useActiveSessionHeartbeat(
  options: UseActiveSessionHeartbeatOptions,
): { sessionId: string; deviceId: string } {
  const sessionId = useMemo(() => getRuntimeSessionId(), []);
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

  const restaurantId = options.restaurantId?.trim() ?? null;
  const userId = options.userId?.trim() ?? null;
  const enabled =
    options.enabled &&
    Boolean(restaurantId && userId && isFirebaseConfigured);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const firstWriteRef = useRef(false);
  const loginLoggedRef = useRef(false);
  const logoutLoggedRef = useRef(false);
  const offlineEpisodeRef = useRef(false);
  const offlineLoggedRef = useRef(false);
  const lastContextKeyRef = useRef("");
  const lastWriteAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || !restaurantId || !userId) return;

    const readOpts = () => optionsRef.current;

    const writeSessionState = async (params: {
      online: boolean;
      force?: boolean;
      isFirst?: boolean;
    }) => {
      const opts = readOpts();
      const contextKey = buildSessionContextKey(opts);
      const now = Date.now();
      const contextChanged = contextKey !== lastContextKeyRef.current;
      const elapsed = now - lastWriteAtRef.current;

      if (
        params.online &&
        canSendHeartbeat() &&
        !params.force &&
        !contextChanged &&
        elapsed < ACTIVE_SESSION_HEARTBEAT_MS - 500
      ) {
        return;
      }

      const isFirstWrite = params.isFirst ?? !firstWriteRef.current;
      if (isFirstWrite) {
        firstWriteRef.current = true;
      }

      if (params.online && canSendHeartbeat()) {
        lastContextKeyRef.current = contextKey;
        lastWriteAtRef.current = now;

        await upsertActiveSession({
          restaurantId,
          sessionId,
          deviceId,
          userId,
          userName: opts.userName?.trim() || undefined,
          userRole: opts.userRole?.trim() || undefined,
          route: opts.route?.trim() || undefined,
          userAgent: getBrowserUserAgentSummary() || undefined,
          online: true,
          isFirstWrite,
        });

        if (isFirstWrite && !loginLoggedRef.current) {
          loginLoggedRef.current = true;
          logSessionActivity({
            restaurantId,
            type: "user_login",
            userId,
            userName: opts.userName?.trim() || undefined,
            userRole: opts.userRole?.trim() || undefined,
            sessionId,
            deviceId,
            route: opts.route?.trim() || undefined,
            idempotencyKey: `user_login_${sessionId}`,
          });
          logSessionActivity({
            restaurantId,
            type: "session_online",
            userId,
            userName: opts.userName?.trim() || undefined,
            userRole: opts.userRole?.trim() || undefined,
            sessionId,
            deviceId,
            route: opts.route?.trim() || undefined,
            idempotencyKey: `session_online_${sessionId}`,
          });
        }

        if (offlineEpisodeRef.current) {
          offlineEpisodeRef.current = false;
          offlineLoggedRef.current = false;
          logSessionActivity({
            restaurantId,
            type: "session_reconnect",
            userId,
            userName: opts.userName?.trim() || undefined,
            userRole: opts.userRole?.trim() || undefined,
            sessionId,
            deviceId,
            route: opts.route?.trim() || undefined,
            idempotencyKey: `session_reconnect_${sessionId}_${now}`,
          });
          logSessionActivity({
            restaurantId,
            type: "session_online",
            userId,
            userName: opts.userName?.trim() || undefined,
            userRole: opts.userRole?.trim() || undefined,
            sessionId,
            deviceId,
            route: opts.route?.trim() || undefined,
            idempotencyKey: `session_online_reconnect_${sessionId}_${now}`,
          });
        }
      } else if (!params.online) {
        await markActiveSessionOffline(restaurantId, sessionId);
      }
    };

    const logLogoutOnce = () => {
      if (logoutLoggedRef.current) return;
      logoutLoggedRef.current = true;
      const opts = readOpts();
      logSessionActivity({
        restaurantId,
        type: "user_logout",
        userId,
        userName: opts.userName?.trim() || undefined,
        userRole: opts.userRole?.trim() || undefined,
        sessionId,
        deviceId,
        route: opts.route?.trim() || undefined,
        idempotencyKey: `user_logout_${sessionId}`,
      });
    };

    const handleOffline = () => {
      offlineEpisodeRef.current = true;
      void writeSessionState({ online: false, force: true });
      if (!offlineLoggedRef.current) {
        offlineLoggedRef.current = true;
        const opts = readOpts();
        logSessionActivity({
          restaurantId,
          type: "session_offline",
          userId,
          userName: opts.userName?.trim() || undefined,
          userRole: opts.userRole?.trim() || undefined,
          sessionId,
          deviceId,
          route: opts.route?.trim() || undefined,
          idempotencyKey: `session_offline_${sessionId}_${Date.now()}`,
        });
      }
    };

    const handleOnline = () => {
      void writeSessionState({ online: true, force: true });
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void writeSessionState({ online: true, force: true });
      }
    };

    const handlePageHide = () => {
      logLogoutOnce();
      void removeActiveSession(restaurantId, sessionId);
    };

    void writeSessionState({ online: true, force: true, isFirst: true });

    const intervalId = window.setInterval(() => {
      void writeSessionState({ online: true, force: false });
    }, ACTIVE_SESSION_HEARTBEAT_MS);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      logLogoutOnce();
      void removeActiveSession(restaurantId, sessionId);
    };
  }, [enabled, restaurantId, userId, sessionId, deviceId]);

  return { sessionId, deviceId };
}
