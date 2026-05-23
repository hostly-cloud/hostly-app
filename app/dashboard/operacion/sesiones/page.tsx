"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/components/auth/auth-context";
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
  style: CSSProperties;
} {
  const stale = nowMs - session.lastSeenAt > ACTIVE_SESSION_STALE_MS;
  if (stale) {
    return {
      label: "Stale",
      style: {
        color: "#64748b",
        background: "rgba(148, 163, 184, 0.16)",
        border: "1px solid rgba(148, 163, 184, 0.28)",
      },
    };
  }
  if (session.online) {
    return {
      label: "Online",
      style: {
        color: "#047857",
        background: "rgba(16, 185, 129, 0.12)",
        border: "1px solid rgba(16, 185, 129, 0.28)",
      },
    };
  }
  return {
    label: "Offline",
    style: {
      color: "#b45309",
      background: "rgba(245, 158, 11, 0.14)",
      border: "1px solid rgba(245, 158, 11, 0.28)",
    },
  };
}

const toolbarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  padding: "12px 16px",
  borderBottom: "1px solid var(--hostly-line)",
  background: "rgba(247, 252, 255, 0.92)",
};

const filterChipStyle = (active: boolean): CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 999,
  border: active
    ? "1px solid rgba(49, 95, 125, 0.35)"
    : "1px solid rgba(148, 163, 184, 0.24)",
  background: active ? "#ffffff" : "rgba(255,255,255,0.72)",
  color: active ? "#1f2933" : "#667085",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
});

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr) 88px minmax(0, 0.8fr) minmax(0, 0.8fr)",
  gap: 10,
  alignItems: "center",
  padding: "10px 16px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
};

const pillBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

export default function OperacionSesionesPage() {
  const { restaurantId, ready: authReady } = useAuth();
  const [sessions, setSessions] = useState<ActiveSessionDocument[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ViewFilter>("active");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setSessions([]);
      return;
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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
          background: "var(--hostly-surface-page)",
        }}
      >
        <div style={toolbarStyle}>
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              style={filterChipStyle(filter === item.key)}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#667085",
              fontWeight: 600,
            }}
          >
            {resolved.onlineCount} online · {resolved.offlineCount} offline ·{" "}
            {resolved.stale.length} stale
          </span>
        </div>

        {loadError ? (
          <p style={{ padding: "12px 16px", color: "#b45309", fontSize: 13 }}>
            {loadError}
          </p>
        ) : null}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
          }}
        >
          {visibleSessions.length === 0 ? (
            <p
              style={{
                padding: "24px 16px",
                color: "#667085",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {sessions.length === 0
                ? "Sin sesiones registradas todavía."
                : "Ninguna sesión con este filtro."}
            </p>
          ) : (
            visibleSessions.map((session) => {
              const status = statusPill(session, nowMs);
              return (
                <div key={session.id} style={rowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#1f2933",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {userLabel(session)}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      {session.userRole?.trim() || "staff"} ·{" "}
                      {session.userAgent?.trim() || "Web"}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#667085",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={session.route}
                  >
                    {routeLabel(session.route)}
                  </div>
                  <span style={{ ...pillBase, ...status.style }}>{status.label}</span>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#667085",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatRelative(session.lastSeenAt, nowMs)}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#94a3b8",
                      fontFamily: "monospace",
                    }}
                  >
                    <div title={session.deviceId}>
                      dev {compactDeviceId(session.deviceId)}
                    </div>
                    <div title={session.sessionId}>
                      ses {compactSessionId(session.sessionId)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </OperacionModuleShell>
  );
}
