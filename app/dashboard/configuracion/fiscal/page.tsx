"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyAlert, HostlyButton, HostlyInput, HostlySelect, HostlySurface } from "@/components/ui/hostly";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";

type Mode = "demo" | "test" | "live";
type Form = {
  mode: Mode;
  taxpayerLegalName: string;
  taxpayerNif: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  establishmentName: string;
  timezone: string;
  defaultVatRate: string;
};
type Readiness = { key: string; label: string; ready: boolean };

const LIVE_NOT_BEFORE_MS = Date.parse("2027-01-01T00:00:00+01:00");
const LIVE_WINDOW_OPEN_AT_MODULE_LOAD = Date.now() >= LIVE_NOT_BEFORE_MS;

const EMPTY: Form = {
  mode: "demo",
  taxpayerLegalName: "",
  taxpayerNif: "",
  address: "",
  postalCode: "",
  city: "",
  province: "",
  establishmentName: "",
  timezone: "Europe/Madrid",
  defaultVatRate: "10",
};

export default function FiscalConfigurationPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [readiness, setReadiness] = useState<Readiness[]>([]);
  const [status, setStatus] = useState<string>("not_configured");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "success" | "info"; text: string } | null>(null);
  const [liveWindowOpen, setLiveWindowOpen] = useState(LIVE_WINDOW_OPEN_AT_MODULE_LOAD);
  const allReady = readiness.length > 0 && readiness.every((item) => item.ready || (form.mode === "test" && item.key === "declaration"));

  const load = useCallback(async () => {
    setLoading(true);
    const response = await authenticatedApiFetch("/api/fiscal/configuration", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.configuration) {
      const config = payload.configuration;
      setStatus(config.status);
      setReadiness(config.readiness ?? []);
      setForm({
        mode: config.mode,
        taxpayerLegalName: config.taxpayer?.legalName ?? "",
        taxpayerNif: config.taxpayer?.nif ?? "",
        address: config.taxpayer?.address?.line1 ?? "",
        postalCode: config.taxpayer?.address?.postalCode ?? "",
        city: config.taxpayer?.address?.city ?? "",
        province: config.taxpayer?.address?.province ?? "",
        establishmentName: config.establishmentName ?? "",
        timezone: config.timezone ?? "Europe/Madrid",
        defaultVatRate: config.defaultVatRateBps == null ? "" : String(config.defaultVatRateBps / 100),
      });
    } else if (!response.ok) {
      setMessage({ tone: "danger", text: "No se pudo cargar la configuración fiscal." });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  useEffect(() => {
    if (liveWindowOpen) return;
    const remainingMs = LIVE_NOT_BEFORE_MS - Date.now();
    if (remainingMs <= 0) {
      const timeoutId = window.setTimeout(() => setLiveWindowOpen(true), 0);
      return () => window.clearTimeout(timeoutId);
    }
    const timeoutId = window.setTimeout(() => setLiveWindowOpen(true), Math.min(remainingMs, 2_147_483_647));
    return () => window.clearTimeout(timeoutId);
  }, [liveWindowOpen]);

  const patch = <K extends keyof Form,>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const vat = Number(form.defaultVatRate.replace(",", "."));
    const body = {
      mode: form.mode,
      taxpayerLegalName: form.taxpayerLegalName,
      taxpayerNif: form.taxpayerNif,
      taxpayerAddress: { line1: form.address, postalCode: form.postalCode, city: form.city, province: form.province, countryCode: "ES" },
      establishmentName: form.establishmentName,
      establishmentAddress: { line1: form.address, postalCode: form.postalCode, city: form.city, province: form.province, countryCode: "ES" },
      timezone: form.timezone,
      defaultVatRateBps: Number.isFinite(vat) ? Math.round(vat * 100) : null,
    };
    const response = await authenticatedApiFetch("/api/fiscal/configuration", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setMessage({ tone: "danger", text: payload?.error === "FISCAL_CONFIGURATION_ACTIVE_LOCKED" ? "La configuración activa no puede modificarse sin un procedimiento de cambio fiscal." : "Revisa los datos fiscales: falta información o algún dato no es válido." });
    else {
      setReadiness(payload.configuration?.readiness ?? []);
      setStatus(payload.configuration?.status ?? "draft");
      setMessage({ tone: "success", text: form.mode === "demo" ? "Datos guardados. Hostly sigue en modo demo y no emitirá documentos fiscales." : "Datos guardados. Completa el certificado y los requisitos pendientes antes de activar." });
    }
    setSaving(false);
  };

  const activate = async (mode: "test" | "live") => {
    if (mode === "live" && !liveWindowOpen) {
      setMessage({ tone: "info", text: "La producción fiscal real permanece bloqueada hasta el 1 de enero de 2027 (hora peninsular). Puedes dejar toda la configuración preparada mientras tanto." });
      return;
    }
    const confirmation = mode === "live" ? "ACTIVAR FISCAL REAL" : "ACTIVAR FISCAL TEST";
    if (mode === "live" && window.prompt(`Escribe exactamente: ${confirmation}`) !== confirmation) return;
    setSaving(true);
    const response = await authenticatedApiFetch("/api/fiscal/configuration/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, confirmation }) });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setStatus("active");
      setMessage({ tone: "success", text: mode === "live" ? "Facturación fiscal real activada." : "Entorno fiscal de pruebas activado. Los documentos indican que no tienen validez fiscal." });
    } else {
      const text = payload?.error === "FISCAL_LIVE_NOT_YET_ALLOWED"
        ? "La producción fiscal real permanece bloqueada hasta el 1 de enero de 2027 (hora peninsular)."
        : payload?.error === "FISCAL_LIVE_ACTIVATION_DISABLED"
          ? "La activación real está bloqueada hasta completar la validación externa y habilitación operativa de Hostly."
          : "Aún faltan pasos obligatorios antes de activar.";
      setMessage({ tone: "danger", text });
    }
    setSaving(false);
  };

  const fields = useMemo(() => [
    ["taxpayerLegalName", "Razón social"], ["taxpayerNif", "NIF"], ["establishmentName", "Nombre del establecimiento"],
    ["address", "Domicilio fiscal"], ["postalCode", "Código postal"], ["city", "Población"], ["province", "Provincia"],
  ] as const, []);

  return (
    <ModulePageShell title="Configuración fiscal" backHref="/dashboard/configuracion" backLabel="Volver a configuración" maxWidth={1050}>
      <div className="space-y-5">
        <HostlySurface variant="ice" className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-sm font-semibold text-slate-500">Estado fiscal</p><h1 className="mt-1 text-2xl font-bold text-slate-950">{status === "active" ? "Facturación activa" : "Preparación fiscal"}</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Configura una vez los datos de la empresa. El cobro normal generará después la factura, el QR y el envío fiscal.</p></div>
            <Link href="/dashboard/fiscal" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Ver facturas</Link>
          </div>
        </HostlySurface>

        <HostlyAlert tone="warning" title="Modo demo protegido">En demo Hostly no crea facturas ni registros fiscales. Los datos y comandas anteriores nunca se convierten automáticamente.</HostlyAlert>
        {!liveWindowOpen ? <HostlyAlert tone="info" title="Producción fiscal bloqueada hasta 01/01/2027">Puedes completar toda la preparación. Hasta esa fecha Hostly no permite activar producción fiscal real ni enviar registros al endpoint AEAT de producción.</HostlyAlert> : null}
        {message ? <HostlyAlert tone={message.tone} title={message.tone === "danger" ? "Revisión necesaria" : "Configuración fiscal"}>{message.text}</HostlyAlert> : null}

        <HostlySurface variant="flat" className="p-5">
          <h2 className="text-lg font-bold text-slate-950">Empresa y establecimiento</h2>
          {loading ? <p className="mt-4 text-sm text-slate-500">Cargando…</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">Modo<HostlySelect className="mt-1" value={form.mode} disabled={status === "active"} onChange={(event) => patch("mode", event.target.value as Mode)}><option value="demo">Demo — no fiscal</option><option value="test">Pruebas AEAT</option><option value="live">Producción fiscal real</option></HostlySelect></label>
            {fields.map(([key, label]) => <label key={key} className="text-sm font-semibold text-slate-700">{label}<HostlyInput className="mt-1" value={form[key]} disabled={status === "active"} onChange={(event) => patch(key, event.target.value)} /></label>)}
            <label className="text-sm font-semibold text-slate-700">IVA predeterminado (%)<HostlyInput className="mt-1" inputMode="decimal" value={form.defaultVatRate} disabled={status === "active"} onChange={(event) => patch("defaultVatRate", event.target.value)} /></label>
            <label className="text-sm font-semibold text-slate-700">Zona horaria<HostlySelect className="mt-1" value={form.timezone} disabled={status === "active"} onChange={(event) => patch("timezone", event.target.value)}><option value="Europe/Madrid">Península y Baleares</option><option value="Atlantic/Canary">Canarias</option></HostlySelect></label>
          </div>}
          <div className="mt-5"><HostlyButton onClick={() => void save()} disabled={loading || saving || status === "active"}>{saving ? "Guardando…" : "Guardar configuración"}</HostlyButton></div>
        </HostlySurface>

        <HostlySurface variant="flat" className="p-5">
          <h2 className="text-lg font-bold text-slate-950">Preparación</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{readiness.length ? readiness.map((item) => <div key={item.key} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${item.ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{item.ready ? "✓" : "○"} {item.label}</div>) : <p className="text-sm text-slate-500">Guarda los datos para ver la lista de preparación.</p>}</div>
          {readiness.some((item) => item.key === "authorization" && !item.ready) ? <p className="mt-4 text-sm text-slate-600">El certificado de envío AEAT se incorpora mediante soporte seguro de Hostly; la clave privada nunca se guarda en campos accesibles desde el navegador.</p> : null}
          {form.mode === "test" && status !== "active" ? <div className="mt-5"><HostlyButton disabled={!allReady || saving} onClick={() => void activate("test")}>Activar pruebas fiscales</HostlyButton></div> : null}
          {form.mode === "live" && status !== "active" ? <div className="mt-5"><HostlyButton disabled={!allReady || saving || !liveWindowOpen} onClick={() => void activate("live")}>{liveWindowOpen ? "Activar producción fiscal" : "Producción disponible desde 01/01/2027"}</HostlyButton></div> : null}
          <Link href="/dashboard/configuracion/fiscal/declaracion" className="mt-5 inline-block text-sm font-semibold text-sky-700 underline">Información y declaración responsable de Hostly</Link>
        </HostlySurface>
      </div>
    </ModulePageShell>
  );
}
