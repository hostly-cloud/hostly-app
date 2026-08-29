"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  HostlyAlert,
  HostlyOperationalEmptyState,
  HostlySegmentedControl,
  HostlyStatusBadge,
  hostlySegmentTabClassName,
  type HostlyStatusBadgeTone,
} from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  ACTIVE_SESSION_STALE_MS,
  compactDeviceId,
  compactSessionId,
  listenActiveSessions,
  resolveActiveSessionState,
  type ActiveSessionDocument,
} from "@/lib/realtime/active-sessions";
import { OperacionModuleShell } from "../_components/operacion-module-shell";

type ViewFilter = "all" | "active" | "stale" | "online" | "offline";

const FILTERS: { key: ViewFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "active", label: "Activas" },
  { key: "online", label: "Online" },
  { key: "offline", label: "Offline" },
  { key: "stale", label: "Stale" },
];

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelative(ms: number, nowMs: number): string {
  const deltaSec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (deltaSec < 60) return `hace ${deltaSec}s`;
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `hace ${deltaMin} min`;
  return formatWhen(ms);
}

function userLabel(session: ActiveSessionDocument): string {
  return (
    session.userName?.trim() ||
    session.userId?.slice(0, 8) ||
    "Usuario"
  );
}

function routeLabel(route?: string): string {
  const value = route?.trim();
  if (!value) return "—";
  if (value.length <= 42) return value;
  return `…${value.slice(-40)}`;
}

function statusPill(session: ActiveSessionDocument, nowMs: number): {
  label: string;
  tone: HostlyStatusBadgeTone;
} {
  const stale = nowMs - session.lastSeenAt > ACTIVE_SESSION_STALE_MS;
  if (stale) {
    return {
      label: "Stale",
      tone: "muted",
    };
  }
  if (session.online) {
    return {
      label: "Online",
      tone: "success",
    };
  }
  return {
    label: "Offline",
    tone: "warning",
  };
}

export default function OperacionSesionesPage() {
  const { restaurantId, ready: authReady } = useAuth();
  const [sessions, setSessions] = useState<ActiveSessionDocument[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ViewFilter>("active");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      const resetId = window.setTimeout(() => setSessions([]), 0);
      return () => window.clearTimeout(resetId);
    }
    return listenActiveSessions(restaurantId, setSessions, () => {
      setLoadError("No se pudieron cargar las sesiones activas.");
    });
  }, [authReady, restaurantId]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const resolved = useMemo(
    () => resolveActiveSessionState(sessions, nowMs),
    [sessions, nowMs],
  );

  const visibleSessions = useMemo(() => {
    switch (filter) {
      case "active":
        return resolved.active;
      case "stale":
        return resolved.stale;
      case "online":
        return resolved.active.filter((entry) => entry.online);
      case "offline":
        return resolved.active.filter((entry) => !entry.online);
      default:
        return [...resolved.active, ...resolved.stale].sort(
          (a, b) => b.lastSeenAt - a.lastSeenAt,
        );
    }
  }, [filter, resolved]);

  return (
    <OperacionModuleShell title="Sesiones">
      <div className="hostly-operation-audit-view">
        <div className="hostly-operation-audit-toolbar">
          <HostlySegmentedControl aria-label="Filtrar sesiones">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                className={hostlySegmentTabClassName()}
                aria-selected={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </HostlySegmentedControl>
          <span className="hostly-operation-audit-summary">
            {resolved.onlineCount} online · {resolved.offlineCount} offline ·{" "}
            {resolved.stale.length} stale
          </span>
        </div>

        {loadError ? (
          <HostlyAlert tone="warning" className="hostly-operation-audit-alert">
            {loadError}
          </HostlyAlert>
        ) : null}

        <div className="hostly-operation-audit-list">
          {visibleSessions.length === 0 ? (
            <HostlyOperationalEmptyState
              className="hostly-operation-audit-empty"
              title={sessions.length === 0 ? "Sin sesiones registradas" : "Sin coincidencias"}
              text={sessions.length === 0
                ? "Las sesiones aparecerán aquí cuando un dispositivo acceda a Hostly."
                : "No hay sesiones que coincidan con el filtro seleccionado."}
            />
          ) : (
            visibleSessions.map((session) => {
              const status = statusPill(session, nowMs);
              return (
                <article key={session.id} className="hostly-operation-session-row">
                  <div className="hostly-operation-audit-primary">
                    <div className="hostly-operation-audit-title">
                      {userLabel(session)}
                    </div>
                    <div className="hostly-operation-audit-meta">
                      {session.userRole?.trim() || "staff"} ·{" "}
                      {session.userAgent?.trim() || "Web"}
                    </div>
                  </div>
                  <div
                    className="hostly-operation-session-route"
                    title={session.route}
                  >
                    {routeLabel(session.route)}
                  </div>
                  <HostlyStatusBadge tone={status.tone}>{status.label}</HostlyStatusBadge>
                  <div className="hostly-operation-audit-time">
                    {formatRelative(session.lastSeenAt, nowMs)}
                  </div>
                  <div className="hostly-operation-session-ids">
                    <div title={session.deviceId}>
                      dev {compactDeviceId(session.deviceId)}
                    </div>
                    <div title={session.sessionId}>
                      ses {compactSessionId(session.sessionId)}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </OperacionModuleShell>
  );
}
