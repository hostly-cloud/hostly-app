"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyAlert, HostlyButton, HostlyInput, HostlySelect, HostlySurface } from "@/components/ui/hostly";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";

type Mode = "demo" | "test" | "live";
type IndirectTaxCode = "01" | "02" | "03";
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
  indirectTaxCode: IndirectTaxCode;
  defaultVatRate: string;
};
type Readiness = { key: string; label: string; ready: boolean };
type LiveReadiness = {
  ready: boolean;
  notBefore: string;
  dateGateOpen: boolean;
  activationFlagEnabled: boolean;
  submissionFlagEnabled: boolean;
  productionEnvironmentSelected: boolean;
  missingConfiguration: string[];
  blockers: string[];
};

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
  indirectTaxCode: "01",
  defaultVatRate: "10",
};

const TAX_LABELS: Record<IndirectTaxCode, string> = {
  "01": "IVA",
  "02": "IPSI",
  "03": "IGIC",
};

export default function FiscalConfigurationPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [readiness, setReadiness] = useState<Readiness[]>([]);
  const [liveReadiness, setLiveReadiness] = useState<LiveReadiness | null>(null);
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
      setLiveReadiness(config.liveReadiness ?? null);
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
        indirectTaxCode: config.indirectTaxCode === "02" || config.indirectTaxCode === "03" ? config.indirectTaxCode : "01",
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
      indirectTaxCode: form.indirectTaxCode,
      defaultVatRateBps: Number.isFinite(vat) ? Math.round(vat * 100) : null,
    };
    const response = await authenticatedApiFetch("/api/fiscal/configuration", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setMessage({ tone: "danger", text: payload?.error === "FISCAL_CONFIGURATION_ACTIVE_LOCKED" ? "La configuración activa no puede modificarse sin un procedimiento de cambio fiscal." : "Revisa los datos fiscales: falta información o algún dato no es válido." });
    else {
      setReadiness(payload.configuration?.readiness ?? []);
      setLiveReadiness(payload.configuration?.liveReadiness ?? null);
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
      await load();
    } else {
      const text = payload?.error === "FISCAL_LIVE_NOT_YET_ALLOWED"
        ? "La producción fiscal real permanece bloqueada hasta el 1 de enero de 2027 (hora peninsular)."
        : payload?.error === "FISCAL_LIVE_ACTIVATION_DISABLED"
          ? "La activación real está bloqueada hasta completar la validación externa y habilitación operativa de Hostly."
          : payload?.error === "FISCAL_AEAT_PRODUCTION_SUBMISSION_DISABLED"
            ? "El envío AEAT de producción sigue cerrado. Deben abrirse los dos interruptores durante el pase controlado."
            : "Aún faltan pasos obligatorios antes de activar.";
      setMessage({ tone: "danger", text });
    }
    setSaving(false);
  };

  const fields = useMemo(() => [
    ["taxpayerLegalName", "Razón social"], ["taxpayerNif", "NIF"], ["establishmentName", "Nombre del establecimiento"],
    ["address", "Domicilio fiscal"], ["postalCode", "Código postal"], ["city", "Población"], ["province", "Provincia"],
  ] as const, []);

  const liveChecks = liveReadiness ? [
    { key: "date", label: "Fecha de apertura", ready: liveReadiness.dateGateOpen, detail: "01/01/2027" },
    { key: "configuration", label: "Configuración fiscal completa", ready: liveReadiness.missingConfiguration.length === 0, detail: liveReadiness.missingConfiguration.length ? `${liveReadiness.missingConfiguration.length} pendiente(s)` : "Completa" },
    { key: "environment", label: "Entorno AEAT producción", ready: liveReadiness.productionEnvironmentSelected, detail: liveReadiness.productionEnvironmentSelected ? "Seleccionado" : "Pendiente" },
    { key: "activation", label: "Interruptor de activación", ready: liveReadiness.activationFlagEnabled, detail: liveReadiness.activationFlagEnabled ? "Abierto" : "Cerrado a propósito" },
    { key: "submission", label: "Interruptor de envío AEAT", ready: liveReadiness.submissionFlagEnabled, detail: liveReadiness.submissionFlagEnabled ? "Abierto" : "Cerrado a propósito" },
  ] : [];

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
            <label className="text-sm font-semibold text-slate-700">Impuesto indirecto<HostlySelect className="mt-1" value={form.indirectTaxCode} disabled={status === "active"} onChange={(event) => patch("indirectTaxCode", event.target.value as IndirectTaxCode)}><option value="01">IVA — Península y Baleares</option><option value="03">IGIC — Canarias</option><option value="02">IPSI — Ceuta y Melilla</option></HostlySelect></label>
            <label className="text-sm font-semibold text-slate-700">{TAX_LABELS[form.indirectTaxCode]} predeterminado (%)<HostlyInput className="mt-1" inputMode="decimal" value={form.defaultVatRate} disabled={status === "active"} onChange={(event) => patch("defaultVatRate", event.target.value)} /></label>
            <label className="text-sm font-semibold text-slate-700">Zona horaria<HostlySelect className="mt-1" value={form.timezone} disabled={status === "active"} onChange={(event) => patch("timezone", event.target.value)}><option value="Europe/Madrid">Península, Baleares, Ceuta y Melilla</option><option value="Atlantic/Canary">Canarias</option></HostlySelect></label>
          </div>}
          <div className="mt-5"><HostlyButton onClick={() => void save()} disabled={loading || saving || status === "active"}>{saving ? "Guardando…" : "Guardar configuración"}</HostlyButton></div>
        </HostlySurface>

        <HostlySurface variant="flat" className="p-5">
          <h2 className="text-lg font-bold text-slate-950">Preparación</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{readiness.length ? readiness.map((item) => <div key={item.key} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${item.ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{item.ready ? "✓" : "○"} {item.label}</div>) : <p className="text-sm text-slate-500">Guarda los datos para ver la lista de preparación.</p>}</div>
          {readiness.some((item) => item.key === "authorization" && !item.ready) ? <p className="mt-4 text-sm text-slate-600">El certificado de envío AEAT se incorpora mediante soporte seguro de Hostly; la clave privada nunca se guarda en campos accesibles desde el navegador.</p> : null}
          {form.mode === "live" && liveChecks.length ? <div className="mt-6"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-950">Semáforo de activación real</h3><span className={`rounded-full px-3 py-1 text-xs font-bold ${liveReadiness?.ready ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{liveReadiness?.ready ? "LISTO PARA ACTIVAR" : "PRODUCCIÓN CERRADA"}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{liveChecks.map((item) => <div key={item.key} className={`rounded-xl border px-4 py-3 ${item.ready ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><div className={`text-sm font-semibold ${item.ready ? "text-emerald-800" : "text-slate-700"}`}>{item.ready ? "✓" : "○"} {item.label}</div><div className="mt-1 text-xs text-slate-500">{item.detail}</div></div>)}</div><p className="mt-3 text-xs text-slate-500">Los dos interruptores deben permanecer cerrados antes del pase controlado. Verlos cerrados ahora es el estado esperado.</p></div> : null}
          {form.mode === "test" && status !== "active" ? <div className="mt-5"><HostlyButton disabled={!allReady || saving} onClick={() => void activate("test")}>Activar pruebas fiscales</HostlyButton></div> : null}
          {form.mode === "live" && status !== "active" ? <div className="mt-5"><HostlyButton disabled={!allReady || saving || !liveWindowOpen || !liveReadiness?.ready} onClick={() => void activate("live")}>{liveWindowOpen ? "Activar producción fiscal" : "Producción disponible desde 01/01/2027"}</HostlyButton></div> : null}
          <Link href="/dashboard/configuracion/fiscal/declaracion" className="mt-5 inline-block text-sm font-semibold text-sky-700 underline">Información y declaración responsable de Hostly</Link>
        </HostlySurface>
      </div>
    </ModulePageShell>
  );
}
