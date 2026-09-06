"use client";

import { useCallback, useEffect, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyButton } from "@/components/ui/hostly/HostlyButton";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type {
  OperationalCommunicationAudience,
  OperationalCommunicationPolicy,
} from "@/lib/operations/operational-communications";

type Delivery = {
  id: string;
  stage: string;
  channel: string;
  status: string;
  attemptCount: number;
  sentAtMs: number | null;
  updatedAtMs: number;
  errorCode: string | null;
};

type Payload = {
  ok: true;
  policy: OperationalCommunicationPolicy;
  history: Delivery[];
  providers: {
    push: boolean;
    email: boolean;
    whatsapp: false;
    sms: false;
    vapidKeyConfigured: boolean;
  };
};

const STAGES = [
  ["attention", "Atención", "Primer aviso operativo"],
  ["critical", "Crítica", "El retraso ya requiere intervención"],
  ["escalated", "Escalada", "La incidencia sigue sin resolverse"],
] as const;

function stageLabel(stage: string) {
  return stage === "escalated" ? "Escalada" : stage === "critical" ? "Crítica" : "Atención";
}

function channelLabel(channel: string) {
  return channel === "email" ? "Email" : channel === "push" ? "Push" : channel;
}

function statusLabel(status: string) {
  if (status === "sent") return "Enviado";
  if (status === "failed") return "Fallido";
  if (status === "sending") return "Enviando";
  return status || "—";
}

export default function OperationalCommunicationsPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<OperationalCommunicationPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await authenticatedApiFetch("/api/operations/communications", { cache: "no-store" });
    const data = await response.json().catch(() => null) as Payload | { ok?: false; error?: string } | null;
    if (!response.ok || !data || data.ok !== true) {
      setError(data && "error" in data ? String(data.error) : "No se pudo cargar la configuración");
      return;
    }
    setPayload(data);
    setDraft(data.policy);
    setError(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateRule = useCallback((
    stage: "attention" | "critical" | "escalated",
    key: "audience" | "push" | "email",
    value: OperationalCommunicationAudience | boolean,
  ) => {
    setDraft((current) => current ? {
      ...current,
      [stage]: { ...current[stage], [key]: value },
    } : current);
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const response = await authenticatedApiFetch("/api/operations/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: draft }),
      });
      const data = await response.json().catch(() => null) as { ok?: boolean; policy?: OperationalCommunicationPolicy; error?: string } | null;
      if (!response.ok || data?.ok !== true || !data.policy) {
        throw new Error(data?.error || "No se pudo guardar la configuración");
      }
      setDraft(data.policy);
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la configuración");
    } finally {
      setBusy(false);
    }
  }, [draft, refresh]);

  return (
    <ModulePageShell
      title="Comunicaciones operativas"
      subtitle="Decide quién recibe cada alerta y por qué canal, sin duplicados"
      maxWidth={1180}
      compactLayout
      operationalFocus
      shellSurface="configLight"
    >
      <div className="grid gap-4">
        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">Enrutado inteligente</h2>
              <p className="text-sm font-medium text-slate-600">Hostly aplica estas reglas sobre los avisos operativos ya configurados. Un envío queda registrado una sola vez por incidencia, etapa, canal y destinatario.</p>
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-800">
              <input
                type="checkbox"
                checked={draft?.enabled === true}
                onChange={(event) => setDraft((current) => current ? { ...current, enabled: event.target.checked } : current)}
              />
              Comunicaciones automáticas
            </label>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {STAGES.map(([stage, label, description]) => {
              const rule = draft?.[stage];
              return (
                <article key={stage} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <h3 className="font-extrabold text-slate-950">{label}</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{description}</p>
                  <label className="mt-3 block text-xs font-extrabold uppercase tracking-wide text-slate-500">Destinatarios</label>
                  <select
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900"
                    value={rule?.audience ?? "supervisors"}
                    onChange={(event) => updateRule(stage, "audience", event.target.value as OperationalCommunicationAudience)}
                  >
                    <option value="supervisors">Responsables con supervisión</option>
                    <option value="managers">Gerencia</option>
                  </select>
                  <div className="mt-3 grid gap-2">
                    <label className="flex min-h-11 items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800">
                      <span>Push {payload?.providers.push ? "" : "· proveedor pendiente"}</span>
                      <input type="checkbox" checked={rule?.push === true} disabled={payload?.providers.push !== true} onChange={(event) => updateRule(stage, "push", event.target.checked)} />
                    </label>
                    <label className="flex min-h-11 items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800">
                      <span>Email {payload?.providers.email ? "" : "· proveedor pendiente"}</span>
                      <input type="checkbox" checked={rule?.email === true} disabled={payload?.providers.email !== true} onChange={(event) => updateRule(stage, "email", event.target.checked)} />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-500">WhatsApp y SMS siguen bloqueados hasta disponer de proveedor, consentimiento y política de uso.</p>
            <HostlyButton variant="primary" size="compact" onClick={() => void save()} disabled={!draft || busy}>{busy ? "Guardando…" : "Guardar comunicaciones"}</HostlyButton>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Historial de comunicaciones">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-extrabold text-slate-950">Entregas recientes</h2><p className="text-sm font-medium text-slate-600">Trazabilidad del último envío, reintentos y fallos de proveedor.</p></div>
            <HostlyButton variant="secondary" size="compact" onClick={() => void refresh()} disabled={busy}>Actualizar</HostlyButton>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">Etapa</th><th className="py-2 pr-4">Canal</th><th className="py-2 pr-4">Estado</th><th className="py-2 pr-4">Intentos</th><th className="py-2">Actualización</th></tr></thead>
              <tbody>
                {payload?.history.map((delivery) => (
                  <tr key={delivery.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-bold text-slate-900">{stageLabel(delivery.stage)}</td>
                    <td className="py-2 pr-4 text-slate-700">{channelLabel(delivery.channel)}</td>
                    <td className={delivery.status === "failed" ? "py-2 pr-4 font-bold text-red-700" : "py-2 pr-4 text-slate-700"}>{statusLabel(delivery.status)}{delivery.errorCode ? ` · ${delivery.errorCode}` : ""}</td>
                    <td className="py-2 pr-4 text-slate-700">{delivery.attemptCount}</td>
                    <td className="py-2 text-slate-600">{delivery.updatedAtMs ? new Date(delivery.updatedAtMs).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                  </tr>
                ))}
                {payload && payload.history.length === 0 && <tr><td colSpan={5} className="border-t border-slate-100 py-5 text-center text-sm font-semibold text-slate-500">Todavía no hay entregas registradas.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </ModulePageShell>
  );
}
