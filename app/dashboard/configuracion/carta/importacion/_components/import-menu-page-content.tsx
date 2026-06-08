"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  HostlyKpiCard,
  HostlySection,
  HostlySectionHeader,
  HostlySegmentedControl,
  HostlySurface,
  hostlyCx,
  hostlySegmentTabClassName,
} from "@/components/ui/hostly";
import { ConfigCartaWorkbench } from "../../../_components/config-carta-workbench";
import { ImportMenuRecentList } from "./import-menu-recent-list";
import { ImportMenuDebugPanel } from "./import-menu-debug-panel";
import { ImportMenuOperationalWarnings } from "./import-menu-operational-warnings";
import { ImportMenuReviewItemRow } from "./import-menu-review-item-row";
import {
  MissingCategoriesWizard,
  buildMissingCategoryRows,
  type MissingCategoryDraftRow,
} from "./missing-categories-wizard";
import type { PublishPreviewResult, PublishPreviewAction, PublishPreviewBadge } from "@/lib/carta/publish-preview-types";
import type { CategoryOutcomeMap, CreateMenuImportCategoriesResult } from "@/lib/carta/create-categories-types";
import type {
  MenuImportPublishItemResult,
  MenuImportPublishResult,
} from "@/lib/carta/publish-result-types";
import { requestMenuImportCreateCategories } from "@/lib/carta/request-menu-import-create-categories";
import { requestMenuImportPublishPreview } from "@/lib/carta/request-menu-import-publish-preview";
import { requestMenuImportPublish } from "@/lib/carta/request-menu-import-publish";
import {
  logClientPublishDraftState,
  logClientPublishRequest,
  logClientPublishResponse,
  logClientPublishPreview,
} from "@/lib/carta/publish-flow-client-diagnostics";
import { requestMenuImportProcess } from "@/lib/carta/request-menu-import-process";
import {
  flattenSectionsToItems,
  menuImportDocToUiDraft,
} from "@/lib/carta/menu-import-draft-mapper";
import { cartaTypeToMenuType } from "@/lib/carta/menu-import-type-map";
import type {
  ImportedMenuCartaType,
  ImportedMenuDraft,
  ImportedMenuItem,
  ImportedMenuSection,
  ImportedMenuSourceType,
  ImportedMenuSuggestedStation,
} from "@/lib/carta/imported-menu-types";
import {
  IMPORTED_MENU_CARTA_TYPE_LABELS,
  IMPORTED_MENU_STATION_LABELS,
  IMPORTED_MENU_STATION_OPTIONS,
} from "@/lib/carta/imported-menu-types";
import {
  createMenuImportDraft,
  getMenuImportDraft,
  listenMenuImportDrafts,
  updateMenuImportDraft,
  type MenuImportDraftDocument,
  type MenuImportDraftSummary,
} from "@/lib/firestore/menu-import-drafts";
import { logMenuImportDevAudit } from "@/lib/carta/menu-import-dev-audit";
import {
  logMenuImportDraftSaveError,
  summarizeMenuImportDraftSavePayload,
} from "@/lib/carta/menu-import-draft-save-diagnostics";
import { fetchCentralProductsOnce } from "@/lib/firestore/products";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import { uploadMenuImportFile } from "@/lib/storage/menu-import-files";
import type { MenuImportDebugReport } from "@/lib/carta/menu-import-debug-report-types";
import {
  buildMenuImportOperationalWarnings,
  mergeMenuImportOperationalWarnings,
} from "@/lib/carta/build-menu-import-operational-warnings";
import type { MenuImportOperationalWarning } from "@/lib/carta/menu-import-operational-warnings-types";

type InputMethod = ImportedMenuSourceType;

const INPUT_METHODS: { id: InputMethod; label: string; hint: string }[] = [
  { id: "image", label: "Foto de carta", hint: "Ideal desde móvil: saca una foto nítida" },
  { id: "pdf", label: "PDF / captura", hint: "Sube un PDF o imagen exportada" },
  { id: "qr_url", label: "URL menú QR", hint: "Pega el enlace del menú digital" },
];

const CARTA_TYPES = Object.entries(IMPORTED_MENU_CARTA_TYPE_LABELS) as [ImportedMenuCartaType, string][];

const HOW_IT_WORKS = [
  { step: "1", title: "Sube o enlaza", body: "Foto, PDF o URL del menú QR de tu restaurante." },
  { step: "2", title: "Revisa la propuesta", body: "Hostly sugiere productos, precios, categorías y estaciones." },
  { step: "3", title: "Publica con control", body: "Solo lo que confirmes llegará al catálogo en vivo." },
];

function previewActionLabel(action: PublishPreviewAction): string {
  if (action === "create") return "Crear";
  if (action === "possible_duplicate") return "Posible duplicado";
  return "Revisar";
}

function previewActionTone(action: PublishPreviewAction): string {
  if (action === "create") return "bg-emerald-50 text-emerald-900 border-emerald-200/80";
  if (action === "possible_duplicate") return "bg-amber-50 text-amber-950 border-amber-200/80";
  return "bg-rose-50 text-rose-950 border-rose-200/80";
}

function previewBadgeLabel(badge: PublishPreviewBadge): string {
  switch (badge) {
    case "nuevo":
      return "Nuevo";
    case "duplicado":
      return "Duplicado";
    case "revisar":
      return "Revisar";
    case "sin_categoria":
      return "Sin categoría";
  }
}

function previewBadgeTone(badge: PublishPreviewBadge): string {
  switch (badge) {
    case "nuevo":
      return "border-emerald-200/80 bg-emerald-50 text-emerald-900";
    case "duplicado":
      return "border-amber-200/80 bg-amber-50 text-amber-900";
    case "revisar":
      return "border-rose-200/80 bg-rose-50 text-rose-900";
    case "sin_categoria":
      return "border-slate-200/80 bg-slate-50 text-slate-800";
  }
}

function isPreviewRowPublishable(
  row: PublishPreviewResult["createProducts"][number],
  confirmDuplicates: Set<string>,
  confirmReviews: Set<string>,
  blockedItemIds: Set<string>,
): boolean {
  if (blockedItemIds.has(row.itemId)) return false;
  const hasValidPrice = typeof row.price === "number" && row.price > 0;
  const hasCategory = row.resolvedCategoryId != null;
  if (!hasValidPrice || !hasCategory) return false;
  if (row.action === "create") return true;
  if (row.action === "possible_duplicate" && confirmDuplicates.has(row.itemId)) return true;
  if (
    row.action === "review" &&
    (confirmReviews.has(row.itemId) || row.selectedForPublish === true)
  ) {
    return true;
  }
  return false;
}

function previewRowNonPublishReason(
  row: PublishPreviewResult["createProducts"][number],
  preview: PublishPreviewResult,
  confirmDuplicates: Set<string>,
  confirmReviews: Set<string>,
  blockedItemIds: Set<string>,
): string | null {
  if (isPreviewRowPublishable(row, confirmDuplicates, confirmReviews, blockedItemIds)) {
    return null;
  }

  const blocked = preview.blockedItems.find((entry) => entry.itemId === row.itemId);
  if (blocked?.reasons.length) return blocked.reasons.join(" · ");

  const reasons: string[] = [];
  if (!row.name.trim()) reasons.push("Nombre vacío");
  if (typeof row.price !== "number" || row.price <= 0) reasons.push("Precio inválido");
  if (!row.resolvedCategoryId) reasons.push("Categoría no creada");
  if (row.action === "review" && !confirmReviews.has(row.itemId) && row.selectedForPublish !== true) {
    reasons.push("Revisión humana pendiente");
  }
  if (row.action === "possible_duplicate" && !confirmDuplicates.has(row.itemId)) {
    reasons.push("Duplicado sin confirmar");
  }
  if (row.warnings.length > 0) {
    for (const warning of row.warnings) {
      if (!reasons.includes(warning)) reasons.push(warning);
    }
  }
  return reasons.length > 0 ? reasons.join(" · ") : "No apto para publicación";
}

function buildPostPublishByItemId(
  result: MenuImportPublishResult,
): Map<string, MenuImportPublishItemResult> {
  const map = new Map<string, MenuImportPublishItemResult>();
  for (const row of [
    ...result.created,
    ...result.confirmedDuplicates,
    ...result.alreadyPublished,
    ...result.skipped,
    ...result.errors,
  ]) {
    map.set(row.itemId, row);
  }
  return map;
}

type PublishPreviewPanelProps = {
  preview: PublishPreviewResult;
  confirmDuplicates: Set<string>;
  onToggleConfirmDuplicate: (itemId: string, checked: boolean) => void;
  confirmReviews: Set<string>;
  onToggleConfirmReview: (itemId: string, checked: boolean) => void;
  categoryOutcomes?: CategoryOutcomeMap;
  blockedItemIds: Set<string>;
};

function categoryExtraBadge(categoryName: string, outcomes?: CategoryOutcomeMap): string | null {
  const outcome = outcomes?.[categoryName];
  if (outcome === "created") return "Categoría creada";
  if (outcome === "reused") return "Reutilizada";
  return null;
}

function PublishPreviewPanel({
  preview,
  confirmDuplicates,
  onToggleConfirmDuplicate,
  confirmReviews,
  onToggleConfirmReview,
  categoryOutcomes,
  blockedItemIds,
}: PublishPreviewPanelProps) {
  return (
    <HostlySection stack="sm">
      <HostlySectionHeader
        title="Previsualización de publicación"
        description="Simulación segura — no se ha escrito nada en Productos ni categorías."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HostlyKpiCard title="Productos nuevos" value={preview.totals.createCount} variant="ice" />
        <HostlyKpiCard title="Posibles duplicados" value={preview.totals.duplicateCount} variant="flat" accentColor="rgba(180, 120, 40, 0.55)" />
        <HostlyKpiCard title="Bloqueados" value={preview.totals.blockedCount} variant="flat" />
        <HostlyKpiCard title="A revisar" value={preview.totals.reviewCount} variant="soft" />
      </div>

      {preview.warnings.length > 0 ? (
        <HostlySurface variant="flat" className="border-violet-200/80 bg-violet-50/70 p-3">
          <p className="text-[11px] font-semibold text-violet-950">Avisos globales</p>
          <ul className="mt-1 space-y-0.5 text-[10px] text-violet-900/90">
            {preview.warnings.map((w) => (
              <li key={w}>· {w}</li>
            ))}
          </ul>
        </HostlySurface>
      ) : null}

      <HostlySurface variant="flat" className="overflow-x-auto p-0">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-[var(--hostly-line)] bg-[var(--hostly-surface-muted)]/60 text-[10px] uppercase tracking-wide text-[var(--hostly-ink-soft)]">
            <tr>
              <th className="px-3 py-2 font-semibold">Nombre</th>
              <th className="px-3 py-2 font-semibold">Categoría</th>
              <th className="px-3 py-2 font-semibold">Estación</th>
              <th className="px-3 py-2 font-semibold">Acción</th>
              <th className="px-3 py-2 font-semibold">Confirmar</th>
              <th className="px-3 py-2 font-semibold">Motivo</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {preview.createProducts.map((row) => {
              const publishable = isPreviewRowPublishable(
                row,
                confirmDuplicates,
                confirmReviews,
                blockedItemIds,
              );
              const nonPublishReason = previewRowNonPublishReason(
                row,
                preview,
                confirmDuplicates,
                confirmReviews,
                blockedItemIds,
              );
              return (
              <tr key={row.itemId} className="border-b border-[var(--hostly-line)]/70 last:border-0">
                <td className="px-3 py-2.5 align-top">
                  <p className="font-medium text-[var(--hostly-navy-deep)]">{row.name}</p>
                  {typeof row.price === "number" ? (
                    <p className="mt-0.5 text-[10px] text-[var(--hostly-ink-muted)]">{row.price.toFixed(2)} €</p>
                  ) : (
                    <p className="mt-0.5 text-[10px] text-amber-800">Sin precio</p>
                  )}
                  {row.warnings.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-[10px] text-[var(--hostly-ink-soft)]">
                      {row.warnings.slice(0, 2).map((w) => (
                        <li key={w}>· {w}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 align-top text-[var(--hostly-ink-muted)]">
                  {row.suggestedCategory}
                  {!row.resolvedCategoryId ? (
                    <span className="mt-1 block text-[10px] text-amber-800">No resuelta</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 align-top text-[var(--hostly-ink-muted)]">
                  {IMPORTED_MENU_STATION_LABELS[row.suggestedStation]}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <span
                    className={hostlyCx(
                      "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      previewActionTone(row.action),
                    )}
                  >
                    {previewActionLabel(row.action)}
                  </span>
                </td>
                <td className="px-3 py-2.5 align-top">
                  {row.action === "possible_duplicate" ? (
                    <label className="flex items-center gap-1.5 text-[10px] text-[var(--hostly-ink-muted)]">
                      <input
                        type="checkbox"
                        checked={confirmDuplicates.has(row.itemId)}
                        onChange={(e) => onToggleConfirmDuplicate(row.itemId, e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-[var(--hostly-line-strong)]"
                      />
                      Crear igualmente
                    </label>
                  ) : row.action === "review" ? (
                    row.selectedForPublish ? (
                      <span className="text-[10px] font-medium text-emerald-800">
                        Marcado en revisión
                      </span>
                    ) : (
                    <label className="flex items-center gap-1.5 text-[10px] text-[var(--hostly-ink-muted)]">
                      <input
                        type="checkbox"
                        checked={confirmReviews.has(row.itemId)}
                        onChange={(e) => onToggleConfirmReview(row.itemId, e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-[var(--hostly-line-strong)]"
                      />
                      Confirmar revisión
                    </label>
                    )
                  ) : (
                    <span className="text-[10px] text-[var(--hostly-ink-soft)]">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top">
                  {publishable ? (
                    <span className="text-[10px] font-medium text-emerald-800">Listo para publicar</span>
                  ) : nonPublishReason ? (
                    <span className="text-[10px] leading-snug text-amber-950">{nonPublishReason}</span>
                  ) : (
                    <span className="text-[10px] text-[var(--hostly-ink-soft)]">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <div className="flex flex-wrap gap-1">
                    {publishable ? (
                      <span className="hostly-chip border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-900">
                        Publicable
                      </span>
                    ) : blockedItemIds.has(row.itemId) ? (
                      <span className="hostly-chip border-rose-200/80 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-900">
                        Bloqueado
                      </span>
                    ) : row.action === "review" ? (
                      <span className="hostly-chip border-rose-200/80 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-900">
                        A revisar
                      </span>
                    ) : row.action === "possible_duplicate" ? (
                      <span className="hostly-chip border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-900">
                        Duplicado
                      </span>
                    ) : (
                      <span className="hostly-chip border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-800">
                        Omitido
                      </span>
                    )}
                    {row.badges.map((badge) => (
                      <span
                        key={badge}
                        className={hostlyCx("hostly-chip px-2 py-0.5 text-[10px]", previewBadgeTone(badge))}
                      >
                        {previewBadgeLabel(badge)}
                      </span>
                    ))}
                    {categoryExtraBadge(row.suggestedCategory, categoryOutcomes) ? (
                      <span className="hostly-chip border-teal-200/80 bg-teal-50 px-2 py-0.5 text-[10px] text-teal-900">
                        {categoryExtraBadge(row.suggestedCategory, categoryOutcomes)}
                      </span>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
        {preview.createProducts.length === 0 ? (
          <p className="p-4 text-xs text-[var(--hostly-ink-muted)]">No hay filas en la previsualización.</p>
        ) : null}
      </HostlySurface>
    </HostlySection>
  );
}

function PublishResultPanel({ result }: { result: MenuImportPublishResult }) {
  const publishedTotal =
    result.totals.createdCount +
    result.totals.confirmedDuplicateCount +
    result.totals.alreadyPublishedCount;
  const notPublishedTotal = result.totals.skippedCount + result.totals.errorCount;
  const notPublishedRows = [...result.skipped, ...result.errors];
  const visibleInCentralCount = [
    ...result.created,
    ...result.alreadyPublished,
    ...result.confirmedDuplicates,
  ].filter((row) => row.visibleInTpv && row.productId).length;

  return (
    <HostlySurface variant="ice" className="p-4 sm:p-5">
      <p className="text-sm font-semibold text-[var(--hostly-navy-deep)]">Publicación completada</p>
      <p className="mt-0.5 text-xs text-[var(--hostly-ink-muted)]">
        Publicados: {publishedTotal} · No publicados: {notPublishedTotal}
        {visibleInCentralCount > 0
          ? ` · ${visibleInCentralCount} visible${visibleInCentralCount === 1 ? "" : "s"} en carta/TPV`
          : ""}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <HostlyKpiCard title="Creados" value={result.totals.createdCount} variant="ice" />
        <HostlyKpiCard title="Duplicados confirmados" value={result.totals.confirmedDuplicateCount} variant="flat" />
        <HostlyKpiCard title="Ya existentes" value={result.totals.alreadyPublishedCount} variant="soft" />
        <HostlyKpiCard title="Omitidos" value={result.totals.skippedCount} variant="flat" />
        <HostlyKpiCard title="Errores" value={result.totals.errorCount} variant="flat" accentColor="rgba(180, 60, 60, 0.45)" />
      </div>
      {notPublishedRows.length > 0 ? (
        <div className="mt-3 rounded-[var(--hostly-radius-md)] border border-amber-200/80 bg-amber-50/60 p-3">
          <p className="text-[11px] font-semibold text-amber-950">No publicados ({notPublishedRows.length})</p>
          <ul className="mt-1.5 space-y-1 text-[10px] text-amber-950/90">
            {notPublishedRows.map((row) => (
              <li key={`${row.outcome}-${row.itemId}`}>
                · {row.itemName} — {row.message ?? "Omitido en esta publicación"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {publishedTotal > 0 ? (
        <div className="mt-4">
          <Link
            href="/dashboard/configuracion/carta/productos"
            className="hostly-button-primary inline-flex w-full items-center justify-center sm:w-auto"
          >
            Ir a Productos
          </Link>
        </div>
      ) : null}
    </HostlySurface>
  );
}

function flattenItems(sections: ImportedMenuSection[]): ImportedMenuItem[] {
  return sections.flatMap((s) => s.items);
}

function updateItemInDraft(
  draft: ImportedMenuDraft,
  itemId: string,
  patch: Partial<ImportedMenuItem>,
): ImportedMenuDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    })),
  };
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden width={22} height={22}>
      <path
        d="M12 16V4m0 0L8 8m4-4 4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden width={20} height={20}>
      <path
        d="M12 3l1.4 4.3L18 9l-4.6 1.7L12 15l-1.4-4.3L6 9l4.6-1.7L12 3zM5 17l.8 2.4L8 20l-2.2.6L5 23l-.8-2.4L2 20l2.2-.6L5 17zM19 14l.6 1.8L21 16l-1.4.5L19 18l-.6-1.5L17 16l1.4-.5L19 14z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type UploadStepProps = {
  inputMethod: InputMethod;
  onInputMethodChange: (m: InputMethod) => void;
  cartaType: ImportedMenuCartaType;
  onCartaTypeChange: (t: ImportedMenuCartaType) => void;
  qrUrl: string;
  onQrUrlChange: (url: string) => void;
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  dragActive: boolean;
  onDragActiveChange: (active: boolean) => void;
  analyzing: boolean;
  canAnalyze: boolean;
  onAnalyze: () => void;
  scopeError?: string | null;
  flowError?: string | null;
};

function UploadStep({
  inputMethod,
  onInputMethodChange,
  cartaType,
  onCartaTypeChange,
  qrUrl,
  onQrUrlChange,
  selectedFile,
  onFileSelect,
  dragActive,
  onDragActiveChange,
  analyzing,
  canAnalyze,
  onAnalyze,
  scopeError,
  flowError,
}: UploadStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accept = inputMethod === "pdf" ? "application/pdf,image/*" : "image/*";
  const methodMeta = INPUT_METHODS.find((m) => m.id === inputMethod)!;

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0] ?? null;
      if (!file) return;
      onFileSelect(file);
    },
    [onFileSelect],
  );

  const showEmptyPremium = !selectedFile && (inputMethod !== "qr_url" || !qrUrl.trim());

  return (
    <HostlySection stack="lg">
      <HostlySectionHeader
        title="Importar carta con IA"
        description="Hostly analizará la carta y preparará una propuesta editable antes de publicar."
      />

      {scopeError ? (
        <HostlySurface variant="flat" className="border-amber-200/90 bg-amber-50/90 p-4">
          <p className="text-sm font-medium text-amber-950">{scopeError}</p>
        </HostlySurface>
      ) : null}

      {flowError ? (
        <HostlySurface variant="flat" className="border-rose-200/90 bg-rose-50/90 p-4">
          <p className="text-sm font-medium text-rose-950">{flowError}</p>
        </HostlySurface>
      ) : null}

      <HostlySurface variant="ice" className="p-4 sm:p-5">
        <p className="hostly-section-label mb-2.5">Método de entrada</p>
        <HostlySegmentedControl aria-label="Método de importación" className="w-full sm:w-auto">
          {INPUT_METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={inputMethod === m.id}
              className={hostlySegmentTabClassName("flex-1 sm:flex-none")}
              onClick={() => {
                onInputMethodChange(m.id);
                onFileSelect(null);
              }}
            >
              {m.label}
            </button>
          ))}
        </HostlySegmentedControl>
        <p className="mt-2 text-xs font-medium text-[var(--hostly-ink-soft)]">{methodMeta.hint}</p>
      </HostlySurface>

      {inputMethod === "qr_url" ? (
        <HostlySurface variant="soft" className="p-4 sm:p-5">
          <label htmlFor="import-menu-qr-url" className="hostly-section-label mb-2 block">
            URL del menú QR
          </label>
          <input
            id="import-menu-qr-url"
            type="url"
            inputMode="url"
            placeholder="https://tu-restaurante.com/carta"
            value={qrUrl}
            onChange={(e) => onQrUrlChange(e.target.value)}
            className="hostly-input w-full"
          />
        </HostlySurface>
      ) : (
        <HostlySurface
          variant="soft"
          className={hostlyCx(
            "relative p-4 sm:p-6 transition-colors",
            dragActive ? "border-[var(--hostly-ice-400)] bg-[var(--hostly-ice-50)]" : "",
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            onDragActiveChange(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            onDragActiveChange(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            onDragActiveChange(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDragActiveChange(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            capture={inputMethod === "image" ? "environment" : undefined}
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {selectedFile ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center sm:flex-row sm:text-left">
              <div className="flex h-12 w-12 items-center justify-center rounded-[var(--hostly-radius-md)] bg-[var(--hostly-ice-100)] text-[var(--hostly-accent)]">
                <UploadIcon />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--hostly-navy-deep)]">{selectedFile.name}</p>
                <p className="mt-0.5 text-xs text-[var(--hostly-ink-muted)]">
                  {(selectedFile.size / 1024).toFixed(0)} KB · listo para analizar
                </p>
              </div>
              <button type="button" className="hostly-button-secondary px-4 py-2 text-sm" onClick={() => onFileSelect(null)}>
                Cambiar archivo
              </button>
            </div>
          ) : (
            <div className="hostly-mobile-empty-state py-8 sm:py-10">
              <div className="hostly-mobile-empty-state__icon">
                <UploadIcon className="text-[var(--hostly-accent)]" />
              </div>
              <p className="hostly-mobile-empty-state__title">
                {inputMethod === "image" ? "Arrastra una foto de tu carta" : "Arrastra un PDF o captura"}
              </p>
              <p className="hostly-mobile-empty-state__desc">
                También puedes seleccionar desde el dispositivo. En móvil, usa la cámara para capturar la carta al momento.
              </p>
              <div className="hostly-mobile-empty-state__cta">
                <button
                  type="button"
                  className="hostly-button-secondary px-4"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Elegir archivo
                </button>
              </div>
            </div>
          )}
        </HostlySurface>
      )}

      <HostlySurface variant="flat" className="p-4 sm:p-5">
        <p className="hostly-section-label mb-2.5">Tipo de carta</p>
        <div className="flex flex-wrap gap-2">
          {CARTA_TYPES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={cartaType === value}
              className="hostly-pill"
              onClick={() => onCartaTypeChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </HostlySurface>

      {showEmptyPremium ? (
        <HostlySurface variant="elevated" className="border-dashed border-[var(--hostly-line-strong)] p-5 text-center">
          <div className="mx-auto flex max-w-md flex-col items-center gap-2">
            <SparkIcon className="text-[var(--hostly-ice-400)]" />
            <p className="text-sm font-semibold text-[var(--hostly-navy-deep)]">Aún no hay material para analizar</p>
            <p className="text-xs leading-relaxed text-[var(--hostly-ink-muted)]">
              Sube una foto, un PDF o pega la URL del menú QR. Hostly generará una propuesta editable — sin publicar nada automáticamente.
            </p>
          </div>
        </HostlySurface>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-xs leading-relaxed text-[var(--hostly-ink-muted)]">
          Hostly analizará la carta y preparará una propuesta editable antes de publicar.
        </p>
        <button
          type="button"
          className="hostly-button-primary w-full shrink-0 sm:w-auto"
          disabled={!canAnalyze || analyzing || !!scopeError}
          onClick={onAnalyze}
        >
          {analyzing ? "Analizando carta…" : "Analizar carta"}
        </button>
      </div>

      <HostlySurface variant="ice" className="p-4 sm:p-5">
        <HostlySectionHeader title="Cómo funciona" titleVariant="section" />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {HOW_IT_WORKS.map((h) => (
            <div key={h.step} className="min-w-0 rounded-[var(--hostly-radius-md)] border border-[var(--hostly-line)] bg-white/70 p-3">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--hostly-ice-100)] text-[10px] font-bold text-[var(--hostly-navy-deep)]">
                {h.step}
              </span>
              <p className="mt-2 text-xs font-semibold text-[var(--hostly-navy-deep)]">{h.title}</p>
              <p className="mt-1 text-[11px] leading-snug text-[var(--hostly-ink-muted)]">{h.body}</p>
            </div>
          ))}
        </div>
      </HostlySurface>
    </HostlySection>
  );
}

type ReviewStepProps = {
  draft: ImportedMenuDraft;
  onDraftChange: (draft: ImportedMenuDraft) => void;
  onReset: () => void;
  flowError?: string | null;
  onReprocessDraft?: () => void;
  reprocessing?: boolean;
  saving?: boolean;
  saveError?: string | null;
  previewLoading?: boolean;
  previewError?: string | null;
  preview?: PublishPreviewResult | null;
  onPreviewPublish?: () => void;
  confirmDuplicates: Set<string>;
  onToggleConfirmDuplicate: (itemId: string, checked: boolean) => void;
  confirmReviews: Set<string>;
  onToggleConfirmReview: (itemId: string, checked: boolean) => void;
  publishLoading?: boolean;
  publishError?: string | null;
  publishResult?: MenuImportPublishResult | null;
  onPublishConfirmed?: () => void;
  publishableCount: number;
  categoryWizardDismissed?: boolean;
  categoryRows: MissingCategoryDraftRow[];
  onCategoryRowChange: (key: string, patch: Partial<MissingCategoryDraftRow>) => void;
  onCreateCategories?: () => void;
  onDismissCategoryWizard?: () => void;
  createCategoriesLoading?: boolean;
  createCategoriesError?: string | null;
  createCategoriesResult?: CreateMenuImportCategoriesResult | null;
  categoryOutcomes?: CategoryOutcomeMap;
  pipelineDebugReport?: MenuImportDebugReport | null;
  manualProductCount?: number | null;
  onManualProductCountChange?: (value: number | null) => void;
  operationalWarnings?: MenuImportOperationalWarning[];
};

function ReviewStep({
  draft,
  onDraftChange,
  onReset,
  flowError,
  onReprocessDraft,
  reprocessing = false,
  saving,
  saveError,
  previewLoading,
  previewError,
  preview,
  onPreviewPublish,
  confirmDuplicates,
  onToggleConfirmDuplicate,
  confirmReviews,
  onToggleConfirmReview,
  publishLoading,
  publishError,
  publishResult,
  onPublishConfirmed,
  publishableCount,
  categoryWizardDismissed,
  categoryRows,
  onCategoryRowChange,
  onCreateCategories,
  onDismissCategoryWizard,
  createCategoriesLoading,
  createCategoriesError,
  createCategoriesResult,
  categoryOutcomes,
  pipelineDebugReport,
  manualProductCount,
  onManualProductCountChange,
  operationalWarnings = [],
}: ReviewStepProps) {
  const items = useMemo(() => flattenItems(draft.sections), [draft.sections]);
  const selectedCount = items.filter((i) => i.selectedForPublish).length;
  const reviewCount = items.filter((i) => i.needsReview).length;
  const publishedCount = items.filter((i) => i.publishStatus === "published").length;
  const notPublishedCount = Math.max(0, items.length - publishedCount);
  const previewBlockedItemIds = useMemo(
    () => new Set(preview?.blockedItems.map((entry) => entry.itemId) ?? []),
    [preview?.blockedItems],
  );
  const postPublishByItemId = useMemo(
    () => (publishResult ? buildPostPublishByItemId(publishResult) : new Map<string, MenuImportPublishItemResult>()),
    [publishResult],
  );
  const isAnalyzing = draft.status === "analyzing" || reprocessing;
  const isFailed = draft.status === "failed" && !reprocessing;
  const isEmpty = items.length === 0;
  const isUnprocessedEmpty =
    isEmpty && (draft.status === "draft" || draft.status === "ready" || draft.status === "failed");
  const canPublish =
    (draft.status === "ready" || draft.status === "partially_published") && items.length > 0;
  const showProductList = !isAnalyzing && !isFailed && !isUnprocessedEmpty && items.length > 0;
  const showPublishControls = canPublish && !isAnalyzing;

  const patchItem = useCallback(
    (itemId: string, patch: Partial<ImportedMenuItem>) => {
      onDraftChange(updateItemInDraft(draft, itemId, patch));
    },
    [draft, onDraftChange],
  );

  return (
    <HostlySection stack="lg">
      <HostlySectionHeader
        title="Revisar propuesta"
        description="Confirma nombres, precios, categorías y estaciones antes de publicar. Los cambios se guardan en el borrador — no en Productos."
      >
        <div className="flex flex-wrap items-center gap-2">
          {saving ? (
            <span className="text-[11px] font-medium text-[var(--hostly-ink-muted)]">Guardando borrador…</span>
          ) : null}
          <button type="button" className="hostly-button-secondary px-4 text-sm" onClick={onReset}>
            Volver a subir otra carta
          </button>
        </div>
      </HostlySectionHeader>

      {flowError ? (
        <HostlySurface variant="flat" className="border-amber-200/90 bg-amber-50/90 p-4">
          <p className="text-sm font-medium text-amber-950">{flowError}</p>
        </HostlySurface>
      ) : null}

      {!isAnalyzing && !isFailed && operationalWarnings.length > 0 ? (
        <ImportMenuOperationalWarnings warnings={operationalWarnings} />
      ) : null}

      {pipelineDebugReport ? (
        <div className="space-y-2">
          {onManualProductCountChange ? (
            <HostlySurface variant="flat" className="border-orange-200/80 bg-orange-50/50 p-3">
              <label className="flex flex-wrap items-center gap-2 text-xs text-orange-950">
                <span className="font-semibold">Conteo manual (dev):</span>
                <input
                  type="number"
                  min={0}
                  className="w-20 rounded border border-orange-200 bg-white px-2 py-1 text-sm"
                  placeholder="N"
                  value={manualProductCount ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    onManualProductCountChange(raw === "" ? null : Number(raw));
                  }}
                />
                <span className="text-[10px] text-orange-900/80">
                  Productos visibles en la carta real (p. ej. página de pastas)
                </span>
              </label>
            </HostlySurface>
          ) : null}
          <ImportMenuDebugPanel
            report={pipelineDebugReport}
            sourceImageUrl={draft.sourceUrl}
            manualProductCount={manualProductCount}
          />
        </div>
      ) : null}

      {draft.status === "published" || draft.status === "partially_published" ? (
        <HostlySurface variant="flat" className="border-violet-200/80 bg-violet-50/70 p-4">
          <p className="text-sm font-semibold text-violet-950">
            {draft.status === "published" ? "Borrador publicado" : "Publicación parcial"}
          </p>
          <p className="mt-1 text-xs text-violet-900/90">
            {publishedCount} de {items.length} producto{items.length === 1 ? "" : "s"} ya publicado
            {publishedCount === 1 ? "" : "s"} en Productos.
            {draft.status === "partially_published"
              ? " Revisa los pendientes antes de volver a publicar."
              : ""}
          </p>
        </HostlySurface>
      ) : null}

      {isAnalyzing ? (
        <HostlySurface variant="ice" className="p-4 sm:p-5">
          <p className="text-sm font-semibold text-[var(--hostly-navy-deep)]">Analizando carta…</p>
          <p className="mt-1 text-xs text-[var(--hostly-ink-muted)]">
            El borrador está en Firebase. Puedes recargar la página y retomarlo desde importaciones recientes.
          </p>
        </HostlySurface>
      ) : null}

      {isFailed ? (
        <HostlySurface variant="flat" className="border-rose-200/90 bg-rose-50/90 p-4">
          <p className="text-sm font-semibold text-rose-950">Error en el análisis</p>
          <p className="mt-1 text-xs text-rose-800">{draft.errorMessage ?? "No se pudo completar el análisis."}</p>
          {onReprocessDraft ? (
            <button
              type="button"
              className="hostly-button-primary mt-3"
              disabled={reprocessing}
              onClick={() => onReprocessDraft()}
            >
              {reprocessing ? "Analizando…" : "Volver a analizar este borrador"}
            </button>
          ) : null}
        </HostlySurface>
      ) : null}

      {isUnprocessedEmpty && !isAnalyzing && !isFailed ? (
        <HostlySurface variant="ice" className="p-4 sm:p-5">
          <p className="text-sm font-semibold text-[var(--hostly-navy-deep)]">Sin productos detectados</p>
          <p className="mt-1 text-xs text-[var(--hostly-ink-muted)]">
            {draft.status === "draft"
              ? "Este borrador tiene archivo guardado pero aún no se ha analizado, o el análisis no guardó productos."
              : "El análisis no generó productos en este borrador."}
            {draft.sourceLabel ? ` Origen: ${draft.sourceLabel}.` : ""}
          </p>
          {onReprocessDraft ? (
            <button
              type="button"
              className="hostly-button-primary mt-3"
              disabled={reprocessing}
              onClick={() => onReprocessDraft()}
            >
              {reprocessing ? "Analizando…" : "Analizar este borrador"}
            </button>
          ) : null}
        </HostlySurface>
      ) : null}

      {saveError ? (
        <HostlySurface variant="flat" className="border-amber-200/90 bg-amber-50/90 p-4">
          <p className="text-xs text-amber-950">{saveError}</p>
        </HostlySurface>
      ) : null}

      {showProductList && draft.aiWarnings && draft.aiWarnings.length > 0 ? (
        <HostlySurface variant="flat" className="border-violet-200/80 bg-violet-50/70 p-3">
          <p className="text-[11px] font-semibold text-violet-950">Avisos IA</p>
          <ul className="mt-1 space-y-0.5 text-[10px] text-violet-900/90">
            {draft.aiWarnings.map((w) => (
              <li key={w}>· {w}</li>
            ))}
          </ul>
        </HostlySurface>
      ) : null}

      {showProductList ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {publishResult || publishedCount > 0 ? (
              <>
                <HostlyKpiCard title="Publicados" value={publishedCount} variant="ice" />
                <HostlyKpiCard title="No publicados" value={notPublishedCount} variant="flat" accentColor="rgba(180, 120, 40, 0.55)" />
                <HostlyKpiCard title="Detectados" value={items.length} variant="soft" />
                <HostlyKpiCard
                  title="Tipo de carta"
                  value={IMPORTED_MENU_CARTA_TYPE_LABELS[draft.cartaType]}
                  helper={draft.sourceLabel ? `Origen: ${draft.sourceLabel}` : undefined}
                  variant="ice"
                />
              </>
            ) : (
              <>
                <HostlyKpiCard title="Productos detectados" value={items.length} variant="ice" />
                <HostlyKpiCard title="Marcados para publicar" value={selectedCount} variant="soft" />
                <HostlyKpiCard title="Necesitan revisión" value={reviewCount} variant="flat" accentColor="rgba(180, 120, 40, 0.55)" />
                <HostlyKpiCard
                  title="Tipo de carta"
                  value={IMPORTED_MENU_CARTA_TYPE_LABELS[draft.cartaType]}
                  helper={draft.sourceLabel ? `Origen: ${draft.sourceLabel}` : undefined}
                  variant="ice"
                />
              </>
            )}
          </div>

          {draft.sections.map((section) => (
            <HostlySection key={section.id} stack="sm">
              <HostlySectionHeader title={section.name} titleVariant="section" description={`${section.items.length} productos`} />
              <div className="flex flex-col gap-1.5">
                {section.items.map((item) => (
                  <ImportMenuReviewItemRow
                    key={item.id}
                    item={item}
                    postPublish={postPublishByItemId.get(item.id) ?? null}
                    onChange={(patch) => patchItem(item.id, patch)}
                  />
                ))}
              </div>
            </HostlySection>
          ))}

          <HostlySurface variant="ice" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="text-sm font-semibold text-[var(--hostly-navy-deep)]">Previsualizar publicación</p>
              <p className="mt-0.5 text-xs text-[var(--hostly-ink-muted)]">
                {selectedCount} producto{selectedCount === 1 ? "" : "s"} marcado{selectedCount === 1 ? "" : "s"} — simulación sin writes en Productos.
              </p>
            </div>
            <button
              type="button"
              className="hostly-button-primary w-full sm:w-auto"
              disabled={selectedCount === 0 || previewLoading || saving || !showPublishControls}
              onClick={() => onPreviewPublish?.()}
            >
              {previewLoading ? "Generando preview…" : "Previsualizar publicación"}
            </button>
          </HostlySurface>

          {previewError ? (
            <HostlySurface variant="flat" className="border-rose-200/90 bg-rose-50/90 p-4">
              <p className="text-xs text-rose-950">{previewError}</p>
            </HostlySurface>
          ) : null}

          {showPublishControls ? (
            <>
              {preview && !categoryWizardDismissed && preview.missingCategories.length > 0 ? (
                <MissingCategoriesWizard
                  missingCategories={preview.missingCategories}
                  rows={categoryRows}
                  onRowChange={onCategoryRowChange}
                  onCreate={() => onCreateCategories?.()}
                  onDismiss={() => onDismissCategoryWizard?.()}
                  loading={createCategoriesLoading}
                  error={createCategoriesError}
                  lastResult={createCategoriesResult}
                  categoryOutcomes={categoryOutcomes}
                />
              ) : null}

              {preview ? (
                <PublishPreviewPanel
                  preview={preview}
                  confirmDuplicates={confirmDuplicates}
                  onToggleConfirmDuplicate={onToggleConfirmDuplicate}
                  confirmReviews={confirmReviews}
                  onToggleConfirmReview={onToggleConfirmReview}
                  categoryOutcomes={categoryOutcomes}
                  blockedItemIds={previewBlockedItemIds}
                />
              ) : null}

              {preview ? (
                <HostlySurface variant="flat" className="flex flex-col gap-3 border-emerald-200/70 bg-emerald-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-emerald-950">Publicar en Productos</p>
                    <p className="mt-0.5 text-xs text-emerald-900/80">
                      {publishableCount} producto{publishableCount === 1 ? "" : "s"} listo{publishableCount === 1 ? "" : "s"} tras revalidación server-side.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="hostly-button-primary w-full sm:w-auto"
                    disabled={publishableCount === 0 || publishLoading || saving || previewLoading}
                    onClick={() => onPublishConfirmed?.()}
                  >
                    {publishLoading ? "Publicando…" : "Publicar confirmados"}
                  </button>
                </HostlySurface>
              ) : null}

              {publishError ? (
                <HostlySurface variant="flat" className="border-rose-200/90 bg-rose-50/90 p-4">
                  <p className="text-xs text-rose-950">{publishError}</p>
                </HostlySurface>
              ) : null}

              {publishResult ? <PublishResultPanel result={publishResult} /> : null}
            </>
          ) : null}
        </>
      ) : null}
    </HostlySection>
  );
}

type AuthScope = {
  userId: string | null;
  restaurantId: string | null;
  loading: boolean;
  error: string | null;
};

function menuImportDraftHasItems(doc: MenuImportDraftDocument): boolean {
  if (Array.isArray(doc.items) && doc.items.length > 0) return true;
  const uiDraft = menuImportDocToUiDraft(doc);
  return flattenSectionsToItems(uiDraft.sections).length > 0;
}

function resolveMenuImportDraftOpenStep(_doc: MenuImportDraftDocument): "upload" | "review" {
  return "review";
}

function resolveMenuImportDraftOpenMessage(doc: MenuImportDraftDocument): string | null {
  if (!menuImportDraftHasItems(doc)) {
    if (doc.status === "draft") {
      return "Este borrador aún no tiene productos detectados. Vuelve a analizarlo o sube la carta de nuevo.";
    }
    if (doc.status === "ready") {
      return "El análisis terminó sin productos detectados. Prueba con otra imagen o revisa el archivo subido.";
    }
  }
  return null;
}

export function ImportMenuPageContent() {
  const { user, restaurantId: profileRestaurantId, ready: authReady } = useAuth();
  const operationalRestaurantId = useMemo(
    () => resolveOperationalRestaurantId(profileRestaurantId),
    [profileRestaurantId],
  );
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [inputMethod, setInputMethod] = useState<InputMethod>("image");
  const [cartaType, setCartaType] = useState<ImportedMenuCartaType>("mixta");
  const [qrUrl, setQrUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [draft, setDraft] = useState<ImportedMenuDraft | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [recentDrafts, setRecentDrafts] = useState<MenuImportDraftSummary[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PublishPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmDuplicates, setConfirmDuplicates] = useState<Set<string>>(new Set());
  const [confirmReviews, setConfirmReviews] = useState<Set<string>>(new Set());
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<MenuImportPublishResult | null>(null);
  const [categoryRows, setCategoryRows] = useState<MissingCategoryDraftRow[]>([]);
  const [pipelineDebugReport, setPipelineDebugReport] = useState<MenuImportDebugReport | null>(null);
  const [processOperationalWarnings, setProcessOperationalWarnings] = useState<
    MenuImportOperationalWarning[]
  >([]);
  const [manualProductCount, setManualProductCount] = useState<number | null>(null);
  const [categoryWizardDismissed, setCategoryWizardDismissed] = useState(false);
  const [createCategoriesLoading, setCreateCategoriesLoading] = useState(false);
  const [createCategoriesError, setCreateCategoriesError] = useState<string | null>(null);
  const [createCategoriesResult, setCreateCategoriesResult] = useState<CreateMenuImportCategoriesResult | null>(null);
  const [categoryOutcomes, setCategoryOutcomes] = useState<CategoryOutcomeMap>({});
  const [saving, setSaving] = useState(false);
  const [openingDraft, setOpeningDraft] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [scope, setScope] = useState<AuthScope>({
    userId: null,
    restaurantId: null,
    loading: true,
    error: null,
  });

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextPersistRef = useRef(false);

  const inferStationForCategory = useCallback(
    (categoryName: string): ImportedMenuSuggestedStation => {
      if (!draft) return "none";
      const items = flattenItems(draft.sections).filter(
        (i) => i.suggestedCategory.trim().toLowerCase() === categoryName.trim().toLowerCase(),
      );
      if (items.length === 0) return "none";
      const counts = new Map<ImportedMenuSuggestedStation, number>();
      for (const item of items) {
        counts.set(item.suggestedStation, (counts.get(item.suggestedStation) ?? 0) + 1);
      }
      let best: ImportedMenuSuggestedStation = "none";
      let bestCount = 0;
      for (const [st, count] of counts) {
        if (count > bestCount) {
          best = st;
          bestCount = count;
        }
      }
      return best;
    },
    [draft],
  );

  useEffect(() => {
    if (!preview?.missingCategories.length) return;
    setCategoryRows((prev) => {
      const built = buildMissingCategoryRows(preview.missingCategories, inferStationForCategory);
      return built.map((row) => {
        const existing = prev.find((p) => p.key === row.key);
        if (!existing) return row;
        return {
          ...row,
          name: existing.name,
          suggestedStation: existing.suggestedStation,
          selected: existing.selected,
        };
      });
    });
  }, [preview?.generatedAt, preview?.missingCategories, inferStationForCategory]);

  const handleCategoryRowChange = useCallback((key: string, patch: Partial<MissingCategoryDraftRow>) => {
    setCategoryRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }, []);

  const runPreview = useCallback(async (draftId: string) => {
    const result = await requestMenuImportPublishPreview(draftId);
    if (!result.ok) {
      setPreview(null);
      setPreviewError(result.details ?? result.error);
      return false;
    }
    setPreview(result.preview);
    setPreviewError(null);
    logClientPublishPreview({
      draftId,
      preview: result.preview,
      publishableCount: result.preview.createProducts.filter(
        (row) => row.action === "create" && row.resolvedCategoryId != null && typeof row.price === "number" && row.price > 0,
      ).length,
      confirmReviews: [],
    });
    return true;
  }, []);

  const handleCreateCategories = useCallback(async () => {
    if (!activeDraftId || createCategoriesLoading) return;
    const selected = categoryRows.filter((r) => r.selected && r.name.trim());
    if (selected.length === 0) return;

    setCreateCategoriesLoading(true);
    setCreateCategoriesError(null);

    try {
      const result = await requestMenuImportCreateCategories(
        activeDraftId,
        selected.map((r) => ({
          name: r.name.trim(),
          suggestedStation: r.suggestedStation,
        })),
      );

      if (!result.ok) {
        setCreateCategoriesError(result.details ?? result.error);
        return;
      }

      setCreateCategoriesResult(result.result);

      const outcomes: CategoryOutcomeMap = { ...categoryOutcomes };
      for (const item of [...result.result.created, ...result.result.reused]) {
        outcomes[item.inputName] = item.outcome === "created" ? "created" : "reused";
      }
      setCategoryOutcomes(outcomes);

      await runPreview(activeDraftId);
    } catch {
      setCreateCategoriesError("No se pudieron crear las categorías.");
    } finally {
      setCreateCategoriesLoading(false);
    }
  }, [activeDraftId, categoryOutcomes, categoryRows, createCategoriesLoading, runPreview]);

  const canAnalyze =
    inputMethod === "qr_url" ? qrUrl.trim().length > 6 : selectedFile != null;

  useEffect(() => {
    if (!authReady) {
      setScope((prev) => ({ ...prev, loading: true }));
      return;
    }
    if (!user?.uid) {
      setScope({
        userId: null,
        restaurantId: null,
        loading: false,
        error: "Inicia sesión para importar cartas y guardar borradores.",
      });
      return;
    }
    const rid = operationalRestaurantId.trim();
    if (!rid) {
      setScope({
        userId: user.uid,
        restaurantId: null,
        loading: false,
        error: "Tu usuario no tiene restaurante asignado. Contacta con el administrador.",
      });
      return;
    }
    setScope({
      userId: user.uid,
      restaurantId: rid,
      loading: false,
      error: null,
    });
  }, [authReady, operationalRestaurantId, user?.uid]);

  useEffect(() => {
    if (!scope.restaurantId) {
      setRecentDrafts([]);
      setRecentLoading(false);
      return undefined;
    }
    setRecentLoading(true);
    const unsub = listenMenuImportDrafts(
      scope.restaurantId,
      (list) => {
        setRecentDrafts(list);
        setRecentLoading(false);
      },
      () => {
        setRecentLoading(false);
      },
    );
    return () => unsub();
  }, [scope.restaurantId]);

  useEffect(() => {
    if (!scope.restaurantId || recentLoading) return;
    let cancelled = false;
    void (async () => {
      let centralProductCount: number | null = null;
      let centralFetchError: string | null = null;
      try {
        const { docs, error } = await fetchCentralProductsOnce(scope.restaurantId!);
        if (!cancelled) {
          centralProductCount = docs.length;
          if (error) centralFetchError = error;
        }
      } catch (e) {
        if (!cancelled) {
          centralFetchError = e instanceof Error ? e.message : "No se pudo leer Productos.";
        }
      }
      if (!cancelled) {
        logMenuImportDevAudit({
          restaurantId: scope.restaurantId!,
          drafts: recentDrafts,
          centralProductCount,
          centralFetchError,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recentDrafts, recentLoading, scope.restaurantId]);

  const persistDraft = useCallback(
    async (nextDraft: ImportedMenuDraft): Promise<boolean> => {
      if (!scope.userId || !scope.restaurantId || !nextDraft.id) {
        logMenuImportDraftSaveError({
          phase: "persistDraft",
          reason: "precheck_failed",
          restaurantId: scope.restaurantId,
          draftId: nextDraft.id,
          userId: scope.userId,
          payload: {
            hasUserId: Boolean(scope.userId),
            hasRestaurantId: Boolean(scope.restaurantId),
            hasDraftId: Boolean(nextDraft.id),
            draftStatus: nextDraft.status,
          },
        });
        return false;
      }
      if (nextDraft.status !== "ready") return true;
      const savePayload = {
        sections: nextDraft.sections,
        items: flattenSectionsToItems(nextDraft.sections),
        updatedBy: scope.userId,
      };
      setSaving(true);
      setSaveError(null);
      try {
        await updateMenuImportDraft(scope.restaurantId, nextDraft.id, savePayload);
        return true;
      } catch (e) {
        logMenuImportDraftSaveError({
          phase: "persistDraft",
          reason: "updateMenuImportDraft_threw",
          error: e,
          restaurantId: scope.restaurantId,
          draftId: nextDraft.id,
          userId: scope.userId,
          payload: summarizeMenuImportDraftSavePayload(savePayload),
        });
        setSaveError(e instanceof Error ? e.message : "No se pudo guardar el borrador.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [scope.restaurantId, scope.userId],
  );

  const flushPersistDraft = useCallback(
    async (nextDraft: ImportedMenuDraft | null): Promise<boolean> => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      if (!nextDraft) return false;
      return persistDraft(nextDraft);
    },
    [persistDraft],
  );

  const handleDraftChange = useCallback(
    (nextDraft: ImportedMenuDraft) => {
      setDraft(nextDraft);
      setPreview(null);
      setPreviewError(null);
      setConfirmDuplicates(new Set());
      setConfirmReviews(new Set());
      setPublishResult(null);
      setPublishError(null);
      if (skipNextPersistRef.current) {
        skipNextPersistRef.current = false;
        return;
      }
      if (nextDraft.status !== "ready") return;
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        void persistDraft(nextDraft);
      }, 800);
    },
    [persistDraft],
  );

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  const handleOpenDraft = useCallback(
    async (draftId: string) => {
      if (!scope.restaurantId) {
        setFlowError(
          scope.error ??
            "No hay restaurante asignado. Inicia sesión o contacta con el administrador.",
        );
        return;
      }
      setOpeningDraft(true);
      setFlowError(null);
      setSaveError(null);
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      setConfirmDuplicates(new Set());
      setConfirmReviews(new Set());
      setPublishResult(null);
      setPublishError(null);
      setPublishLoading(false);
      setCreateCategoriesResult(null);
      setCreateCategoriesError(null);
      setCategoryOutcomes({});
      setCategoryWizardDismissed(false);
      setCategoryRows([]);
      try {
        const doc = await getMenuImportDraft(scope.restaurantId, draftId);
        if (!doc) {
          setFlowError("Borrador no encontrado o sin permisos.");
          setStep("review");
          setDraft(null);
          setActiveDraftId(draftId);
          return;
        }
        skipNextPersistRef.current = true;
        const uiDraft = menuImportDocToUiDraft(doc);
        setDraft(uiDraft);
        setActiveDraftId(draftId);
        setStep(resolveMenuImportDraftOpenStep(doc));
        const openMessage = resolveMenuImportDraftOpenMessage(doc);
        if (openMessage) setFlowError(openMessage);
      } catch (e) {
        setFlowError(e instanceof Error ? e.message : "No se pudo abrir el borrador.");
        setStep("review");
      } finally {
        setOpeningDraft(false);
      }
    },
    [scope.error, scope.restaurantId],
  );

  const handleReprocessDraft = useCallback(async () => {
    if (!activeDraftId || reprocessing || !scope.restaurantId) return;
    setReprocessing(true);
    setFlowError(null);
    setSaveError(null);
    setProcessOperationalWarnings([]);
    setPreview(null);
    setPreviewError(null);
    setPublishResult(null);
    setPublishError(null);
    skipNextPersistRef.current = true;
    setDraft((prev) =>
      prev
        ? { ...prev, status: "analyzing", sections: [], errorMessage: undefined }
        : {
            id: activeDraftId,
            createdAt: new Date().toISOString(),
            sourceType: "image",
            cartaType: "mixta",
            sections: [],
            status: "analyzing",
          },
    );
    setStep("review");
    try {
      const processResult = await requestMenuImportProcess(activeDraftId);
      if (!processResult.ok) {
        const detail = processResult.details ?? processResult.error;
        throw new Error(
          processResult.httpStatus === 409
            ? "El borrador ya se está procesando. Espera unos segundos e inténtalo de nuevo."
            : detail,
        );
      }
      if (processResult.debugReport) {
        setPipelineDebugReport(processResult.debugReport);
      }
      setProcessOperationalWarnings(processResult.operationalWarnings ?? []);
      const persisted = await getMenuImportDraft(scope.restaurantId, activeDraftId);
      if (!persisted) {
        throw new Error("El borrador se procesó pero no se pudo recargar.");
      }
      skipNextPersistRef.current = true;
      setDraft(menuImportDocToUiDraft(persisted));
      const openMessage = resolveMenuImportDraftOpenMessage(persisted);
      if (openMessage) setFlowError(openMessage);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al analizar la carta.";
      setFlowError(message);
      setProcessOperationalWarnings([]);
      try {
        const failedDoc = await getMenuImportDraft(scope.restaurantId, activeDraftId);
        if (failedDoc) {
          skipNextPersistRef.current = true;
          setDraft(menuImportDocToUiDraft(failedDoc));
        }
      } catch {
        /* ignore */
      }
    } finally {
      setReprocessing(false);
    }
  }, [activeDraftId, reprocessing, scope.restaurantId]);

  useEffect(() => {
    if (!activeDraftId || step !== "review" || !scope.restaurantId) return;
    const summary = recentDrafts.find((d) => d.id === activeDraftId);
    if (!summary) return;
    if (
      (summary.status === "ready" ||
        summary.status === "failed" ||
        summary.status === "analyzing" ||
        summary.status === "partially_published" ||
        summary.status === "published") &&
      draft?.status !== summary.status
    ) {
      void (async () => {
        try {
          const doc = await getMenuImportDraft(scope.restaurantId!, activeDraftId);
          if (!doc) return;
          skipNextPersistRef.current = true;
          setDraft(menuImportDocToUiDraft(doc));
        } catch {
          /* listener sync best-effort */
        }
      })();
    }
  }, [activeDraftId, draft?.status, recentDrafts, scope.restaurantId, step]);

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze || analyzing || scope.error || !scope.userId || !scope.restaurantId) return;
    setAnalyzing(true);
    setFlowError(null);
    setSaveError(null);
    setProcessOperationalWarnings([]);

    let draftId: string | null = null;
    try {
      draftId = await createMenuImportDraft(scope.restaurantId, {
        sourceType: inputMethod,
        menuType: cartaTypeToMenuType(cartaType),
        sourceUrl: inputMethod === "qr_url" ? qrUrl.trim() : undefined,
        originalFileName: selectedFile?.name,
        status: "draft",
        createdBy: scope.userId,
      });
      setActiveDraftId(draftId);

      let storagePath: string | undefined;
      let sourceUrl: string | undefined;
      let originalFileName: string | undefined;

      if (selectedFile && inputMethod !== "qr_url") {
        const uploaded = await uploadMenuImportFile({
          restaurantId: scope.restaurantId,
          draftId,
          file: selectedFile,
          userId: scope.userId,
          sourceType: inputMethod === "pdf" ? "pdf" : "image",
        });
        storagePath = uploaded.path;
        sourceUrl = uploaded.downloadUrl;
        originalFileName = uploaded.originalFileName;
      } else if (inputMethod === "qr_url") {
        sourceUrl = qrUrl.trim();
      }

      if (storagePath || sourceUrl || originalFileName) {
        await updateMenuImportDraft(scope.restaurantId, draftId, {
          ...(storagePath ? { storagePath } : {}),
          ...(sourceUrl ? { sourceUrl } : {}),
          ...(originalFileName ? { originalFileName } : {}),
          updatedBy: scope.userId,
        });
      }

      setStep("review");
      skipNextPersistRef.current = true;
      setDraft({
        id: draftId,
        createdAt: new Date().toISOString(),
        sourceType: inputMethod,
        cartaType,
        sourceLabel: inputMethod === "qr_url" ? qrUrl.trim() : selectedFile?.name,
        sections: [],
        status: "analyzing",
      });

      const processResult = await requestMenuImportProcess(draftId);
      if (!processResult.ok) {
        const detail = processResult.details ?? processResult.error;
        throw new Error(
          processResult.httpStatus === 409
            ? "El borrador ya se está procesando. Espera unos segundos e inténtalo de nuevo."
            : detail,
        );
      }
      if (processResult.debugReport) {
        setPipelineDebugReport(processResult.debugReport);
      }
      setProcessOperationalWarnings(processResult.operationalWarnings ?? []);

      const persisted = await getMenuImportDraft(scope.restaurantId, draftId);
      if (!persisted) {
        throw new Error("El borrador se procesó pero no se pudo recargar.");
      }
      skipNextPersistRef.current = true;
      setDraft(menuImportDocToUiDraft(persisted));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al analizar la carta.";
      setFlowError(message);
      setProcessOperationalWarnings([]);
      if (draftId && scope.restaurantId) {
        try {
          const failedDoc = await getMenuImportDraft(scope.restaurantId, draftId);
          if (failedDoc) {
            skipNextPersistRef.current = true;
            setDraft(menuImportDocToUiDraft(failedDoc));
            setStep("review");
          }
        } catch {
          /* ignore */
        }
      }
    } finally {
      setAnalyzing(false);
    }
  }, [
    analyzing,
    canAnalyze,
    cartaType,
    inputMethod,
    qrUrl,
    scope.error,
    scope.restaurantId,
    scope.userId,
    selectedFile,
  ]);

  const handleReset = useCallback(() => {
    setStep("upload");
    setDraft(null);
    setActiveDraftId(null);
    setSelectedFile(null);
    setQrUrl("");
    setDragActive(false);
    setFlowError(null);
    setSaveError(null);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
    setConfirmDuplicates(new Set());
    setConfirmReviews(new Set());
    setPublishResult(null);
    setPublishError(null);
    setPublishLoading(false);
    setCreateCategoriesResult(null);
    setCreateCategoriesError(null);
    setCategoryOutcomes({});
    setCategoryWizardDismissed(false);
    setCategoryRows([]);
    setPipelineDebugReport(null);
    setManualProductCount(null);
    setProcessOperationalWarnings([]);
  }, []);

  const unresolvedCategoryItemCount = useMemo(() => {
    if (!preview?.missingCategories?.length) return 0;
    const itemIds = new Set<string>();
    for (const row of preview.missingCategories) {
      for (const itemId of row.itemIds) itemIds.add(itemId);
    }
    return itemIds.size;
  }, [preview?.missingCategories]);

  const operationalWarnings = useMemo(() => {
    if (!draft) return [];
    const items = flattenSectionsToItems(draft.sections);
    const fromDraft = buildMenuImportOperationalWarnings({
      sourceType: draft.sourceType,
      parserWarnings: draft.parserWarnings,
      rawTextLength: draft.rawTextLength,
      itemCount: items.length,
      unresolvedCategoryItemCount,
    });
    return mergeMenuImportOperationalWarnings(processOperationalWarnings, fromDraft);
  }, [draft, processOperationalWarnings, unresolvedCategoryItemCount]);

  const previewBlockedItemIds = useMemo(
    () => new Set(preview?.blockedItems.map((item) => item.itemId) ?? []),
    [preview?.blockedItems],
  );

  const publishableCount = useMemo(() => {
    if (!preview) return 0;
    return preview.createProducts.filter((row) =>
      isPreviewRowPublishable(row, confirmDuplicates, confirmReviews, previewBlockedItemIds),
    ).length;
  }, [preview, confirmDuplicates, confirmReviews, previewBlockedItemIds]);

  const handleToggleConfirmDuplicate = useCallback((itemId: string, checked: boolean) => {
    setConfirmDuplicates((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  const handleToggleConfirmReview = useCallback((itemId: string, checked: boolean) => {
    setConfirmReviews((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  const handlePreviewPublish = useCallback(async () => {
    if (!activeDraftId || previewLoading || !draft) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPublishResult(null);
    setPublishError(null);
    setConfirmDuplicates(new Set());
    setConfirmReviews(new Set());
    setCreateCategoriesResult(null);
    setCreateCategoriesError(null);
    setCategoryOutcomes({});
    setCategoryWizardDismissed(false);
    try {
      const persisted = await flushPersistDraft(draft);
      if (!persisted) {
        setPreview(null);
        setPreviewError(
          "No se pudo guardar el borrador antes de previsualizar. Revisa los cambios e inténtalo de nuevo.",
        );
        return;
      }
      const ok = await runPreview(activeDraftId);
      if (!ok) setPreview(null);
    } catch {
      setPreview(null);
      setPreviewError("No se pudo generar la previsualización.");
    } finally {
      setPreviewLoading(false);
    }
  }, [activeDraftId, draft, flushPersistDraft, previewLoading, runPreview]);

  const handlePublishConfirmed = useCallback(async () => {
    if (!activeDraftId || !preview || publishLoading || publishableCount === 0) return;
    if (!scope.restaurantId) return;

    setPublishLoading(true);
    setPublishError(null);

    const draftItems = flattenSectionsToItems(draft?.sections ?? []);
    logClientPublishDraftState({
      draftId: activeDraftId,
      items: draftItems,
      confirmReviews: [...confirmReviews],
      confirmDuplicates: [...confirmDuplicates],
    });
    logClientPublishRequest({
      draftId: activeDraftId,
      confirmReviews: [...confirmReviews],
      confirmDuplicates: [...confirmDuplicates],
      publishableCount,
    });

    try {
      const result = await requestMenuImportPublish(activeDraftId, {
        confirmDuplicates: [...confirmDuplicates],
        confirmReviews: [...confirmReviews],
      });
      if (!result.ok) {
        setPublishError(result.details ?? result.error);
        return;
      }

      let publishResult = result.result;
      logClientPublishResponse({ draftId: activeDraftId, result: publishResult });
      setPublishResult(publishResult);

      const doc = await getMenuImportDraft(scope.restaurantId, activeDraftId);
      if (doc) {
        skipNextPersistRef.current = true;
        setDraft(menuImportDocToUiDraft(doc));
      }
    } catch {
      setPublishError("No se pudo completar la publicación.");
    } finally {
      setPublishLoading(false);
    }
  }, [
    activeDraftId,
    confirmDuplicates,
    confirmReviews,
    preview,
    publishLoading,
    publishableCount,
    scope.restaurantId,
    draft,
  ]);

  const mainPanel =
    step === "upload" ? (
      <UploadStep
        inputMethod={inputMethod}
        onInputMethodChange={setInputMethod}
        cartaType={cartaType}
        onCartaTypeChange={setCartaType}
        qrUrl={qrUrl}
        onQrUrlChange={setQrUrl}
        selectedFile={selectedFile}
        onFileSelect={setSelectedFile}
        dragActive={dragActive}
        onDragActiveChange={setDragActive}
        analyzing={analyzing}
        canAnalyze={canAnalyze}
        onAnalyze={() => void handleAnalyze()}
        scopeError={scope.loading ? "Comprobando sesión…" : scope.error}
        flowError={flowError}
      />
    ) : draft ? (
      <ReviewStep
        draft={draft}
        onDraftChange={handleDraftChange}
        onReset={handleReset}
        flowError={flowError}
        onReprocessDraft={() => void handleReprocessDraft()}
        reprocessing={reprocessing}
        saving={saving}
        saveError={saveError}
        preview={preview}
        previewLoading={previewLoading}
        previewError={previewError}
        onPreviewPublish={() => void handlePreviewPublish()}
        confirmDuplicates={confirmDuplicates}
        onToggleConfirmDuplicate={handleToggleConfirmDuplicate}
        confirmReviews={confirmReviews}
        onToggleConfirmReview={handleToggleConfirmReview}
        publishLoading={publishLoading}
        publishError={publishError}
        publishResult={publishResult}
        onPublishConfirmed={() => void handlePublishConfirmed()}
        publishableCount={publishableCount}
        categoryWizardDismissed={categoryWizardDismissed}
        categoryRows={categoryRows}
        onCategoryRowChange={handleCategoryRowChange}
        onCreateCategories={() => void handleCreateCategories()}
        onDismissCategoryWizard={() => setCategoryWizardDismissed(true)}
        createCategoriesLoading={createCategoriesLoading}
        createCategoriesError={createCategoriesError}
        createCategoriesResult={createCategoriesResult}
        categoryOutcomes={categoryOutcomes}
        pipelineDebugReport={pipelineDebugReport}
        manualProductCount={manualProductCount}
        onManualProductCountChange={setManualProductCount}
        operationalWarnings={operationalWarnings}
      />
    ) : (
      <HostlySection stack="md">
        <HostlySectionHeader
          title="Revisión del borrador"
          titleVariant="section"
          description={openingDraft ? "Cargando borrador…" : "Selecciona un borrador de la lista o sube una carta nueva."}
        />
        {flowError ? (
          <HostlySurface variant="flat" className="border-amber-200/90 bg-amber-50/90 p-4">
            <p className="text-sm font-medium text-amber-950">{flowError}</p>
          </HostlySurface>
        ) : null}
      </HostlySection>
    );

  return (
    <ConfigCartaWorkbench
      title="Importar carta con IA"
      description="Sube una foto, PDF o URL de menú QR. Hostly preparará una propuesta editable — siempre con revisión humana antes de publicar en Productos."
    >
      <div className="hostly-carta-config-layout-split">
        <div className="min-w-0">{mainPanel}</div>
        <aside className="hostly-carta-config-layout-split__aside min-w-0">
          <ImportMenuRecentList
            drafts={recentDrafts}
            activeDraftId={activeDraftId}
            loading={scope.loading || recentLoading}
            onOpenDraft={(id) => void handleOpenDraft(id)}
            onNewImport={handleReset}
          />
        </aside>
      </div>
    </ConfigCartaWorkbench>
  );
}
