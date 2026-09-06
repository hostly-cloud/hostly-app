"use client";

import { useMemo, useState } from "react";
import {
  HostlyButton,
  HostlyKpiCard,
  HostlySection,
  HostlySectionHeader,
  HostlySurface,
} from "@/components/ui/hostly";
import { ConfigCartaWorkbench } from "../../../_components/config-carta-workbench";
import {
  requestPosMigrationPreview,
  requestPosMigrationPublish,
  requestPosMigrationRollback,
} from "@/lib/pos-migration/client";
import type { PosMigrationPreview, PosMigrationPublishResult } from "@/lib/pos-migration/types";

const FIELD_LABELS: Record<string, string> = {
  name: "Producto",
  category: "Categoría",
  price: "PVP",
  taxRate: "IVA",
  cost: "Coste",
  stock: "Stock",
  unit: "Unidad",
  station: "Destino",
  sku: "SKU / referencia",
  barcode: "Código de barras",
  active: "Activo",
};

const SUPPORTED_VENDOR_LABELS = ["Revo", "Glop", "Last.app", "FrontRest", "Ágora", "Square", "Lightspeed"];

function money(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)} €`;
}

export function PosMigrationPageContent() {
  const [preview, setPreview] = useState<PosMigrationPreview | null>(null);
  const [published, setPublished] = useState<PosMigrationPublishResult | null>(null);
  const [confirmedReviews, setConfirmedReviews] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"preview" | "publish" | "rollback" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const importableCount = useMemo(() => {
    if (!preview) return 0;
    return preview.items.filter(
      (item) => item.decision === "create" || (item.decision === "review" && confirmedReviews.has(item.id)),
    ).length;
  }, [preview, confirmedReviews]);

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy("preview");
    setMessage(null);
    setPreview(null);
    setPublished(null);
    setConfirmedReviews(new Set());
    const response = await requestPosMigrationPreview(file);
    if (!response.ok) {
      setMessage({ tone: "error", text: response.details || response.error });
      setBusy(null);
      return;
    }
    setPreview(response.preview);
    setBusy(null);
  }

  async function publish() {
    if (!preview || importableCount === 0) return;
    setBusy("publish");
    setMessage(null);
    const response = await requestPosMigrationPublish(preview.migrationId, [...confirmedReviews]);
    if (!response.ok) {
      setMessage({ tone: "error", text: response.details || response.error });
      setBusy(null);
      return;
    }
    setPublished(response.result);
    setMessage({
      tone: "success",
      text: `Migración completada: ${response.result.createdProductIds.length} productos y ${response.result.createdCategoryIds.length} categorías creadas.`,
    });
    setBusy(null);
  }

  async function rollback() {
    if (!preview || !published) return;
    const accepted = window.confirm(
      "¿Deshacer esta migración? Solo se retirarán datos creados por esta importación que sigan siendo seguros de eliminar.",
    );
    if (!accepted) return;
    setBusy("rollback");
    setMessage(null);
    const response = await requestPosMigrationRollback(preview.migrationId);
    if (!response.ok) {
      setMessage({ tone: "error", text: response.details || response.error });
      setBusy(null);
      return;
    }
    setPublished(null);
    setMessage({
      tone: "success",
      text: `Migración deshecha: ${response.result.deletedProductIds.length} productos y ${response.result.deletedCategoryIds.length} categorías retirados.`,
    });
    setBusy(null);
  }

  function toggleReview(itemId: string, checked: boolean) {
    setConfirmedReviews((current) => {
      const next = new Set(current);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  return (
    <ConfigCartaWorkbench
      compactSectionHeader={false}
      title="Migrar desde otro TPV"
      description="Trae el catálogo de tu sistema actual a Hostly con revisión previa y opción de deshacer."
    >
      <HostlySection stack="md">
        <HostlySurface variant="ice" className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--hostly-navy-deep)]">1. Sube la exportación de tu TPV</p>
              <p className="mt-1 text-xs text-[var(--hostly-ink-muted)]">
                CSV, TSV o TXT. Detectamos producto, categoría, PVP, IVA, coste, stock, unidad y destino.
              </p>
              <p className="mt-1 text-[11px] text-[var(--hostly-ink-soft)]">
                Adaptadores actuales: {SUPPORTED_VENDOR_LABELS.join(" · ")} · otros formatos usan el motor universal.
              </p>
            </div>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[var(--hostly-radius-button)] border border-[var(--hostly-line-strong)] bg-white px-4 text-sm font-semibold text-[var(--hostly-navy-deep)]">
              {busy === "preview" ? "Analizando…" : "Elegir exportación"}
              <input
                type="file"
                className="sr-only"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                disabled={busy != null}
                onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </HostlySurface>

        {message ? (
          <HostlySurface
            variant="flat"
            className={message.tone === "error" ? "border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" : "border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"}
          >
            {message.text}
          </HostlySurface>
        ) : null}

        {preview ? (
          <>
            <HostlySection stack="sm">
              <HostlySectionHeader
                title="2. Revisión automática"
                description={`${preview.sourceFileName} · todavía no se ha escrito nada en Productos.`}
              />
              <HostlySurface variant="flat" className="p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-[var(--hostly-navy-deep)]">TPV detectado:</span>
                  <span>{preview.sourceVendorLabel}</span>
                  {preview.sourceVendor !== "generic" ? (
                    <span className="text-[var(--hostly-ink-muted)]">({Math.round(preview.sourceVendorConfidence * 100)} % de confianza)</span>
                  ) : (
                    <span className="text-[var(--hostly-ink-muted)]">· parser universal</span>
                  )}
                </div>
              </HostlySurface>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <HostlyKpiCard title="Filas" value={preview.summary.rowCount} variant="ice" />
                <HostlyKpiCard title="Listas" value={preview.summary.createCount} variant="soft" />
                <HostlyKpiCard title="Revisar" value={preview.summary.reviewCount} variant="flat" />
                <HostlyKpiCard title="Bloqueadas" value={preview.summary.blockedCount} variant="flat" />
              </div>
            </HostlySection>

            <HostlySection stack="sm">
              <HostlySectionHeader title="Mapeo de columnas" description="Las columnas no reconocidas se ignoran." />
              <HostlySurface variant="flat" className="overflow-x-auto p-0">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-[var(--hostly-line)] bg-[var(--hostly-surface-muted)]/60 text-[10px] uppercase tracking-wide text-[var(--hostly-ink-soft)]">
                    <tr><th className="px-3 py-2">TPV anterior</th><th className="px-3 py-2">Hostly</th><th className="px-3 py-2">Confianza</th></tr>
                  </thead>
                  <tbody>
                    {preview.mapping.map((column) => (
                      <tr key={column.sourceColumn} className="border-b border-[var(--hostly-line)]/70 last:border-0">
                        <td className="px-3 py-2.5 font-medium">{column.sourceColumn}</td>
                        <td className="px-3 py-2.5">{column.targetField ? FIELD_LABELS[column.targetField] ?? column.targetField : "Ignorar"}</td>
                        <td className="px-3 py-2.5">{column.targetField ? `${Math.round(column.confidence * 100)} %` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </HostlySurface>
            </HostlySection>

            {preview.warnings.length ? (
              <HostlySurface variant="flat" className="border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {preview.warnings.map((warning) => <p key={warning}>· {warning}</p>)}
              </HostlySurface>
            ) : null}

            <HostlySection stack="sm">
              <HostlySectionHeader title="Productos detectados" description="Los conflictos requieren confirmación expresa." />
              <HostlySurface variant="flat" className="overflow-x-auto p-0">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-[var(--hostly-line)] bg-[var(--hostly-surface-muted)]/60 text-[10px] uppercase tracking-wide text-[var(--hostly-ink-soft)]">
                    <tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Categoría</th><th className="px-3 py-2">PVP</th><th className="px-3 py-2">IVA</th><th className="px-3 py-2">Stock / coste</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Importar</th></tr>
                  </thead>
                  <tbody>
                    {preview.items.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--hostly-line)]/70 last:border-0">
                        <td className="px-3 py-2.5 align-top"><p className="font-medium">{item.name || `Fila ${item.rowNumber}`}</p>{item.warnings.length ? <p className="mt-0.5 max-w-[320px] text-[10px] text-[var(--hostly-ink-muted)]">{item.warnings.join(" · ")}</p> : null}</td>
                        <td className="px-3 py-2.5 align-top">{item.category ?? "—"}</td>
                        <td className="px-3 py-2.5 align-top">{money(item.price)}</td>
                        <td className="px-3 py-2.5 align-top">{item.taxRate == null ? "—" : `${item.taxRate} %`}</td>
                        <td className="px-3 py-2.5 align-top">{item.stock == null ? "—" : `${item.stock} ${item.unit}`} · {money(item.cost)}</td>
                        <td className="px-3 py-2.5 align-top font-semibold">{item.decision === "create" ? "Listo" : item.decision === "review" ? "Revisar" : "Bloqueado"}</td>
                        <td className="px-3 py-2.5 align-top">
                          {item.decision === "create" ? "Sí" : item.decision === "review" ? (
                            <label className="flex items-center gap-2"><input type="checkbox" checked={confirmedReviews.has(item.id)} disabled={published != null || busy != null} onChange={(event) => toggleReview(item.id, event.target.checked)} />Confirmar</label>
                          ) : "No"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </HostlySurface>
            </HostlySection>

            <HostlySurface variant="ice" className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-semibold">3. Importar con control</p><p className="mt-1 text-xs text-[var(--hostly-ink-muted)]">Se crearán {importableCount} productos. No se sobrescribe catálogo existente sin confirmación.</p></div>
                {published ? (
                  <HostlyButton variant="destructive" disabled={busy != null} onClick={() => void rollback()}>{busy === "rollback" ? "Deshaciendo…" : "Deshacer migración"}</HostlyButton>
                ) : (
                  <HostlyButton variant="primary" disabled={busy != null || importableCount === 0} onClick={() => void publish()}>{busy === "publish" ? "Importando…" : `Importar ${importableCount} productos`}</HostlyButton>
                )}
              </div>
            </HostlySurface>
          </>
        ) : null}
      </HostlySection>
    </ConfigCartaWorkbench>
  );
}
