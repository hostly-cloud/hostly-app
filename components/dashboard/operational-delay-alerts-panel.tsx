"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-context";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { logFirestorePermissionError } from "@/lib/firestore/log-firestore-permission-error";
import {
  buildOperationalDelayAlerts,
  type OperationalOrderRecord,
} from "@/lib/operations/operational-delay-alerts";

function formatElapsed(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function OperationalDelayAlertsPanel() {
  const { user, restaurantId, ready } = useAuth();
  const [orders, setOrders] = useState<OperationalOrderRecord[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!ready || !restaurantId || !isFirebaseConfigured) {
      setOrders([]);
      return;
    }
    const ordersQuery = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
    );
    return onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOrders(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<OperationalOrderRecord, "id">),
          })),
        );
      },
      (error) => {
        console.error(error);
        logFirestorePermissionError(
          {
            file: "components/dashboard/operational-delay-alerts-panel.tsx",
            op: "onSnapshot",
            path: `orders (where restaurantId==${restaurantId})`,
            restaurantId,
            uid: user?.uid ?? null,
            email: user?.email ?? null,
          },
          error,
        );
      },
    );
  }, [ready, restaurantId, user]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const alerts = useMemo(
    () =>
      restaurantId
        ? buildOperationalDelayAlerts({ orders, restaurantId, nowMs })
        : [],
    [orders, restaurantId, nowMs],
  );

  if (!ready || !restaurantId || alerts.length === 0) return null;
  const criticalCount = alerts.filter((alert) => alert.level === "critical").length;

  return (
    <section aria-label="Alertas operativas" className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-amber-800">Alertas operativas</p>
          <h2 className="mt-1 text-lg font-extrabold text-slate-950">
            {criticalCount > 0
              ? `${criticalCount} retraso${criticalCount === 1 ? " crítico" : "s críticos"}`
              : "Servicio con atención pendiente"}
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Prioridad calculada con los mismos tiempos SLA que Cocina, Barra y Coctelería.
          </p>
        </div>
        <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-bold text-amber-900">
          {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        {alerts.slice(0, 6).map((alert) => (
          <Link
            key={alert.id}
            href={alert.stationHref}
            className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-white/80 bg-white px-3 py-2.5 shadow-sm transition hover:border-slate-300"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-extrabold text-slate-950">{alert.tableLabel}</span>
                <span className={alert.level === "critical"
                  ? "rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-red-800"
                  : "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-800"}
                >
                  {alert.level === "critical" ? "Crítico" : "Atención"}
                </span>
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-slate-600">
                {alert.stationLabel} · {alert.delayedLineCount} {alert.delayedLineCount === 1 ? "línea retrasada" : "líneas retrasadas"}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-extrabold text-slate-950">{formatElapsed(alert.elapsedMinutes)}</span>
              <span className="block text-[11px] font-semibold text-slate-500">desde {alert.thresholdMinutes} min</span>
            </span>
          </Link>
        ))}
      </div>
      {alerts.length > 6 && (
        <p className="mt-3 text-xs font-semibold text-slate-600">
          Hay {alerts.length - 6} alertas adicionales en las pantallas operativas.
        </p>
      )}
    </section>
  );
}
