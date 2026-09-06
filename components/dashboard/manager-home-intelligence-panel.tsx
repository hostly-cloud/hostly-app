"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BrainCircuit, CircleAlert, Sparkles } from "lucide-react";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type {
  ManagerAnalyticsGenerationResponse,
  ManagerAnalyticsResult,
  ManagerAnalyticsSeverity,
} from "@/lib/ai/manager-analytics-types";

const SEVERITY_CLASS: Record<ManagerAnalyticsSeverity, string> = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-900",
  neutral: "border-slate-200 bg-slate-50 text-slate-800",
  watch: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-rose-200 bg-rose-50 text-rose-900",
};

function money(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function ManagerHomeIntelligencePanel() {
  const [result, setResult] = useState<ManagerAnalyticsResult | null>(null);
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authenticatedApiFetch("/api/ai/manager-home", {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as ManagerAnalyticsGenerationResponse | null;
        if (!response.ok || !data || data.ok !== true) {
          if (!cancelled) setFailed(true);
          return;
        }
        if (!cancelled) {
          setEntitled(data.entitled);
          setResult("result" in data ? data.result : null);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const topSignals = useMemo(() => result?.report.signals.slice(0, 3) ?? [], [result]);
  const firstAction = result?.report.actions[0] ?? null;

  if (failed) return null;

  if (entitled === false) {
    return (
      <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-violet-100 p-2 text-violet-700">
            <BrainCircuit size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-700">Hostly Pro</p>
            <h2 className="mt-1 text-base font-black text-slate-950">Home inteligente para gerentes</h2>
            <p className="mt-1 text-sm font-medium leading-5 text-slate-600">
              Prioriza automáticamente ventas, reservas y presión operativa para enseñarte qué necesita atención primero.
            </p>
          </div>
          <Link href="/dashboard/analisis" className="shrink-0 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700">
            Ver Analytics
          </Link>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm">
        Preparando el resumen inteligente de hoy…
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-sky-200 bg-gradient-to-br from-white via-white to-sky-50 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-xl bg-sky-100 p-2 text-sky-700">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sky-700">Resumen de hoy</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">{result.report.headline}</h2>
            <p className="mt-1 max-w-3xl text-sm font-medium leading-5 text-slate-600">{result.report.summary}</p>
          </div>
        </div>
        <Link href="/dashboard/analisis" className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
          Profundizar con IA <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Ventas</p>
          <p className="mt-1 text-xl font-black text-slate-950">{money(result.context.sales.total)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Cobros</p>
          <p className="mt-1 text-xl font-black text-slate-950">{result.context.sales.payments}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Reservas</p>
          <p className="mt-1 text-xl font-black text-slate-950">{result.context.reservations.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Comandas activas</p>
          <p className="mt-1 text-xl font-black text-slate-950">{result.context.operations.activeOrders}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        {topSignals.map((signal) => (
          <article key={signal.key} className={`rounded-xl border p-3 ${SEVERITY_CLASS[signal.severity]}`}>
            <div className="flex items-start gap-2">
              {signal.severity === "critical" || signal.severity === "watch" ? (
                <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              ) : (
                <Sparkles size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              )}
              <div>
                <p className="text-sm font-black">{signal.title}</p>
                <p className="mt-1 text-xs font-semibold leading-5 opacity-80">{signal.evidence}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      {firstAction && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Primera acción recomendada</p>
            <p className="mt-1 text-sm font-black text-slate-950">{firstAction.title}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{firstAction.reason}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">
            {firstAction.priority === "high" ? "Alta" : firstAction.priority === "medium" ? "Media" : "Seguimiento"}
          </span>
        </div>
      )}
    </section>
  );
}
