"use client";

import { useMemo, useState } from "react";
import {
  HostlyButton,
  HostlyKpiCard,
  HostlySection,
  HostlySectionHeader,
  HostlySurface,
} from "@/components/ui/hostly";
import { ConfigCartaWorkbench } from "../../../../_components/config-carta-workbench";
import {
  requestPosMigrationPreview,
  requestPosMigrationPublish,
  requestPosMigrationRollback,
} from "@/lib/pos-migration/client";
import type {
  PosMigrationPreview,
  PosMigrationPublishResult,
} from "@/lib/pos-migration/types";

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

function money(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(2)} €`;
}

export function PosMigrationPageContent() {
  const [preview, setPreview] = useState<PosMigrationPreview | null>(null);
  const [published, setPublished] = useState<PosMigrationPublishResult | null>(null);
  const [confirmedReviews, setConfirmedReviews] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"preview" | "publish" | "rollback" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const importableCount = useMemo(() => {
    if (!preview) return 0;
    return preview.items.filter(
      (item) => item.decision === "create" || (item.decision === "review" && confirmedReviews.has(item.id)),
    ).length;
  }, [preview, confirmedReviews]);

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy("preview");
    setError(null);
    setSuccess(null);
    setPreview(null);
    setPublished(null);
    setConfirmedReviews(new Set());
    const result = await requestPosMigrationPreview(file);
    if (!result.ok) {
      setError(result.details || result.error);
      setBusy(null);
      return;
    }
    setPreview(result.preview);
    setBusy(null);
  }

  async function handlePublish() {
    if (!preview || importableCount === 0) return;
    setBusy("publish");
    setError(null);
    setSuccess(null);
    const result = await requestPosMigrationPublish(preview.migrationId, [...confirmedReviews]);
    if (!result.ok) {
      setError(result.details || result.error);
      setBusy(null);
      return;
    }
    setPublished(result.result);
    setSuccess(
      `Migración completada: ${result.result.createdProductIds.length} productos y ${result.result.createdCategoryIds.length} categorías creadas.`,
    );
    setBusy(null);
  }

  async function handleRollback() {
    if (!preview || !published) return;
    if (!window.confirm("¿Deshacer esta migración? Solo se eliminarán los datos creados por esta importación que sigan siendo seguros de retirar.")) return;
    setBusy("rollback");
    setError(null);
    setSuccess(null);
    const result = await requestPosMigrationRollback(preview.migrationId);
    if (!result.ok) {
      setError(result.details || result.error);
      setBusy(null);
      return;
    }
    setPublished(null);
    setSuccess(
      `Migración deshecha: ${result.result.deletedProductIds.length} productos y ${result.result.deletedCategoryIds.length} categorías retirados.`,
    );
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
      description="Trae tu catálogo a Hostly sin empezar de cero. Revisamos la exportación antes de escribir nada."
    >
      <HostlySection stack="md">
        <HostlySurface variant="ice" className="p-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-[var(--hostly-navy-deep)]">1. Exporta productos desde tu TPV actual</p>
              <p className="mt-1 text-xs text-[var(--hostly-ink-muted)]">
                Sube CSV, TSV o TXT. Hostly detecta automáticamente columnas habituales como producto, categoría, PVP, IVA, coste, stock y destino.
              </p>
            </div>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[var(--hostly-radius-button)] border border-[var(--hostly-line-strong)] bg-white px-4 text-sm font-semibold text-[var(--hostly-navy-deep)]">
              {busy === "preview" ? "Analizando…" : "Elegir exportación"}
              <input
                className="sr-only"
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                disabled={busy != null}
                onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </HostlySurface>

        {error ? (
          <HostlySurface variant="flat" className="border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            {error}
          </HostlySurface>
        ) : null}
        {success ? (
          <HostlySurface variant="flat" className="border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            {success}
          </HostlySurface>
        ) : null}

        {preview ? (
          <>
            <HostlySection stack="sm">
              <HostlySectionHeader
                title="2. Revisión automática"
                description={`${preview.sourceFileName} · nada se ha escrito todavía en Productos.`}
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <HostlyKpiCard title="Filas detectadas" value={preview.summary.rowCount} variant="ice" />
                <HostlyKpiCard title="Listas para importar" value={preview.summary.createCount} variant="soft" />
                <HostlyKpiCard title="Revisar" value={preview.summary.reviewCount} variant="flat" />
                <HostlyKpiCard title="Bloqueadas" value={preview.summary.blockedCount} variant="flat" />
              </div>
            </HostlySection>

            <HostlySection stack="sm">
              <HostlySectionHeader
                title="Mapeo de columnas"
                description="Así interpreta Hostly las columnas de tu TPV. Las columnas no reconocidas se ignoran y nunca se escriben por accidente."
              />
              <HostlySurface variant="flat" className="overflow-x-auto p-0">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-[var(--hostly-line)] bg-[var(--hostly-surface-muted)]/60 text-[10px] uppercase tracking-wide text-[var(--hostly-ink-soft)]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">TPV anterior</th>
                      <th className="px-3 py-2 font-semibold">Hostly</th>
                      <th className="px-3 py-2 font-semibold">Confianza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.mapping.map((column) => (
                      <tr key={column.sourceColumn} className="border-b border-[var(--hostly-line)]/70 last:border-0">
                        <td className="px-3 py-2.5 font-medium text-[var(--hostly-navy-deep)]">{column.sourceColumn}</td>
                        <td className="px-3 py-2.5 text-[var(--hostly-ink-muted)]">
                          {column.targetField ? FIELD_LABELS[column.targetField] ?? column.targetField : "Ignorar"}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--hostly-ink-muted)]">
                          {column.targetField ? `${Math.round(column.confidence * 100)} %` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </HostlySurface>
            </HostlySection>

            {preview.warnings.length > 0 ? (
              <HostlySurface variant="flat" className="border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-950">Antes de importar</p>
                <ul className="mt-1 space-y-1 text-xs text-amber-900">
                  {preview.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
                </ul>
              </HostlySurface>
            ) : null}

            <HostlySection stack="sm">
              <HostlySectionHeader
                title="Productos detectados"
                description="Los conflictos requieren confirmación expresa. Los bloqueados nunca se importan."
              />
              <HostlySurface variant="flat" className="overflow-x-auto p-0">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-[var(--hostly-line)] bg-[var(--hostly-surface-muted)]/60 text-[10px] uppercase tracking-wide text-[var(--hostly-ink-soft)]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 font-semibold">Categoría</th>
                      <th className="px-3 py-2 font-semibold">PVP</th>
                      <th className="px-3 py-2 font-semibold">IVA detectado</th>
                      <th className="px-3 py-2 font-semibold">Stock / coste</th>
                      <th className="px-3 py-2 font-semibold">Estado</th>
                      <th className="px-3 py-2 font-semibold">Importar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--hostly-line)]/70 last:border-0">
                        <td className="px-3 py-2.5 align-top">
                          <p className="font-medium text-[var(--hostly-navy-deep)]">{item.name || `Fila ${item.rowNumber}`}</p>
                          {item.warnings.length ? (
                            <p className="mt-0.5 max-w-[320px] text-[10px] text-[var(--hostly-ink-muted)]">{item.warnings.join(" · ")}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 align-top text-[var(--hostly-ink-muted)]">{item.category ?? "—"}</td>
                        <td className="px-3 py-2.5 align-top text-[var(--hostly-ink-muted)]">{money(item.price)}</td>
                        <td className="px-3 py-2.5 align-top text-[var(--hostly-ink-muted)]">{item.taxRate == null ? "—" : `${item.taxRate} %`}</td>
                        <td className="px-3 py-2.5 align-top text-[var(--hostly-ink-muted)]">
                          {item.stock == null ? "—" : `${item.stock} ${item.unit}`} · {money(item.cost)}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <span className="font-semibold">
                            {item.decision === "create" ? "Listo" : item.decision === "review" ? "Revisar" : "Bloqueado"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          {item.decision === "create" ? (
                            <span className="text-emerald-800">Sí</span>
                          ) : item.decision === "review" ? (
                            <label className="flex min-h-[32px] items-center gap-2">
                              <input
                                type="checkbox"
                                checked={confirmedReviews.has(item.id)}
                                disabled={published != null || busy != null}
                                onChange={(event) => toggleReview(item.id, event.target.checked)}
                              />
                              Confirmar
                            </label>
                          ) : (
                            <span className="text-rose-800">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </HostlySurface>
            </HostlySection>

            <HostlySurface variant="ice" className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--hostly-navy-deep)]">3. Importar con control</p>
                  <p className="mt-1 text-xs text-[var(--hostly-ink-muted)]">
                    Se crearán {importableCount} productos. Hostly no sobrescribirá productos existentes sin tu confirmación.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {published ? (
                    <HostlyButton variant="destructive" disabled={busy != null} onClick={() => void handleRollback()}>
                      {busy === "rollback" ? "Deshaciendo…" : "Deshacer migración"}
                    </HostlyButton>
                  ) : (
                    <HostlyButton variant="primary" disabled={busy != null || importableCount === 0} onClick={() => void handlePublish()}>
                      {busy === "publish" ? "Importando…" : `Importar ${importableCount} productos`}
                    </HostlyButton>
                  )}
                </div>
              </div>
            </HostlySurface>
          </>
        ) : null}
      </HostlySection>
    </ConfigCartaWorkbench>
  );
}
