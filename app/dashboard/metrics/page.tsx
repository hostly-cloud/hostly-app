"use client";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import ModulePageShell from "@/components/module-page-shell";
import {
  HostlyAlert,
  HostlyButton,
  HostlyInput,
  HostlyKpiCard,
  HostlyLoadingState,
  HostlyOperationalEmptyState,
  HostlyPermissionState,
  HostlySectionHeader,
  HostlyStatusBadge,
  HostlySurface,
} from "@/components/ui/hostly";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { logFirestorePermissionError } from "@/lib/firestore/log-firestore-permission-error";
import {
  buildServiceDashboardMetrics,
  type ServiceDashboardOrder,
} from "@/lib/operacion/service-dashboard-metrics";
import {
  formatAvgMinutes,
  type ServiceMetricsItem,
} from "@/lib/operacion/service-metrics";

type SourceState = "loading" | "ready" | "error";

type SourceSnapshot = {
  state: SourceState;
  restaurantId: string | null;
};

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function readOrder(documentId: string, data: Record<string, unknown>): ServiceDashboardOrder {
  const items: ServiceMetricsItem[] = [];
  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      if (item && typeof item === "object") items.push(item as ServiceMetricsItem);
    }
  }

  return {
    id: documentId,
    createdAt: data.createdAt,
    tableId:
      typeof data.tableId === "string"
        ? data.tableId
        : data.tableId === null
          ? null
          : undefined,
    tableName:
      typeof data.tableName === "string"
        ? data.tableName
        : data.tableName === null
          ? null
          : undefined,
    items,
  };
}

export default function MetricsPage() {
  const router = useRouter();
  const { restaurantId, ready: authReady, user } = useAuth();
  const [orders, setOrders] = useState<ServiceDashboardOrder[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [sourceSnapshot, setSourceSnapshot] = useState<SourceSnapshot>({
    state: "loading",
    restaurantId: null,
  });
  const [retryKey, setRetryKey] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const previousDelayedCount = useRef<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) return;

    const ordersQuery = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
    );
    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOrders(snapshot.docs.map((row) => readOrder(row.id, row.data())));
        setSourceSnapshot({ state: "ready", restaurantId });
      },
      (error) => {
        setOrders([]);
        setSourceSnapshot({ state: "error", restaurantId });
        logFirestorePermissionError(
          {
            file: "app/dashboard/metrics/page.tsx",
            op: "onSnapshot",
            path: "orders (tenant scope)",
            restaurantId,
            uid: user?.uid ?? null,
            email: user?.email ?? null,
          },
          error,
        );
      },
    );

    return () => unsubscribe();
  }, [authReady, restaurantId, retryKey, user]);

  const metrics = useMemo(
    () => buildServiceDashboardMetrics(orders, selectedDate, nowMs),
    [orders, selectedDate, nowMs],
  );
  const selectedIsToday = isSameLocalDay(selectedDate, new Date(nowMs));
  const sourceState: SourceState | "missing-restaurant" = !authReady
    ? "loading"
    : !isFirebaseConfigured
      ? "error"
      : !restaurantId
        ? "missing-restaurant"
        : sourceSnapshot.restaurantId !== restaurantId
          ? "loading"
          : sourceSnapshot.state;

  useEffect(() => {
    if (sourceState !== "ready") return;
    if (
      selectedIsToday &&
      previousDelayedCount.current === 0 &&
      metrics.delayedLineCount > 0
    ) {
      void new Audio("/alert.mp3").play().catch(() => {});
    }
    previousDelayedCount.current = metrics.delayedLineCount;
  }, [metrics.delayedLineCount, selectedIsToday, sourceState]);

  return (
    <ModulePageShell
      title="Métricas"
      subtitle="Tiempos reales de preparación y servicio"
      maxWidth={1180}
      compactLayout
    >
      <div className="hostly-service-metrics">
        <div className="hostly-service-metrics__toolbar">
          <HostlyInput
            className="hostly-service-metrics__date"
            type="date"
            aria-label="Fecha de las métricas"
            value={toDateInputValue(selectedDate)}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              const [year, month, day] = value.split("-").map(Number);
              setSelectedDate(new Date(year, month - 1, day));
            }}
          />
        </div>

        {sourceState === "loading" ? (
          <HostlyLoadingState embedded label="Cargando métricas del servicio…" />
        ) : null}

        {sourceState === "missing-restaurant" ? (
          <HostlyPermissionState embedded title="Selecciona un restaurante">
            Las métricas se muestran únicamente para el restaurante activo.
          </HostlyPermissionState>
        ) : null}

        {sourceState === "error" ? (
          <HostlyAlert tone="danger" title="No se han podido cargar las métricas">
            <p>No mostramos ceros porque la fuente de datos no está disponible.</p>
            <HostlyButton
              variant="secondary"
              className="hostly-button-compact mt-3"
              onClick={() => {
                setSourceSnapshot({ state: "loading", restaurantId: restaurantId ?? null });
                setRetryKey((value) => value + 1);
              }}
            >
              Reintentar
            </HostlyButton>
          </HostlyAlert>
        ) : null}

        {sourceState === "ready" && metrics.lineCount === 0 ? (
          <HostlyOperationalEmptyState
            title="Sin comandas enviadas en esta fecha"
            text="Las métricas aparecerán cuando haya líneas enviadas a preparación."
            hints={["Los borradores del TPV y los pedidos todavía no enviados no se contabilizan."]}
            primaryAction={{ label: "Abrir TPV", href: "/dashboard/operacion/tpv" }}
          />
        ) : null}

        {sourceState === "ready" && metrics.lineCount > 0 ? (
          <>
            {metrics.delayedLineCount > 0 ? (
              <HostlyAlert
                tone="danger"
                title={`${metrics.delayedLineCount} ${
                  metrics.delayedLineCount === 1 ? "línea con retraso" : "líneas con retraso"
                }`}
              >
                {selectedIsToday
                  ? "Llevan más de 20 minutos en preparación."
                  : "Superaron los 20 minutos de preparación en la fecha seleccionada."}
              </HostlyAlert>
            ) : null}

            <div className="hostly-kpi-grid-unified hostly-service-metrics__kpis">
              <HostlyKpiCard
                title="Comandas"
                value={metrics.orderCount}
                helper={`${metrics.lineCount} líneas enviadas`}
              />
              <HostlyKpiCard
                title="En preparación"
                value={metrics.sent}
                helper={`${metrics.prepared} listas · ${metrics.served} servidas`}
              />
              <HostlyKpiCard
                title="Tiempo de preparación"
                value={formatAvgMinutes(metrics.avgPrepMinutes)}
                helper="Desde envío hasta lista"
              />
              <HostlyKpiCard
                title="Con retraso"
                value={metrics.delayedLineCount}
                helper="Más de 20 minutos"
                variant={metrics.delayedLineCount > 0 ? "soft" : "ice"}
              />
            </div>

            <div className="hostly-service-metrics__details">
              <HostlySurface variant="flat" className="hostly-service-metrics__panel">
                <HostlySectionHeader
                  title="Comandas con retraso"
                  description={
                    selectedIsToday
                      ? "Líneas aún en preparación durante más de 20 minutos"
                      : "Líneas que tardaron más de 20 minutos en estar listas"
                  }
                />
                {metrics.delayedOrders.length > 0 ? (
                  <div className="hostly-service-metrics__rows">
                    {metrics.delayedOrders.map((row) => (
                      <button
                        key={row.orderId}
                        type="button"
                        className="hostly-service-metrics__row"
                        title="Abrir la comanda en el TPV"
                        onClick={() => {
                          const params = new URLSearchParams({ orderId: row.orderId });
                          if (row.tableId) params.set("tableId", row.tableId);
                          router.push(`/dashboard/operacion/tpv?${params.toString()}`);
                        }}
                      >
                        <span>{row.tableName}</span>
                        <HostlyStatusBadge tone="danger">
                          {row.delayedLines} {row.delayedLines === 1 ? "línea" : "líneas"} · {row.maxDelayMinutes} min
                        </HostlyStatusBadge>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="hostly-service-metrics__empty">Sin retrasos en esta fecha.</p>
                )}
              </HostlySurface>

              <HostlySurface variant="flat" className="hostly-service-metrics__panel">
                <HostlySectionHeader
                  title="Mesas con mayor tiempo"
                  description="Promedio real desde el envío hasta la preparación"
                />
                {metrics.slowestTables.length > 0 ? (
                  <ol className="hostly-service-metrics__ranking">
                    {metrics.slowestTables.map((row) => (
                      <li key={row.tableName}>
                        <span>{row.tableName}</span>
                        <strong>
                          {row.avgPrepMinutes} min · {row.completedLines} líneas
                        </strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="hostly-service-metrics__empty">
                    Todavía no hay líneas con tiempo de preparación completo.
                  </p>
                )}
              </HostlySurface>
            </div>
          </>
        ) : null}
      </div>
    </ModulePageShell>
  );
}
