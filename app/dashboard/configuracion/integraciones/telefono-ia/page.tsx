"use client";

import { useCallback, useEffect, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyButton } from "@/components/ui/hostly/HostlyButton";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";

type PhoneAiSettings = {
  enabled: boolean;
  provider: "twilio";
  incomingNumber: string;
  provisioningStatus: "unconfigured" | "pending" | "verified";
  language: string;
  fallbackPhone: string;
};

type Payload = {
  ok: true;
  settings: PhoneAiSettings;
  providerConfigured: boolean;
};

export default function PhoneAiSettingsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const res = await authenticatedApiFetch("/api/integrations/phone-ai", { cache: "no-store" });
    if (!res.ok) {
      setError("No se ha podido cargar Teléfono IA.");
      return;
    }
    setData(await res.json() as Payload);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!data) return;
    setSaving(true);
    setError("");
    try {
      const res = await authenticatedApiFetch("/api/integrations/phone-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.settings),
      });
      if (!res.ok) throw new Error("SAVE_FAILED");
      const payload = await res.json() as { ok: true; settings: PhoneAiSettings };
      setData((current) => current ? { ...current, settings: payload.settings } : current);
    } catch {
      setError("No se han podido guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  const verified = data?.settings.provisioningStatus === "verified";

  return (
    <ModulePageShell
      title="Teléfono IA"
      subtitle="Atiende llamadas entrantes, recoge solicitudes de reserva y deriva a una persona cuando no puede responder con seguridad."
      backHref="/dashboard/configuracion/integraciones"
      backLabel="Volver a integraciones"
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Estado</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Recepción telefónica automática</h2>
              <p className="mt-1 text-sm text-slate-500">V1 registra solicitudes de reserva en pendiente. No promete disponibilidad ni cobra por teléfono.</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={data?.settings.enabled ?? false}
                disabled={!verified}
                onChange={(event) => setData((current) => current ? { ...current, settings: { ...current.settings, enabled: event.target.checked } } : current)}
              />
              Activado
            </label>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Idioma de voz
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                value={data?.settings.language ?? "es-ES"}
                onChange={(event) => setData((current) => current ? { ...current, settings: { ...current.settings, language: event.target.value } } : current)}
              >
                <option value="es-ES">Español</option>
                <option value="en-US">English</option>
                <option value="fr-FR">Français</option>
                <option value="de-DE">Deutsch</option>
                <option value="it-IT">Italiano</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Teléfono de derivación humana
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                value={data?.settings.fallbackPhone ?? ""}
                placeholder="+34..."
                onChange={(event) => setData((current) => current ? { ...current, settings: { ...current.settings, fallbackPhone: event.target.value } } : current)}
              />
            </label>
          </div>

          {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}
          <div className="mt-5 flex justify-end">
            <HostlyButton onClick={() => void save()} disabled={!data || saving}>{saving ? "Guardando…" : "Guardar"}</HostlyButton>
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Proveedor</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Twilio Voice</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Credenciales</dt><dd className="font-medium text-slate-800">{data?.providerConfigured ? "Configuradas" : "Pendientes"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Número</dt><dd className="font-medium text-slate-800">{data?.settings.incomingNumber || "Pendiente de asignar"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Verificación</dt><dd className="font-medium text-slate-800">{verified ? "Verificado" : "Pendiente"}</dd></div>
          </dl>
          <p className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-500">Hostly solo activa el interruptor cuando el número ha sido provisionado y verificado en servidor. Una llamada no puede elegir otro restaurante mediante parámetros del cliente.</p>
        </aside>
      </div>
    </ModulePageShell>
  );
}
