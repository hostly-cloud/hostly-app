"use client";

import Link from "next/link";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/components/auth/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  activityLogCategory,
  activityLogTypeLabel,
  listenActivityLogs,
  type ActivityLogCategory,
  type ActivityLogDocument,
} from "@/lib/firestore/activity-log";
import { OperacionModuleShell } from "../_components/operacion-module-shell";

type FilterKey = "all" | ActivityLogCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "tpv", label: "TPV" },
  { key: "inventory", label: "Inventario" },
  { key: "purchases", label: "Compras" },
  { key: "users", label: "Usuarios" },
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

function actorLabel(log: ActivityLogDocument): string {
  return (
    log.actorUserName?.trim() ||
    log.actorUserId?.slice(0, 8) ||
    "Sistema"
  );
}

function entityHref(log: ActivityLogDocument): string | null {
  switch (log.entityType) {
    case "order":
      if (log.metadata?.tableId && typeof log.metadata.tableId === "string") {
        const tableId = log.metadata.tableId.trim();
        const orderId = log.entityId.trim();
        return `/dashboard/operacion/tpv?tableId=${encodeURIComponent(tableId)}&orderId=${encodeURIComponent(orderId)}`;
      }
      return null;
    case "purchaseOrder":
      return `/dashboard/inventario/pedidos-compra/${encodeURIComponent(log.entityId.trim())}`;
    case "supplierInvoice":
      return `/dashboard/inventario/facturas-proveedor/${encodeURIComponent(log.entityId.trim())}`;
    default:
      return null;
  }
}

function metadataSummary(log: ActivityLogDocument): string | null {
  const meta = log.metadata;
  if (!meta) return null;
  const parts: string[] = [];
  if (typeof meta.tableName === "string" && meta.tableName.trim()) {
    parts.push(meta.tableName.trim());
  } else if (typeof meta.tableId === "string" && meta.tableId.trim()) {
    parts.push(`Mesa ${meta.tableId.trim()}`);
  }
  if (typeof meta.lineCount === "number" && Number.isFinite(meta.lineCount)) {
    parts.push(`${meta.lineCount} líneas`);
  }
  if (typeof meta.amount === "number" && Number.isFinite(meta.amount)) {
    parts.push(
      `${new Intl.NumberFormat("es-ES", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(meta.amount)} €`,
    );
  }
  if (typeof meta.productName === "string" && meta.productName.trim()) {
    parts.push(meta.productName.trim());
  }
  if (typeof meta.paymentMethod === "string" && meta.paymentMethod.trim()) {
    parts.push(meta.paymentMethod.trim());
  }
  if (typeof meta.secondaryTableId === "string" && meta.secondaryTableId.trim()) {
    parts.push(`+ ${meta.secondaryTableId.trim()}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function matchesSearch(log: ActivityLogDocument, queryText: string): boolean {
  const q = queryText.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    log.entityId,
    log.type,
    log.actorUserName,
    log.actorUserId,
    metadataSummary(log),
    JSON.stringify(log.metadata ?? {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
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

const searchStyle: CSSProperties = {
  flex: "1 1 220px",
  minWidth: 180,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "#fff",
  fontSize: 13,
  color: "#1f2933",
};

const listStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: "8px 0",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "88px minmax(0, 1fr) auto",
  gap: 12,
  alignItems: "center",
  padding: "10px 16px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
};

export default function OperacionActivityPage() {
  const { restaurantId, ready: authReady } = useAuth();
  const [logs, setLogs] = useState<ActivityLogDocument[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setLogs([]);
      return;
    }
    return listenActivityLogs(restaurantId, setLogs, {
      limit: 120,
      onError: () => {
        setLoadError("No se pudo cargar el registro de actividad.");
      },
    });
  }, [authReady, restaurantId]);

  const visibleLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filter !== "all" && activityLogCategory(log.type) !== filter) {
        return false;
      }
      return matchesSearch(log, search);
    });
  }, [logs, filter, search]);

  return (
    <OperacionModuleShell title="Actividad">
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
          <input
            type="search"
            placeholder="Buscar mesa, orderId, usuario…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={searchStyle}
            aria-label="Buscar actividad"
          />
        </div>

        {loadError ? (
          <p style={{ padding: "12px 16px", color: "#b45309", fontSize: 13 }}>
            {loadError}
          </p>
        ) : null}

        <div style={listStyle}>
          {visibleLogs.length === 0 ? (
            <p
              style={{
                padding: "24px 16px",
                color: "#667085",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {logs.length === 0
                ? "Sin actividad registrada todavía."
                : "Ningún resultado con estos filtros."}
            </p>
          ) : (
            visibleLogs.map((log) => {
              const href = entityHref(log);
              const summary = metadataSummary(log);
              return (
                <div key={log.id} style={rowStyle}>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#667085",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatWhen(log.createdAt)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#1f2933",
                        }}
                      >
                        {activityLogTypeLabel(log.type)}
                      </span>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>
                        {actorLabel(log)}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 12,
                        color: "#667085",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {summary ?? log.entityId}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {href ? (
                      <Link
                        href={href}
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#315f7d",
                          textDecoration: "none",
                        }}
                      >
                        Abrir
                      </Link>
                    ) : (
                      <span
                        style={{
                          fontSize: 10,
                          color: "#94a3b8",
                          fontFamily: "monospace",
                        }}
                      >
                        {log.entityId.slice(0, 10)}
                      </span>
                    )}
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
