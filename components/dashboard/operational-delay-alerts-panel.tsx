"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { useI18n } from "@/components/i18n-provider";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type { OperationalDelayAlert } from "@/lib/operations/operational-delay-alerts";
import { fillCopy, OPERATIONAL_ALERTS_COPY } from "@/locales/operational-alerts-copy";

type CenterAlert = OperationalDelayAlert & {
  incidentId: string;
  incidentStatus: "open" | "acknowledged" | "snoozed" | "resolved" | "auto_resolved";
  snoozedUntilMs: number | null;
};

function formatElapsed(minutes: number, nowLabel: string): string {
  if (!Number.isFinite(minutes) || minutes < 1) return nowLabel;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function OperationalDelayAlertsPanel() {
  const { ready, restaurantId } = useAuth();
  const { locale } = useI18n();
  const copy = OPERATIONAL_ALERTS_COPY[locale];
  const [snapshot, setSnapshot] = useState<{
    restaurantId: string;
    alerts: CenterAlert[];
  } | null>(null);

  useEffect(() => {
    if (!ready || !restaurantId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await authenticatedApiFetch("/api/operations/alerts?summary=1", { cache: "no-store" });
        const payload = await response.json().catch(() => null) as { ok?: boolean; alerts?: CenterAlert[] } | null;
        if (!cancelled && response.ok && payload?.ok) {
          setSnapshot({
            restaurantId,
            alerts: Array.isArray(payload.alerts) ? payload.alerts : [],
          });
        }
      } catch (error) {
        console.error("[operational-alerts-panel] summary failed", error);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [ready, restaurantId]);

  const alerts = snapshot?.restaurantId === restaurantId ? snapshot.alerts : [];
  if (!ready || !restaurantId || alerts.length === 0) return null;
  const criticalCount = alerts.filter((alert) => alert.level === "critical").length;
  const escalatedCount = alerts.filter((alert) => alert.escalated).length;

  const localizedStationLabel = (label: string) => {
    const normalized = label.trim().toLowerCase();
    if (normalized === "cocina" || normalized === "kitchen") return copy.stationKitchen;
    if (normalized === "barra" || normalized === "bar") return copy.stationBar;
    if (normalized === "coctelería" || normalized === "cocteleria" || normalized === "cocktails" || normalized === "cocktail") return copy.stationCocktail;
    return label;
  };

  const summary = escalatedCount > 0
    ? escalatedCount === 1
      ? copy.escalatedOne
      : fillCopy(copy.escalatedMany, { count: escalatedCount })
    : criticalCount > 0
      ? criticalCount === 1
        ? copy.criticalOne
        : fillCopy(copy.criticalMany, { count: criticalCount })
      : copy.attentionPending;

  return (
    <section aria-label={copy.aria} className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-amber-800">{copy.title}</p>
          <h2 className="mt-1 text-lg font-extrabold text-slate-950">{summary}</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">{copy.policyHint}</p>
        </div>
        <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-bold text-amber-900">
          {alerts.length} {alerts.length === 1 ? copy.alertOne : copy.alertMany}
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        {alerts.slice(0, 6).map((alert) => (
          <Link
            key={alert.incidentId}
            href={alert.stationHref}
            className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-white/80 bg-white px-3 py-2.5 shadow-sm transition hover:border-slate-300"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-extrabold text-slate-950">{alert.tableLabel}</span>
                <span className={alert.escalated
                  ? "rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-red-800"
                  : alert.level === "critical"
                    ? "rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-orange-800"
                    : "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-800"}
                >
                  {alert.escalated ? copy.escalated : alert.level === "critical" ? copy.critical : copy.attention}
                </span>
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-slate-600">
                {localizedStationLabel(alert.stationLabel)} · {alert.delayedLineCount} {alert.delayedLineCount === 1 ? copy.delayedLineOne : copy.delayedLineMany}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-extrabold text-slate-950">{formatElapsed(alert.elapsedMinutes, copy.now)}</span>
              <span className="block text-[11px] font-semibold text-slate-500">{fillCopy(copy.since, { minutes: alert.thresholdMinutes })}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {alerts.length > 6 ? <p className="text-xs font-semibold text-slate-600">{copy.extraPrefix} {alerts.length - 6} {copy.extraSuffix}</p> : <span />}
        <Link href="/dashboard/operacion/activity/alerts" className="text-xs font-extrabold text-blue-700 hover:underline">{copy.openCenter}</Link>
      </div>
    </section>
  );
}
