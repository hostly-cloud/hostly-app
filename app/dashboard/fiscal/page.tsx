"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyAlert, HostlyButton, HostlyInput, HostlySelect, HostlySurface } from "@/components/ui/hostly";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";

type InvoiceRow = {
  id: string; invoiceNumber: string; issueDate: string; documentKind: string; deliveryStatus: string; mode: string;
  customerSnapshot?: { legalName?: string; nif?: string } | null;
  totals?: { taxableBaseCents?: number; taxAmountCents?: number; totalCents?: number };
};
type FiscalHealth = { severity: "healthy" | "pending" | "degraded" | "action_required"; metrics: { pending: number; sending: number; retryScheduled: number; rejected: number; oldestPendingAgeMs: number } };

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente de envío", sending: "Enviando a AEAT", retry_scheduled: "Pendiente — sin conexión",
  accepted: "Enviada a AEAT", accepted_with_errors: "Aceptada con avisos", rejected: "AEAT la ha rechazado",
};

export default function FiscalInvoicesPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [health, setHealth] = useState<FiscalHealth | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status) params.set("status", status);
    const [response, healthResponse] = await Promise.all([
      authenticatedApiFetch(`/api/fiscal/invoices?${params}`, { cache: "no-store" }),
      authenticatedApiFetch("/api/fiscal/health", { cache: "no-store" }),
    ]);
    const [payload, healthPayload] = await Promise.all([
      response.json().catch(() => null),
      healthResponse.json().catch(() => null),
    ]);
    if (response.ok) setRows(payload?.invoices ?? []);
    else setError("No se pudo consultar la facturación fiscal.");
    if (healthResponse.ok && healthPayload?.metrics) setHealth(healthPayload);
    setLoading(false);
  }, [query, status]);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    base: sum.base + Number(row.totals?.taxableBaseCents ?? 0),
    tax: sum.tax + Number(row.totals?.taxAmountCents ?? 0),
    total: sum.total + Number(row.totals?.totalCents ?? 0),
  }), { base: 0, tax: 0, total: 0 }), [rows]);
  const euro = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

  const download = async (url: string, filename: string) => {
    const response = await authenticatedApiFetch(url, { cache: "no-store" });
    if (!response.ok) { setError("No se pudo generar el documento."); return; }
    const href = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = filename; anchor.click(); URL.revokeObjectURL(href);
  };

  return (
    <ModulePageShell title="Facturación fiscal" backHref="/dashboard" backLabel="Volver al dashboard" maxWidth={1200}>
      <div className="space-y-5">
        {error ? <HostlyAlert tone="danger" title="No disponible">{error}</HostlyAlert> : null}
        {health?.severity === "action_required" ? <HostlyAlert tone="danger" title="AEAT ha rechazado registros">Hay {health.metrics.rejected} registro(s) que requieren revisión. Consulta el estado de cada factura antes de corregir y volver a emitir.</HostlyAlert> : null}
        {health?.severity === "degraded" ? <HostlyAlert tone="warning" title="Envío fiscal demorado">Hostly conserva las facturas y sigue reintentando. El registro más antiguo lleva {Math.floor(health.metrics.oldestPendingAgeMs / 60_000)} minutos pendiente.</HostlyAlert> : null}
        {health?.severity === "pending" ? <HostlyAlert tone="info" title="Envío en curso">Hay {health.metrics.pending + health.metrics.sending + health.metrics.retryScheduled} registro(s) pendientes o reintentándose.</HostlyAlert> : null}
        <div className="grid gap-3 sm:grid-cols-3"><HostlySurface variant="soft" className="p-4"><p className="text-xs font-semibold uppercase text-slate-500">Base</p><p className="mt-1 text-xl font-bold">{euro(totals.base)}</p></HostlySurface><HostlySurface variant="soft" className="p-4"><p className="text-xs font-semibold uppercase text-slate-500">IVA</p><p className="mt-1 text-xl font-bold">{euro(totals.tax)}</p></HostlySurface><HostlySurface variant="ice" className="p-4"><p className="text-xs font-semibold uppercase text-slate-500">Total</p><p className="mt-1 text-xl font-bold">{euro(totals.total)}</p></HostlySurface></div>
        <HostlySurface variant="flat" className="p-4"><div className="flex flex-wrap gap-3"><HostlyInput className="min-w-64 flex-1" placeholder="Buscar número, cliente o NIF" value={query} onChange={(event) => setQuery(event.target.value)} /><HostlySelect value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos los estados</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</HostlySelect><HostlyButton variant="secondary" onClick={() => void download("/api/fiscal/invoices/export", "hostly-facturacion.csv")}>Exportar CSV</HostlyButton></div></HostlySurface>
        <HostlySurface variant="flat" className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Factura</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Base</th><th className="px-4 py-3">IVA</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={7}>Cargando facturas…</td></tr> : rows.length === 0 ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={7}>No hay facturas fiscales en este filtro.</td></tr> : rows.map((row) => <tr key={row.id}><td className="px-4 py-3"><p className="font-bold text-slate-900">{row.invoiceNumber}</p><p className="text-xs text-slate-500">{row.issueDate} · {row.documentKind}{row.mode === "test" ? " · PRUEBA" : ""}</p></td><td className="px-4 py-3">{row.customerSnapshot?.legalName || "Consumidor final"}<p className="text-xs text-slate-500">{row.customerSnapshot?.nif}</p></td><td className="px-4 py-3">{euro(Number(row.totals?.taxableBaseCents ?? 0))}</td><td className="px-4 py-3">{euro(Number(row.totals?.taxAmountCents ?? 0))}</td><td className="px-4 py-3 font-bold">{euro(Number(row.totals?.totalCents ?? 0))}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.deliveryStatus === "accepted" ? "bg-emerald-50 text-emerald-700" : row.deliveryStatus === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{STATUS_LABEL[row.deliveryStatus] ?? row.deliveryStatus}</span></td><td className="px-4 py-3"><button className="font-semibold text-slate-700 underline" onClick={() => void download(`/api/fiscal/invoices/${row.id}/pdf`, `${row.invoiceNumber}.pdf`)}>PDF</button></td></tr>)}</tbody></table></div></HostlySurface>
      </div>
    </ModulePageShell>
  );
}
