"use client";

import { useMemo, useState } from "react";
import {
  HostlyButton,
  HostlyKpiCard,
  HostlySection,
  HostlySectionHeader,
  HostlySurface,
} from "@/components/ui/hostly";
import {
  requestPosLayoutPreview,
  requestPosLayoutPublish,
  requestPosLayoutRollback,
} from "@/lib/pos-migration/client";
import type { PosLayoutPreview, PosLayoutPublishResult } from "@/lib/pos-migration/layout-types";

const FIELD_LABELS: Record<string, string> = {
  name: "Mesa",
  floorPlan: "Plano / sala",
  zone: "Zona",
  seats: "Comensales",
  x: "X",
  y: "Y",
  width: "Ancho",
  height: "Alto",
  shape: "Forma",
};

function shapeLabel(shape: "square" | "round" | "rect"): string {
  if (shape === "round") return "Redonda";
  if (shape === "rect") return "Rectangular";
  return "Cuadrada";
}

export function PosLayoutMigrationPanel() {
  const [preview, setPreview] = useState<PosLayoutPreview | null>(null);
  const [published, setPublished] = useState<PosLayoutPublishResult | null>(null);
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
    const response = await requestPosLayoutPreview(file);
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
    const response = await requestPosLayoutPublish(preview.migrationId, [...confirmedReviews]);
    if (!response.ok) {
      setMessage({ tone: "error", text: response.details || response.error });
      setBusy(null);
      return;
    }
    setPublished(response.result);
    setMessage({
      tone: "success",
      text: `Mapa importado: ${response.result.createdTableIds.length} mesas, ${response.result.createdZoneIds.length} zonas y ${response.result.createdFloorPlanIds.length} planos nuevos.`,
    });
    setBusy(null);
  }

  async function rollback() {
    if (!preview || !published) return;
    const accepted = window.confirm(
      "¿Deshacer la migración del mapa? Solo se eliminarán planos, zonas y mesas creados por esta importación que sigan siendo seguros de retirar.",
    );
    if (!accepted) return;
    setBusy("rollback");
    setMessage(null);
    const response = await requestPosLayoutRollback(preview.migrationId);
    if (!response.ok) {
      setMessage({ tone: "error", text: response.details || response.error });
      setBusy(null);
      return;
    }
    setPublished(null);
    setMessage({
      tone: "success",
      text: `Mapa deshecho: ${response.result.deletedTableIds.length} mesas, ${response.result.deletedZoneIds.length} zonas y ${response.result.deletedFloorPlanIds.length} planos retirados.`,
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
    <HostlySection stack="md">
      <HostlySectionHeader
        title="Salas, zonas y mesas"
        description="Importa también el mapa operativo del TPV anterior. Hostly reconstruye planos, zonas y mesas sin sobrescribir los existentes."
      />

      <HostlySurface variant="ice" className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--hostly-navy-deep)]">1. Sube la exportación de mesas</p>
            <p className="mt-1 text-xs text-[var(--hostly-ink-muted)]">
              CSV, TSV o TXT. Detectamos mesa, sala/plano, zona, comensales, posición, tamaño y forma.
            </p>
            <p className="mt-1 text-[11px] text-[var(--hostly-ink-soft)]">
              Si el archivo no contiene coordenadas, Hostly crea una distribución ordenada y editable automáticamente.
            </p>
          </div>
          <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[var(--hostly-radius-button)] border border-[var(--hostly-line-strong)] bg-white px-4 text-sm font-semibold text-[var(--hostly-navy-deep)]">
            {busy === "preview" ? "Analizando…" : "Elegir mesas"}
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
              title="2. Revisa el mapa detectado"
              description={`${preview.sourceFileName} · todavía no se ha modificado el mapa TPV.`}
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <HostlyKpiCard title="Mesas" value={preview.summary.rowCount} variant="ice" />
              <HostlyKpiCard title="Listas" value={preview.summary.createCount} variant="soft" />
              <HostlyKpiCard title="Revisar" value={preview.summary.reviewCount} variant="flat" />
              <HostlyKpiCard title="Bloqueadas" value={preview.summary.blockedCount} variant="flat" />
              <HostlyKpiCard title="Planos" value={preview.summary.floorPlanCount} variant="flat" />
              <HostlyKpiCard title="Zonas" value={preview.summary.zoneCount} variant="flat" />
            </div>
          </HostlySection>

          <HostlySection stack="sm">
            <HostlySectionHeader title="Mapeo de columnas del plano" description="Las columnas no reconocidas se ignoran." />
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
            <HostlySectionHeader
              title="Mesas detectadas"
              description="Los nombres duplicados se proponen con un sufijo y requieren confirmación expresa."
            />
            <HostlySurface variant="flat" className="overflow-x-auto p-0">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-[var(--hostly-line)] bg-[var(--hostly-surface-muted)]/60 text-[10px] uppercase tracking-wide text-[var(--hostly-ink-soft)]">
                  <tr><th className="px-3 py-2">Mesa</th><th className="px-3 py-2">Plano</th><th className="px-3 py-2">Zona</th><th className="px-3 py-2">Comensales</th><th className="px-3 py-2">Forma</th><th className="px-3 py-2">Posición</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Importar</th></tr>
                </thead>
                <tbody>
                  {preview.items.map((item) => (
                    <tr key={item.id} className="border-b border-[var(--hostly-line)]/70 last:border-0">
                      <td className="px-3 py-2.5 align-top">
                        <p className="font-medium">{item.finalName || `Fila ${item.rowNumber}`}</p>
                        {item.finalName !== item.sourceName ? <p className="text-[10px] text-amber-700">Antes: {item.sourceName}</p> : null}
                        {item.warnings.length ? <p className="mt-0.5 max-w-[280px] text-[10px] text-[var(--hostly-ink-muted)]">{item.warnings.join(" · ")}</p> : null}
                      </td>
                      <td className="px-3 py-2.5 align-top">{item.floorPlanName}</td>
                      <td className="px-3 py-2.5 align-top">{item.zoneName}</td>
                      <td className="px-3 py-2.5 align-top">{item.seats}</td>
                      <td className="px-3 py-2.5 align-top">{shapeLabel(item.shape)}</td>
                      <td className="px-3 py-2.5 align-top">{item.x == null || item.y == null ? "Automática" : `${Math.round(item.x)}, ${Math.round(item.y)}`}</td>
                      <td className="px-3 py-2.5 align-top font-semibold">{item.decision === "create" ? "Lista" : item.decision === "review" ? "Revisar" : "Bloqueada"}</td>
                      <td className="px-3 py-2.5 align-top">
                        {item.decision === "create" ? "Sí" : item.decision === "review" ? (
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={confirmedReviews.has(item.id)}
                              disabled={published != null || busy != null}
                              onChange={(event) => toggleReview(item.id, event.target.checked)}
                            />
                            Confirmar
                          </label>
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
              <div>
                <p className="text-sm font-semibold">3. Crear el mapa operativo</p>
                <p className="mt-1 text-xs text-[var(--hostly-ink-muted)]">
                  Se crearán {importableCount} mesas. Los planos y zonas existentes se reutilizan por nombre y nunca se sobrescriben silenciosamente.
                </p>
              </div>
              {published ? (
                <HostlyButton variant="destructive" disabled={busy != null} onClick={() => void rollback()}>
                  {busy === "rollback" ? "Deshaciendo…" : "Deshacer mapa"}
                </HostlyButton>
              ) : (
                <HostlyButton variant="primary" disabled={busy != null || importableCount === 0} onClick={() => void publish()}>
                  {busy === "publish" ? "Creando mapa…" : `Importar ${importableCount} mesas`}
                </HostlyButton>
              )}
            </div>
          </HostlySurface>
        </>
      ) : null}
    </HostlySection>
  );
}
