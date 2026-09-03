"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-context";
import { useOperationFilter } from "@/components/kds/operation-filter-context";
import { HostlyButton } from "@/components/ui/hostly";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { logFirestorePermissionError } from "@/lib/firestore/log-firestore-permission-error";
import { resolveKdsSlaLevel } from "@/lib/kds/kds-sla";
import {
  KDS_OPERATION_STATION_FILTER_ALL,
  matchesKdsOperationStationSelection,
} from "@/lib/kds/operation-station-kds-filter";
import {
  isKdsKitchenDestination,
  resolveKdsDestination,
} from "@/lib/kds/kds-destination";
import {
  computeServiceMetrics,
  formatAvgMinutes,
  isOrderActiveForMetrics,
  type ServiceMetricsItem,
  type ServiceScope,
} from "@/lib/operacion/service-metrics";

function MetricKpi({
  label,
  value,
  variant,
}: {
  label: string;
  value: string | number;
  variant: "info" | "warning" | "success" | "neutral" | "danger";
}) {
  const mod =
    variant === "info"
      ? "hostly-mobile-kpi--info"
      : variant === "warning"
        ? "hostly-mobile-kpi--warning"
        : variant === "success"
          ? "hostly-mobile-kpi--success"
          : variant === "danger"
            ? "hostly-mobile-kpi--danger"
            : "hostly-mobile-kpi--neutral";
  return (
    <div className={`hostly-mobile-kpi !p-2 ${mod}`}>
      <div className="hostly-mobile-kpi__label !text-[9px]">{label}</div>
      <div className="hostly-mobile-kpi__value !mt-0.5 !text-[15px]">{value}</div>
    </div>
  );
}

function readItemSentMs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object") {
    const obj = v as { toMillis?: () => number; toDate?: () => Date };
    if (typeof obj.toMillis === "function") {
      try {
        return obj.toMillis();
      } catch {
        /* ignore */
      }
    }
    if (typeof obj.toDate === "function") {
      try {
        return obj.toDate().getTime();
      } catch {
        /* ignore */
      }
    }
  }
  return undefined;
}

function countKitchenSlaSentLines(
  items: ServiceMetricsItem[],
  nowMs: number,
  level: "attention" | "critical",
  selectedOperationStationId: string = KDS_OPERATION_STATION_FILTER_ALL,
): number {
  let count = 0;
  for (const it of items) {
    if (!isKdsKitchenDestination(resolveKdsDestination(it))) continue;
    if (
      !matchesKdsOperationStationSelection(
        {
          operationStationId:
            typeof it.operationStationId === "string"
              ? it.operationStationId
              : undefined,
        },
        selectedOperationStationId,
      )
    ) {
      continue;
    }
    const st = String(it.status ?? "")
      .trim()
      .toLowerCase();
    if (st !== "sent") continue;
    const sentMs = readItemSentMs(it.sentAt);
    if (sentMs == null) continue;
    if (resolveKdsSlaLevel(nowMs - sentMs, "kitchen") === level) {
      count += 1;
    }
  }
  return count;
}

function CompactKitchenKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "info" | "warning" | "success" | "danger";
}) {
  return (
    <div
      className={`hostly-kds-kitchen-kpi hostly-kds-kitchen-kpi--${tone}`}
      aria-label={`${label}: ${value}`}
    >
      <span className="hostly-kds-kitchen-kpi__value">{value}</span>
      <span className="hostly-kds-kitchen-kpi__label">{label}</span>
    </div>
  );
}

type MetricsOrder = {
  waiterId?: string | null;
  tableId?: string | null;
  items: ServiceMetricsItem[];
};

export type ServidosArchiveToggleProps = {
  count: number;
  open: boolean;
  onToggle: () => void;
};

export type ListosPanelToggleProps = ServidosArchiveToggleProps;

export default function ServiceMetricsBar({
  scope,
  selectedOperationStationId,
  servidosArchiveToggle,
  listosPanelToggle,
  variant = "default",
}: {
  scope: ServiceScope;
  /** Mismo valor que el selector KDS; por defecto todas las estaciones del scope. */
  selectedOperationStationId?: string;
  servidosArchiveToggle?: ServidosArchiveToggleProps;
  /** Cocina Fase 2: abre panel secundario de líneas prepared (Listo / Servir). */
  listosPanelToggle?: ListosPanelToggleProps;
  /** Cocina: una fila compacta operativa (En prod. / Listos / Servidos / Crít.). */
  variant?: "default" | "kitchenCompact";
}) {
  const { restaurantId, ready: authReady, user } = useAuth();
  const { matchesOrder } = useOperationFilter();
  const [orders, setOrders] = useState<MetricsOrder[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (variant !== "kitchenCompact") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, [variant]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) return;
    const q = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
    );
    const unsub = onSnapshot(q, (snap) => {
      const next: MetricsOrder[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        if (!isOrderActiveForMetrics(data.status)) continue;
        const arr = Array.isArray(data.items) ? data.items : [];
        const items: ServiceMetricsItem[] = [];
        for (const raw of arr) {
          if (!raw || typeof raw !== "object") continue;
          items.push(raw as ServiceMetricsItem);
        }
        next.push({
          waiterId:
            typeof data.waiterId === "string"
              ? (data.waiterId as string)
              : null,
          tableId:
            typeof data.tableId === "string" ? (data.tableId as string) : null,
          items,
        });
      }
      setOrders(next);
    }, (err) => {
      console.error(err);
      logFirestorePermissionError(
        {
          file: "components/kds/service-metrics-bar.tsx",
          op: "onSnapshot",
          path: `orders (where restaurantId==${restaurantId})`,
          restaurantId,
          uid: user?.uid ?? null,
          email: user?.email ?? null,
        },
        err,
      );
    });
    return () => unsub();
  }, [authReady, restaurantId, user]);

  const metrics = useMemo(() => {
    const items: ServiceMetricsItem[] = [];
    for (const o of orders) {
      if (!matchesOrder(o)) continue;
      for (const it of o.items) items.push(it);
    }
    return computeServiceMetrics(
      items,
      scope,
      selectedOperationStationId,
    );
  }, [orders, scope, matchesOrder, selectedOperationStationId]);

  const scopedItems = useMemo(() => {
    const items: ServiceMetricsItem[] = [];
    for (const o of orders) {
      if (!matchesOrder(o)) continue;
      for (const it of o.items) items.push(it);
    }
    return items;
  }, [orders, matchesOrder]);

  const kitchenCriticalCount = useMemo(() => {
    if (variant !== "kitchenCompact" || scope !== "kitchen") return 0;
    return countKitchenSlaSentLines(
      scopedItems,
      nowMs,
      "critical",
      selectedOperationStationId,
    );
  }, [variant, scope, scopedItems, nowMs, selectedOperationStationId]);

  if (variant === "kitchenCompact" && scope === "kitchen") {
    const detailsLabel = detailsOpen
      ? "Ocultar métricas secundarias"
      : "Ver T prep, T serv y otras métricas";

    return (
      <section
        className="hostly-kds-kitchen-metrics-strip"
        aria-label="Resumen operativo de cocina"
      >
        <div className="hostly-kds-kitchen-metrics-row">
          <CompactKitchenKpi
            label="En prod."
            value={metrics.sent}
            tone="info"
          />
          <CompactKitchenKpi
            label="Listos"
            value={metrics.prepared}
            tone="warning"
          />
          <CompactKitchenKpi
            label="Servidos"
            value={metrics.served}
            tone="success"
          />
          <CompactKitchenKpi
            label="Críticos"
            value={kitchenCriticalCount}
            tone="danger"
          />
          <HostlyButton
            variant="icon"
            className="hostly-kds-kitchen-metrics-details-btn"
            aria-expanded={detailsOpen}
            iconOnlyLabel={detailsLabel}
            title={detailsLabel}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {detailsOpen ? "▴" : "⋯"}
          </HostlyButton>
          {listosPanelToggle ? (
            <HostlyButton
              variant="chip"
              aria-expanded={listosPanelToggle.open}
              aria-controls="kds-prepared-panel"
              title={
                listosPanelToggle.open
                  ? "Ocultar platos listos"
                  : "Ver platos listos para servir"
              }
              onClick={() => listosPanelToggle.onToggle()}
              className={`hostly-kds-kitchen-listos-btn${
                listosPanelToggle.open ? " is-open" : ""
              }`}
            >
              Listos · {listosPanelToggle.count}
            </HostlyButton>
          ) : null}
          {servidosArchiveToggle ? (
            <HostlyButton
              variant="chip"
              aria-expanded={servidosArchiveToggle.open}
              aria-controls="kds-served-archive-panel"
              title={
                servidosArchiveToggle.open
                  ? "Cerrar histórico de servidos"
                  : "Ver histórico de servidos"
              }
              onClick={() => servidosArchiveToggle.onToggle()}
              className={`hostly-kds-kitchen-servidos-btn${
                servidosArchiveToggle.open ? " is-open" : ""
              }`}
            >
              Servidos · {servidosArchiveToggle.count}
            </HostlyButton>
          ) : null}
        </div>
        {detailsOpen ? (
          <div
            className="hostly-kds-kitchen-metrics-details"
            role="region"
            aria-label="Métricas secundarias"
          >
            <span>T prep {formatAvgMinutes(metrics.avgPrepMinutes)}</span>
            <span aria-hidden>·</span>
            <span>T serv {formatAvgMinutes(metrics.avgServeMinutes)}</span>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="hostly-mobile-section !px-[var(--hostly-mobile-pad-x)] !py-2 md:!py-2"
      aria-label="Métricas de servicio"
    >
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
          <MetricKpi label="Enviados" value={metrics.sent} variant="info" />
          <MetricKpi label="Prep." value={metrics.prepared} variant="warning" />
          {servidosArchiveToggle ? null : (
            <MetricKpi label="Servidos" value={metrics.served} variant="success" />
          )}
          <MetricKpi
            label="T prep"
            value={formatAvgMinutes(metrics.avgPrepMinutes)}
            variant="neutral"
          />
          <MetricKpi
            label="T serv"
            value={formatAvgMinutes(metrics.avgServeMinutes)}
            variant="neutral"
          />
        </div>
        {servidosArchiveToggle ? (
          <HostlyButton
            variant="secondary"
            size="touch"
            aria-expanded={servidosArchiveToggle.open}
            aria-controls="kds-served-archive-panel"
            title={
              servidosArchiveToggle.open
                ? "Cerrar histórico de servidos"
                : "Ver histórico de servidos"
            }
            onClick={() => servidosArchiveToggle.onToggle()}
            className={`!h-auto min-h-9 shrink-0 self-center !px-3 !py-2 !text-[13px] sm:self-stretch ${
              servidosArchiveToggle.open
                ? "!border-emerald-300 !bg-[var(--hostly-success-soft)] !text-emerald-950"
                : ""
            }`}
          >
            <span className="font-semibold">Servidos</span>
            <span className="tabular-nums">· {servidosArchiveToggle.count}</span>
            {servidosArchiveToggle.open ? (
              <span className="text-[15px] font-extrabold leading-none opacity-80" aria-hidden>
                ✕
              </span>
            ) : null}
          </HostlyButton>
        ) : null}
      </div>
    </section>
  );
}