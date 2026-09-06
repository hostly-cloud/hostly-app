"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, CircleAlert, Lightbulb, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { HostlyButton } from "@/components/ui/hostly/HostlyButton";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type {
  ManagerAnalyticsGenerationResponse,
  ManagerAnalyticsResult,
  ManagerAnalyticsSeverity,
} from "@/lib/ai/manager-analytics-types";

const SEVERITY_COPY: Record<ManagerAnalyticsSeverity, string> = {
  positive: "Va bien",
  neutral: "Estable",
  watch: "Vigilar",
  critical: "Prioridad",
};

const SEVERITY_CLASS: Record<ManagerAnalyticsSeverity, string> = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-900",
  neutral: "border-slate-200 bg-slate-50 text-slate-800",
  watch: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-rose-200 bg-rose-50 text-rose-900",
};

function formatGeneratedAt(ms: number): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(ms));
}

function errorCopy(code: string): string {
  if (code === "ANALYTICS_RANGE_TOO_LARGE") return "Analytics IA admite periodos de hasta 31 días. Acorta el rango y vuelve a analizar.";
  if (code === "MANAGER_ANALYTICS_PRO_REQUIRED") return "Analytics IA está incluido en Pro y Ultra.";
  if (code === "MANAGER_ANALYTICS_ROLE_REQUIRED") return "Analytics IA está disponible para gerentes y administradores.";
  return "No se pudo generar el análisis inteligente. Puedes seguir usando las métricas normales de Hostly.";
}

export function ManagerAnalyticsAiPanel({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [access, setAccess] = useState<Extract<ManagerAnalyticsGenerationResponse, { ok: true }> | null>(null);
  const [result, setResult] = useState<ManagerAnalyticsResult | null>(null);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingAccess(true);
      try {
        const response = await authenticatedApiFetch("/api/ai/manager-analytics", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as ManagerAnalyticsGenerationResponse | null;
        if (!response.ok || !data || data.ok !== true) {
          if (!cancelled) setError(data && data.ok === false ? errorCopy(data.error) : "No se pudo comprobar Analytics IA.");
          return;
        }
        if (!cancelled) {
          setAccess(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("No se pudo comprobar Analytics IA.");
      } finally {
        if (!cancelled) setLoadingAccess(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [dateFrom, dateTo]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await authenticatedApiFetch("/api/ai/manager-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const data = (await response.json().catch(() => null)) as ManagerAnalyticsGenerationResponse | null;
      if (!response.ok || !data || data.ok !== true || !("result" in data)) {
        throw new Error(data && data.ok === false ? data.error : "MANAGER_ANALYTICS_FAILED");
      }
      setAccess(data);
      setResult(data.result);
    } catch (generationError) {
      setError(errorCopy(generationError instanceof Error ? generationError.message : "MANAGER_ANALYTICS_FAILED"));
    } finally {
      setGenerating(false);
    }
  }, [dateFrom, dateTo]);

  const trend = useMemo(() => {
    const delta = result?.context.sales.deltaPercent;
    if (delta == null || delta === 0) return null;
    return delta > 0 ? <TrendingUp size={17} aria-hidden="true" /> : <TrendingDown size={17} aria-hidden="true" />;
  }, [result]);

  if (loadingAccess) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm">Preparando Analytics IA…</section>;
  }

  if (access && !access.entitled) {
    return (
      <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-violet-100 p-2 text-violet-700"><BrainCircuit size={20} aria-hidden="true" /></span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-700">Hostly Pro</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Analytics IA para gerentes</h2>
            <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-700">Convierte tus ventas, reservas y estado operativo en una explicación breve de qué ha cambiado, qué necesita atención y qué conviene hacer después.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-sky-200 bg-gradient-to-br from-white via-white to-sky-50 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-xl bg-sky-100 p-2 text-sky-700"><Sparkles size={20} aria-hidden="true" /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-slate-950">Analytics IA</h2>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-extrabold text-slate-600">{dateFrom} → {dateTo}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-600">Hostly interpreta el periodo contra el periodo anterior usando solo métricas verificadas del restaurante.</p>
          </div>
        </div>
        <HostlyButton variant="primary" onClick={() => void generate()} disabled={generating}>
          {generating ? "Analizando…" : result ? "Actualizar análisis" : "Analizar periodo"}
        </HostlyButton>
      </div>

      {error && <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"><CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{error}</span></div>}

      {result && (
        <div className="mt-4 grid gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-900">{trend}<h3 className="text-base font-black">{result.report.headline}</h3></div>
              <span className="text-[11px] font-bold text-slate-400">{result.source === "ai" ? "IA" : "modo de respaldo"} · {formatGeneratedAt(result.generatedAtMs)}</span>
            </div>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{result.report.summary}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {result.report.signals.map((signal) => (
              <article key={signal.key} className={`rounded-2xl border p-4 ${SEVERITY_CLASS[signal.severity]}`}>
                <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black">{signal.title}</h3><span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black uppercase tracking-wide">{SEVERITY_COPY[signal.severity]}</span></div>
                <p className="mt-2 text-sm font-semibold leading-5">{signal.detail}</p>
                <p className="mt-2 text-xs font-bold opacity-75">{signal.evidence}</p>
              </article>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2"><Lightbulb size={18} className="text-amber-600" aria-hidden="true" /><h3 className="text-sm font-black text-slate-950">Qué haría ahora</h3></div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {result.report.actions.map((action, index) => (
                <div key={`${action.title}-${index}`} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">{action.priority === "high" ? "Prioridad alta" : action.priority === "medium" ? "Prioridad media" : "Seguimiento"}</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{action.title}</p>
                  <p className="mt-1 text-sm font-medium leading-5 text-slate-600">{action.reason}</p>
                </div>
              ))}
            </div>
          </div>

          {result.context.dataQuality.alerts.length > 0 && <p className="text-xs font-semibold text-amber-700">Análisis parcial: algunas fuentes no estaban disponibles ({result.context.dataQuality.alerts.join(", ")}).</p>}
          <p className="text-[11px] font-semibold text-slate-400">La IA no modifica ventas, reservas, comandas ni configuración. Las cifras proceden de Hostly y las causas sugeridas deben verificarse antes de tomar decisiones.</p>
        </div>
      )}
    </section>
  );
}
