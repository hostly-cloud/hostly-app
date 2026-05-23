"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CONNECTIVITY_DEGRADED_AFTER_OFFLINE_MS,
  CONNECTIVITY_PING_INTERVAL_MS,
  CONNECTIVITY_PING_TIMEOUT_MS,
  CONNECTIVITY_RECONNECT_STABILIZE_MS,
  CONNECTIVITY_SUCCESS_FLASH_MS,
  getInitialConnectivityState,
  resolveConnectivityStatus,
  type ConnectivityState,
  type ConnectivityStatus,
} from "@/lib/client/connectivity-state";

type ConnectivityContextValue = {
  connectivity: ConnectivityState;
  status: ConnectivityStatus;
  showSuccessFlash: boolean;
  notifyListenerError: (source?: string) => void;
  notifyListenerHealthy: (source?: string) => void;
  runConnectivityPing: () => Promise<boolean>;
};

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

async function pingConnectivity(): Promise<boolean> {
  if (typeof window === "undefined") return true;
  if (navigator.onLine === false) return false;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    CONNECTIVITY_PING_TIMEOUT_MS,
  );

  try {
    const response = await fetch("/manifest.webmanifest", {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [navigatorOnline, setNavigatorOnline] = useState(
    () => getInitialConnectivityState().isOnline,
  );
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isDegraded, setIsDegraded] = useState(false);
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);
  const [timestamps, setTimestamps] = useState(() => {
    const initial = getInitialConnectivityState();
    return {
      lastOnlineAt: initial.lastOnlineAt,
      lastOfflineAt: initial.lastOfflineAt,
      lastReconnectAt: initial.lastReconnectAt,
      lastHeartbeatAt: initial.lastHeartbeatAt,
      reconnectAttemptCount: initial.reconnectAttemptCount,
    };
  });

  const reconnectTimerRef = useRef<number | null>(null);
  const successTimerRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const listenerErrorUntilRef = useRef(0);
  const recentOfflineAtRef = useRef<number | null>(
    getInitialConnectivityState().lastOfflineAt,
  );

  const status = useMemo(
    () =>
      resolveConnectivityStatus({
        navigatorOnline,
        isReconnecting,
        isDegraded,
      }),
    [navigatorOnline, isReconnecting, isDegraded],
  );

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearSuccessTimer = useCallback(() => {
    if (successTimerRef.current != null) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }, []);

  const flashSuccess = useCallback(() => {
    clearSuccessTimer();
    setShowSuccessFlash(true);
    successTimerRef.current = window.setTimeout(() => {
      setShowSuccessFlash(false);
      successTimerRef.current = null;
    }, CONNECTIVITY_SUCCESS_FLASH_MS);
  }, [clearSuccessTimer]);

  const runConnectivityPing = useCallback(async (): Promise<boolean> => {
    const ok = await pingConnectivity();
    const now = Date.now();

    setTimestamps((prev) => ({
      ...prev,
      lastHeartbeatAt: ok ? now : prev.lastHeartbeatAt,
    }));

    if (!ok && navigatorOnline) {
      setIsDegraded(true);
      return false;
    }

    if (ok) {
      const recentOffline = recentOfflineAtRef.current;
      const stillRecent =
        recentOffline != null &&
        now - recentOffline <= CONNECTIVITY_DEGRADED_AFTER_OFFLINE_MS;

      if (!stillRecent && listenerErrorUntilRef.current <= now) {
        setIsDegraded(false);
      }
    }

    return ok;
  }, [navigatorOnline]);

  const stabilizeOnline = useCallback(() => {
    clearReconnectTimer();
    setIsReconnecting(true);

    void runConnectivityPing().finally(() => {
      reconnectTimerRef.current = window.setTimeout(() => {
        setIsReconnecting(false);
        setTimestamps((prev) => ({
          ...prev,
          lastOnlineAt: Date.now(),
          reconnectAttemptCount: prev.reconnectAttemptCount + 1,
        }));
        flashSuccess();
        reconnectTimerRef.current = null;
      }, CONNECTIVITY_RECONNECT_STABILIZE_MS);
    });
  }, [clearReconnectTimer, flashSuccess, runConnectivityPing]);

  const notifyListenerError = useCallback((_source?: string) => {
    listenerErrorUntilRef.current = Date.now() + CONNECTIVITY_DEGRADED_AFTER_OFFLINE_MS;
    if (navigatorOnline) {
      setIsDegraded(true);
    }
  }, [navigatorOnline]);

  const notifyListenerHealthy = useCallback((_source?: string) => {
    listenerErrorUntilRef.current = 0;
    if (navigatorOnline && !isReconnecting) {
      setIsDegraded(false);
    }
  }, [navigatorOnline, isReconnecting]);

  useEffect(() => {
    const handleOffline = () => {
      const now = Date.now();
      recentOfflineAtRef.current = now;
      clearReconnectTimer();
      clearSuccessTimer();
      setShowSuccessFlash(false);
      setNavigatorOnline(false);
      setIsReconnecting(false);
      setIsDegraded(false);
      setTimestamps((prev) => ({
        ...prev,
        lastOfflineAt: now,
      }));
    };

    const handleOnline = () => {
      const now = Date.now();
      setNavigatorOnline(true);
      setTimestamps((prev) => ({
        ...prev,
        lastReconnectAt: now,
      }));
      stabilizeOnline();
    };

    const handleVisibility = () => {
      if (!document.hidden && navigator.onLine) {
        void runConnectivityPing();
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearReconnectTimer();
      clearSuccessTimer();
    };
  }, [
    clearReconnectTimer,
    clearSuccessTimer,
    runConnectivityPing,
    stabilizeOnline,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.hidden || !navigatorOnline) {
      if (pingIntervalRef.current != null) {
        window.clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      return;
    }

    void runConnectivityPing();

    pingIntervalRef.current = window.setInterval(() => {
      if (document.hidden || navigator.onLine === false) return;
      void runConnectivityPing();
    }, CONNECTIVITY_PING_INTERVAL_MS);

    return () => {
      if (pingIntervalRef.current != null) {
        window.clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [navigatorOnline, runConnectivityPing]);

  const connectivity = useMemo<ConnectivityState>(
    () => ({
      isOnline: navigatorOnline,
      status,
      lastOnlineAt: timestamps.lastOnlineAt,
      lastOfflineAt: timestamps.lastOfflineAt,
      lastReconnectAt: timestamps.lastReconnectAt,
      lastHeartbeatAt: timestamps.lastHeartbeatAt,
      reconnectAttemptCount: timestamps.reconnectAttemptCount,
    }),
    [navigatorOnline, status, timestamps],
  );

  const value = useMemo<ConnectivityContextValue>(
    () => ({
      connectivity,
      status,
      showSuccessFlash,
      notifyListenerError,
      notifyListenerHealthy,
      runConnectivityPing,
    }),
    [
      connectivity,
      status,
      showSuccessFlash,
      notifyListenerError,
      notifyListenerHealthy,
      runConnectivityPing,
    ],
  );

  return (
    <ConnectivityContext.Provider value={value}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity(): ConnectivityContextValue {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) {
    throw new Error("useConnectivity debe usarse dentro de ConnectivityProvider");
  }
  return ctx;
}

export function useConnectivityOptional(): ConnectivityContextValue | null {
  return useContext(ConnectivityContext);
}
