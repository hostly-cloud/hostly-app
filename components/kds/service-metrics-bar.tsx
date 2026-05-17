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
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { logFirestorePermissionError } from "@/lib/firestore/log-firestore-permission-error";
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
  variant: "info" | "warning" | "success" | "neutral";
}) {
  const mod =
    variant === "info"
      ? "hostly-mobile-kpi--info"
      : variant === "warning"
        ? "hostly-mobile-kpi--warning"
        : variant === "success"
          ? "hostly-mobile-kpi--success"
          : "hostly-mobile-kpi--neutral";
  return (
    <div className={`hostly-mobile-kpi !p-2 ${mod}`}>
      <div className="hostly-mobile-kpi__label !text-[9px]">{label}</div>
      <div className="hostly-mobile-kpi__value !mt-0.5 !text-[15px]">{value}</div>
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

export default function ServiceMetricsBar({
  scope,
  servidosArchiveToggle,
}: {
  scope: ServiceScope;
  servidosArchiveToggle?: ServidosArchiveToggleProps;
}) {
  const { restaurantId, ready: authReady, user } = useAuth();
  const { matchesOrder } = useOperationFilter();
  const [orders, setOrders] = useState<MetricsOrder[]>([]);

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
    return computeServiceMetrics(items, scope);
  }, [orders, scope, matchesOrder]);

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
          <button
            type="button"
            aria-expanded={servidosArchiveToggle.open}
            aria-controls="kds-served-archive-panel"
            title={
              servidosArchiveToggle.open
                ? "Cerrar histórico de servidos"
                : "Ver histórico de servidos"
            }
            onClick={() => servidosArchiveToggle.onToggle()}
            className={`hostly-button-secondary !h-auto min-h-9 shrink-0 self-center !px-3 !py-2 !text-[13px] sm:self-stretch ${
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
          </button>
        ) : null}
      </div>
    </section>
  );
}
