"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyButton } from "@/components/ui/hostly/HostlyButton";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type { OperationalDelayAlert } from "@/lib/operations/operational-delay-alerts";
import type { OperationalAlertPolicy } from "@/lib/operations/operational-alert-policy";
import {
  activateOperationalPush,
  deactivateOperationalPush,
  readOperationalPushStatus,
  type OperationalPushStatus,
} from "@/lib/operations/operational-push-client";

type IncidentStatus = "open" | "acknowledged" | "snoozed" | "resolved" | "auto_resolved";

type CenterAlert = OperationalDelayAlert & {
  incidentId: string;
  incidentStatus: IncidentStatus;
  snoozedUntilMs: number | null;
};

type Incident = {
  id: string;
  tableLabel: string;
  stationLabel: string;
  status: IncidentStatus;
  startedAtMs: number;
  updatedAtMs: number;
};

type NotificationProviders = {
  push: boolean;
  email: boolean;
  whatsapp: false;
  sms: false;
  vapidKeyConfigured: boolean;
};

type CenterPayload = {
  ok: true;
  policy: OperationalAlertPolicy;
  alerts: CenterAlert[];
  history: Incident[];
  notificationProviders: NotificationProviders;
};

const STATION_LABELS = {
  kitchen: "Cocina",
  bar: "Barra",
  cocktail: "Coctelería",
} as const;

const THRESHOLD_FIELDS = [
  ["attentionMinutes", "Atención"],
  ["criticalMinutes", "Crítico"],
  ["escalationMinutes", "+ Escalado"],
] as const;

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function statusLabel(status: IncidentStatus) {
  if (status === "acknowledged") return "Atendida";
  if (status === "snoozed") return "Silenciada";
  if (status === "resolved") return "Resuelta";
  if (status === "auto_resolved") return "Resuelta automáticamente";
  return "Abierta";
}

function channelState(enabled: boolean, available: boolean) {
  if (!available) return "Proveedor pendiente";
  return enabled ? "Activo" : "Desactivado";
}

export default function OperationalAlertCenterPage() {
  const { can } = useHostlyCapabilities();
  const [payload, setPayload] = useState<CenterPayload | null>(null);
  const [draft, setDraft] = useState<OperationalAlertPolicy | null>(null);
  const [pushStatus, setPushStatus] = useState<OperationalPushStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManageSettings = can("settings.manage");

  const refresh = useCallback(async () => {
    const response = await authenticatedApiFetch("/api/operations/alerts", { cache: "no-store" });
    const data = await response.json().catch(() => null) as CenterPayload | { ok?: false; error?: string } | null;
    if (!response.ok || !data || data.ok !== true) {
      setError(data && "error" in data ? String(data.error) : "No se pudo cargar el centro de operaciones");
      return;
    }
    setPayload(data);
    setDraft((current) => current ?? data.policy);
    setError(null);
  }, []);

  const refreshPushStatus = useCallback(async () => {
    try {
      setPushStatus(await readOperationalPushStatus());
    } catch {
      setPushStatus(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshPushStatus();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, [refresh, refreshPushStatus]);

  const criticalCount = useMemo(
    () => payload?.alerts.filter((alert) => alert.level === "critical").length ?? 0,
    [payload],
  );
  const escalatedCount = useMemo(
    () => payload?.alerts.filter((alert) => alert.escalated).length ?? 0,
    [payload],
  );

  const mutate = useCallback(async (incidentId: string, action: "acknowledge" | "snooze" | "resolve") => {
    setBusy(`${incidentId}:${action}`);
    try {
      const response = await authenticatedApiFetch("/api/operations/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, incidentId, snoozeMinutes: 5 }),
      });
      if (!response.ok) throw new Error("No se pudo actualizar la alerta");
      await refresh();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "No se pudo actualizar la alerta");
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const saveSettings = useCallback(async () => {
    if (!draft) return;
    setBusy("settings");
    try {
      const response = await authenticatedApiFetch("/api/operations/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateSettings", policy: draft }),
      });
      const data = await response.json().catch(() => null) as {
        ok?: boolean;
        policy?: OperationalAlertPolicy;
        notificationProviders?: NotificationProviders;
      } | null;
      if (!response.ok || data?.ok !== true || !data.policy) throw new Error("No se pudo guardar la configuración");
      setDraft(data.policy);
      setPayload((current) => current ? {
        ...current,
        policy: data.policy!,
        notificationProviders: data.notificationProviders ?? current.notificationProviders,
      } : current);
      setError(null);
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "No se pudo guardar la configuración");
    } finally {
      setBusy(null);
    }
  }, [draft]);

  const togglePushDevice = useCallback(async () => {
    setBusy("push-device");
    try {
      if (pushStatus?.subscribed) await deactivateOperationalPush();
      else await activateOperationalPush();
      await refreshPushStatus();
      setError(null);
    } catch (pushError) {
      setError(pushError instanceof Error ? pushError.message : "No se pudo actualizar la notificación de este dispositivo");
    } finally {
      setBusy(null);
    }
  }, [pushStatus?.subscribed, refreshPushStatus]);

  const setChannel = useCallback((channel: "push" | "email", enabled: boolean) => {
    setDraft((current) => current ? {
      ...current,
      notificationChannels: {
        ...current.notificationChannels,
        [channel]: enabled,
      },
    } : current);
  }, []);

  const providers = payload?.notificationProviders;

  return (
    <ModulePageShell title="Centro de operaciones" subtitle="Retrasos, mesas prolongadas, escalados e historial del servicio" maxWidth={1280} compactLayout operationalFocus shellSurface="configLight">
      <div className="grid gap-4">
        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div>}

        <section className="grid gap-3 md:grid-cols-3" aria-label="Resumen de alertas">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Activas</p><p className="mt-1 text-3xl font-extrabold text-slate-950">{payload?.alerts.length ?? 0}</p></div>
          <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-red-600">Críticas</p><p className="mt-1 text-3xl font-extrabold text-slate-950">{criticalCount}</p></div>
          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-amber-700">Escaladas</p><p className="mt-1 text-3xl font-extrabold text-slate-950">{escalatedCount}</p></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Alertas activas">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-extrabold text-slate-950">Servicio en curso</h2><p className="text-sm font-medium text-slate-600">Prioridad en tiempo real. Las alertas silenciadas desaparecen temporalmente.</p></div>
            <HostlyButton variant="secondary" size="compact" onClick={() => void refresh()} disabled={busy !== null}>Actualizar</HostlyButton>
          </div>
          <div className="mt-4 grid gap-3">
            {payload && payload.alerts.length === 0 && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">No hay retrasos operativos ni mesas prolongadas activas.</div>}
            {payload?.alerts.map((alert) => {
              const isTableDuration = alert.kind === "table_service_duration";
              return (
                <article key={alert.incidentId} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-extrabold text-slate-950">{alert.tableLabel} · {isTableDuration ? "Servicio de mesa" : alert.stationLabel}</h3>
                        <span className={alert.escalated ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-extrabold text-red-800" : alert.level === "critical" ? "rounded-full bg-orange-100 px-2 py-0.5 text-xs font-extrabold text-orange-800" : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-800"}>{alert.escalated ? "Escalada" : alert.level === "critical" ? "Crítica" : "Atención"}</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-600">{isTableDuration ? `Servicio abierto · ${formatMinutes(alert.elapsedMinutes)}` : `${alert.delayedLineCount} ${alert.delayedLineCount === 1 ? "línea retrasada" : "líneas retrasadas"} · ${formatMinutes(alert.elapsedMinutes)}`}</p>
                    </div>
                    <Link className="text-sm font-bold text-blue-700 hover:underline" href={alert.stationHref}>{isTableDuration ? "Abrir TPV" : `Abrir ${alert.stationLabel}`}</Link>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <HostlyButton variant="secondary" size="compact" onClick={() => void mutate(alert.incidentId, "acknowledge")} disabled={busy !== null}>Atendida</HostlyButton>
                    <HostlyButton variant="secondary" size="compact" onClick={() => void mutate(alert.incidentId, "snooze")} disabled={busy !== null}>Silenciar 5 min</HostlyButton>
                    <HostlyButton variant="primary" size="compact" onClick={() => void mutate(alert.incidentId, "resolve")} disabled={busy !== null}>Resolver</HostlyButton>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-blue-200 bg-blue-50/30 p-4 shadow-sm" aria-label="Notificaciones operativas">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">Avisos fuera de Hostly</h2>
              <p className="text-sm font-medium text-slate-600">Las alertas cambian de etapa una sola vez: Atención, Crítica y Escalada. Hostly evita envíos duplicados.</p>
            </div>
            <HostlyButton
              variant={pushStatus?.subscribed ? "secondary" : "primary"}
              size="compact"
              onClick={() => void togglePushDevice()}
              disabled={busy !== null || pushStatus?.supported !== true || pushStatus?.providerReady !== true}
            >
              {pushStatus?.subscribed ? "Desactivar push en este dispositivo" : "Activar push en este dispositivo"}
            </HostlyButton>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Push</p><p className="mt-1 text-sm font-bold text-slate-900">{channelState(payload?.policy.notificationChannels.push === true, providers?.push === true)}</p><p className="mt-1 text-xs font-semibold text-slate-500">{pushStatus?.subscribed ? "Este dispositivo está registrado." : pushStatus?.supported === false ? "No disponible en este navegador." : "Actívalo en cada móvil, tablet o equipo que deba recibir avisos."}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Email</p><p className="mt-1 text-sm font-bold text-slate-900">{channelState(payload?.policy.notificationChannels.email === true, providers?.email === true)}</p><p className="mt-1 text-xs font-semibold text-slate-500">Se envía únicamente a responsables activos con permiso de supervisión.</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">WhatsApp</p><p className="mt-1 text-sm font-bold text-slate-900">Proveedor pendiente</p><p className="mt-1 text-xs font-semibold text-slate-500">No se activa hasta disponer de proveedor, consentimiento y política comercial.</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">SMS</p><p className="mt-1 text-sm font-bold text-slate-900">Proveedor pendiente</p><p className="mt-1 text-xs font-semibold text-slate-500">No se activa hasta disponer de proveedor, consentimiento y política comercial.</p></div>
          </div>
          {pushStatus?.permission === "denied" && <p className="mt-3 text-xs font-bold text-red-700">El navegador tiene bloqueadas las notificaciones. Debes habilitarlas para hostlyapp.app desde los permisos del navegador.</p>}
        </section>

        {canManageSettings && draft && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Configuración de alertas">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold text-slate-950">Tiempos y canales</h2><p className="text-sm font-medium text-slate-600">Configura Atención, Crítico, Escalado y qué canales reales puede usar el restaurante.</p></div><HostlyButton variant="primary" size="compact" onClick={() => void saveSettings()} disabled={busy !== null}>Guardar</HostlyButton></div>
            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              {(Object.keys(STATION_LABELS) as Array<keyof typeof STATION_LABELS>).map((station) => {
                const stationPolicy = draft.stations[station];
                return (
                  <fieldset key={station} className="rounded-xl border border-slate-200 p-3">
                    <legend className="px-1 text-sm font-extrabold text-slate-950">{STATION_LABELS[station]}</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {THRESHOLD_FIELDS.map(([field, label]) => (
                        <label key={field} className="text-xs font-bold text-slate-600">{label}<input className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-950" type="number" min={1} max={field === "criticalMinutes" ? 240 : field === "attentionMinutes" ? 180 : 120} value={stationPolicy[field]} onChange={(event) => setDraft((current) => current ? { ...current, stations: { ...current.stations, [station]: { ...current.stations[station], [field]: Number(event.target.value) } } } : current)} /></label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
              <fieldset className="rounded-xl border border-blue-200 bg-blue-50/40 p-3">
                <legend className="px-1 text-sm font-extrabold text-slate-950">Servicio de mesa</legend>
                <div className="grid grid-cols-3 gap-2">
                  {THRESHOLD_FIELDS.map(([field, label]) => (
                    <label key={field} className="text-xs font-bold text-slate-600">{label}<input className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-950" type="number" min={1} max={field === "criticalMinutes" ? 240 : field === "attentionMinutes" ? 180 : 120} value={draft.tableService[field]} onChange={(event) => setDraft((current) => current ? { ...current, tableService: { ...current.tableService, [field]: Number(event.target.value) } } : current)} /></label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] font-semibold text-slate-500">Cuenta desde la primera línea realmente enviada; un borrador del TPV no inicia el reloj.</p>
              </fieldset>
            </div>
            <fieldset className="mt-4 rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-extrabold text-slate-950">Canales externos</legend>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"><input type="checkbox" checked={draft.notificationChannels.push} disabled={providers?.push !== true} onChange={(event) => setChannel("push", event.target.checked)} />Push</label>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"><input type="checkbox" checked={draft.notificationChannels.email} disabled={providers?.email !== true} onChange={(event) => setChannel("email", event.target.checked)} />Email</label>
                <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500"><span>WhatsApp</span><span className="text-[11px] uppercase">Pendiente</span></div>
                <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500"><span>SMS</span><span className="text-[11px] uppercase">Pendiente</span></div>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">Hostly solo permite guardar canales cuyo proveedor está configurado. WhatsApp y SMS permanecen bloqueados de forma segura.</p>
            </fieldset>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Historial de incidencias">
          <h2 className="text-lg font-extrabold text-slate-950">Historial reciente</h2>
          <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">Mesa</th><th className="py-2 pr-4">Área</th><th className="py-2 pr-4">Estado</th><th className="py-2 pr-4">Inicio</th><th className="py-2">Última actualización</th></tr></thead><tbody>{payload?.history.map((incident) => <tr key={incident.id} className="border-t border-slate-100"><td className="py-2 pr-4 font-bold text-slate-900">{incident.tableLabel}</td><td className="py-2 pr-4 text-slate-700">{incident.stationLabel}</td><td className="py-2 pr-4 text-slate-700">{statusLabel(incident.status)}</td><td className="py-2 pr-4 text-slate-600">{incident.startedAtMs ? new Date(incident.startedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td><td className="py-2 text-slate-600">{incident.updatedAtMs ? new Date(incident.updatedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </ModulePageShell>
  );
}
