"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  HostlyAlert,
  HostlyInput,
  HostlyOperationalEmptyState,
  HostlySegmentedButton,
  HostlySegmentedControl,
} from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  activityLogCategory,
  activityLogTypeLabel,
  listenActivityLogs,
  type ActivityLogCategory,
  type ActivityLogDocument,
} from "@/lib/firestore/activity-log";
import {
  activityActorLabel,
  activitySummary,
} from "@/lib/operacion/activity-presentation";
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

function matchesSearch(log: ActivityLogDocument, queryText: string): boolean {
  const q = queryText.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    log.entityId,
    log.type,
    log.actorUserName,
    log.actorUserId,
    activitySummary(log),
    JSON.stringify(log.metadata ?? {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export default function OperacionActivityPage() {
  const { restaurantId, ready: authReady } = useAuth();
  const [logs, setLogs] = useState<ActivityLogDocument[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      const resetId = window.setTimeout(() => setLogs([]), 0);
      return () => window.clearTimeout(resetId);
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
      <div className="hostly-operation-audit-view">
        <div className="hostly-operation-audit-toolbar">
          <HostlySegmentedControl aria-label="Filtrar actividad">
            {FILTERS.map((item) => (
              <HostlySegmentedButton
                key={item.key}
                selected={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </HostlySegmentedButton>
            ))}
          </HostlySegmentedControl>
          <HostlyInput
            type="search"
            placeholder="Buscar mesa, acción o usuario…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="hostly-operation-audit-search"
            aria-label="Buscar actividad"
          />
        </div>

        {loadError ? (
          <HostlyAlert tone="warning" className="hostly-operation-audit-alert">
            {loadError}
          </HostlyAlert>
        ) : null}

        <div className="hostly-operation-audit-list">
          {visibleLogs.length === 0 ? (
            <HostlyOperationalEmptyState
              className="hostly-operation-audit-empty"
              title={logs.length === 0 ? "Sin actividad registrada" : "Sin resultados"}
              text={logs.length === 0
                ? "Las acciones operativas aparecerán aquí conforme se registren."
                : "No hay actividad que coincida con los filtros y la búsqueda."}
            />
          ) : (
            visibleLogs.map((log) => {
              const href = entityHref(log);
              return (
                <article key={log.id} className="hostly-operation-activity-row">
                  <span className="hostly-operation-audit-time">
                    {formatWhen(log.createdAt)}
                  </span>
                  <div className="hostly-operation-audit-primary">
                    <div className="hostly-operation-activity-heading">
                      <span className="hostly-operation-audit-title">
                        {activityLogTypeLabel(log.type)}
                      </span>
                      <span className="hostly-operation-audit-meta">
                        {activityActorLabel(log)}
                      </span>
                    </div>
                    <div className="hostly-operation-activity-summary">
                      {activitySummary(log)}
                    </div>
                  </div>
                  <div className="hostly-operation-activity-action">
                    {href ? (
                      <Link
                        href={href}
                        className="hostly-button-secondary hostly-button-compact"
                      >
                        Abrir
                      </Link>
                    ) : null}
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
