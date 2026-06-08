"use client";

import { useState } from "react";
import { HostlySurface, hostlyCx } from "@/components/ui/hostly";
import type { ImportedMenuItem, ImportedMenuSuggestedStation } from "@/lib/carta/imported-menu-types";
import {
  IMPORTED_MENU_STATION_LABELS,
  IMPORTED_MENU_STATION_OPTIONS,
} from "@/lib/carta/imported-menu-types";
import type { MenuImportPublishItemResult } from "@/lib/carta/publish-result-types";

type ItemPublishDisplayState = {
  primaryLabel: string | null;
  primaryTone: string;
  detailMessage?: string;
  locked: boolean;
  suppressReviewChips: boolean;
};

function resolveItemPublishDisplayState(
  item: ImportedMenuItem,
  postPublish?: MenuImportPublishItemResult | null,
): ItemPublishDisplayState {
  if (item.publishStatus === "published") {
    return {
      primaryLabel: "Publicado",
      primaryTone: "border-emerald-200/80 bg-emerald-50 text-emerald-900",
      locked: true,
      suppressReviewChips: true,
    };
  }
  if (item.publishStatus === "error") {
    return {
      primaryLabel: "Error",
      primaryTone: "border-rose-200/80 bg-rose-50 text-rose-900",
      locked: true,
      suppressReviewChips: true,
    };
  }
  if (item.publishStatus === "skipped") {
    return {
      primaryLabel: "Omitido",
      primaryTone: "border-amber-200/80 bg-amber-50 text-amber-900",
      locked: true,
      suppressReviewChips: true,
    };
  }

  if (postPublish) {
    if (
      postPublish.outcome === "created" ||
      postPublish.outcome === "confirmed_duplicate" ||
      postPublish.outcome === "already_published"
    ) {
      return {
        primaryLabel: "Publicado",
        primaryTone: "border-emerald-200/80 bg-emerald-50 text-emerald-900",
        locked: true,
        suppressReviewChips: true,
      };
    }
    if (postPublish.outcome === "skipped") {
      return {
        primaryLabel: "Omitido",
        primaryTone: "border-amber-200/80 bg-amber-50 text-amber-900",
        detailMessage: postPublish.message,
        locked: true,
        suppressReviewChips: false,
      };
    }
    if (postPublish.outcome === "error") {
      return {
        primaryLabel: "Error",
        primaryTone: "border-rose-200/80 bg-rose-50 text-rose-900",
        detailMessage: postPublish.message,
        locked: true,
        suppressReviewChips: true,
      };
    }
  }

  return {
    primaryLabel: null,
    primaryTone: "",
    locked: false,
    suppressReviewChips: false,
  };
}

function formatEuroPrice(price: number | undefined): string {
  if (price == null || !Number.isFinite(price)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function shouldShowRawTextDetails(item: ImportedMenuItem): boolean {
  const raw = item.rawText?.trim();
  if (!raw) return false;
  const name = item.name.trim();
  if (!name) return true;
  if (raw.includes("\n")) return true;
  if (raw.length > name.length + 16) return true;
  return raw.toLowerCase() !== name.toLowerCase();
}

function metaSectionLabel(item: ImportedMenuItem): string {
  const section = item.sectionName?.trim();
  const category = item.suggestedCategory?.trim();
  if (section && category && section.toLowerCase() !== category.toLowerCase()) {
    return `${section} · ${category}`;
  }
  return category || section || "Sin categoría";
}

export type ImportMenuReviewItemRowProps = {
  item: ImportedMenuItem;
  onChange: (patch: Partial<ImportedMenuItem>) => void;
  postPublish?: MenuImportPublishItemResult | null;
};

export function ImportMenuReviewItemRow({
  item,
  onChange,
  postPublish = null,
}: ImportMenuReviewItemRowProps) {
  const [editingDetails, setEditingDetails] = useState(false);
  const displayConfidence = item.aiConfidence ?? item.confidence;
  const publishState = resolveItemPublishDisplayState(item, postPublish);
  const showRawDetails = shouldShowRawTextDetails(item);
  const lowConfidence = displayConfidence < 75;

  return (
    <HostlySurface
      variant="flat"
      className={hostlyCx(
        "border-[var(--hostly-line)] px-3 py-2.5 transition-colors sm:px-3.5",
        item.selectedForPublish && !publishState.locked && "border-sky-200/70 bg-sky-50/25",
        publishState.primaryLabel === "Publicado" && "border-emerald-200/70 bg-emerald-50/25",
        publishState.primaryLabel === "Omitido" && "border-amber-200/70 bg-amber-50/20",
        publishState.primaryLabel === "Error" && "border-rose-200/70 bg-rose-50/25",
      )}
    >
      <div className="flex items-start gap-2.5">
        <label
          className="flex shrink-0 cursor-pointer items-center pt-0.5"
          title={publishState.locked ? "Ya publicado" : "Incluir al publicar"}
        >
          <input
            type="checkbox"
            checked={item.selectedForPublish}
            disabled={publishState.locked}
            onChange={(e) => onChange({ selectedForPublish: e.target.checked })}
            className="h-4 w-4 rounded border-[var(--hostly-line-strong)] text-[var(--hostly-navy-deep)] disabled:opacity-45"
          />
        </label>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <input
              type="text"
              value={item.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className={hostlyCx(
                "min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold leading-snug text-[var(--hostly-navy-deep)]",
                "placeholder:text-[var(--hostly-ink-soft)] focus:outline-none focus:ring-0",
                "border-b border-transparent focus:border-[var(--hostly-line-strong)]",
              )}
              placeholder="Nombre del producto"
            />
            <input
              type="number"
              min={0}
              step={0.1}
              value={item.price ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                onChange({ price: v === "" ? undefined : Number(v) });
              }}
              className={hostlyCx(
                "w-[5rem] shrink-0 border-0 bg-transparent p-0 text-right text-sm font-semibold tabular-nums text-[var(--hostly-navy-deep)]",
                "focus:outline-none focus:ring-0 border-b border-transparent focus:border-[var(--hostly-line-strong)]",
              )}
              placeholder="—"
              aria-label={`Precio de ${item.name}`}
              title={formatEuroPrice(item.price)}
            />
          </div>

          {item.description?.trim() ? (
            <p className="text-xs leading-snug text-[var(--hostly-ink-muted)] line-clamp-2">
              {item.description.trim()}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] text-[var(--hostly-ink-soft)]">{metaSectionLabel(item)}</span>
            <span className="text-[10px] text-[var(--hostly-ink-soft)]">·</span>
            <span className="text-[11px] text-[var(--hostly-ink-soft)]">
              {IMPORTED_MENU_STATION_LABELS[item.suggestedStation]}
            </span>

            {!publishState.suppressReviewChips && item.needsReview ? (
              <span className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-50 px-1.5 py-px text-[10px] font-medium text-sky-900">
                Revisar
              </span>
            ) : null}
            {!publishState.suppressReviewChips && item.duplicateOf ? (
              <span className="inline-flex items-center rounded-full border border-amber-200/80 bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-900">
                Duplicado
              </span>
            ) : null}
            {publishState.primaryLabel ? (
              <span
                className={hostlyCx(
                  "inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-medium",
                  publishState.primaryTone,
                )}
              >
                {publishState.primaryLabel}
              </span>
            ) : null}
            {!publishState.locked && item.selectedForPublish ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200/70 bg-emerald-50/80 px-1.5 py-px text-[10px] font-medium text-emerald-900">
                Se publicará
              </span>
            ) : null}
            {!publishState.locked && !item.selectedForPublish ? (
              <span className="inline-flex items-center rounded-full border border-[var(--hostly-line)] bg-white px-1.5 py-px text-[10px] font-medium text-[var(--hostly-ink-soft)]">
                No publicar
              </span>
            ) : null}
            {lowConfidence && !publishState.suppressReviewChips ? (
              <span
                className="inline-flex items-center rounded-full border border-[var(--hostly-line)] bg-white px-1.5 py-px text-[10px] text-[var(--hostly-ink-soft)]"
                title={`Confianza ${displayConfidence}%`}
              >
                {displayConfidence}%
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              className="text-[10px] font-medium text-[var(--hostly-ink-soft)] underline-offset-2 hover:text-[var(--hostly-navy-deep)] hover:underline"
              onClick={() => setEditingDetails((v) => !v)}
            >
              {editingDetails ? "Ocultar ajustes" : "Ajustar categoría y estación"}
            </button>
            {showRawDetails ? (
              <details className="inline text-[10px] text-[var(--hostly-ink-soft)]">
                <summary className="cursor-pointer font-medium underline-offset-2 hover:text-[var(--hostly-navy-deep)] hover:underline">
                  Ver texto original
                </summary>
                <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--hostly-line)] bg-[var(--hostly-surface-ice)]/40 p-2 text-[10px] leading-relaxed text-[var(--hostly-ink-muted)]">
                  {item.rawText}
                </pre>
              </details>
            ) : null}
          </div>

          {editingDetails ? (
            <div className="grid gap-2 pt-1 sm:grid-cols-2">
              <div>
                <label className="mb-0.5 block text-[10px] text-[var(--hostly-ink-soft)]">Categoría</label>
                <input
                  type="text"
                  value={item.suggestedCategory}
                  onChange={(e) => onChange({ suggestedCategory: e.target.value })}
                  className="hostly-input h-8 w-full py-1 text-xs"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] text-[var(--hostly-ink-soft)]">Estación</label>
                <select
                  value={item.suggestedStation}
                  onChange={(e) =>
                    onChange({ suggestedStation: e.target.value as ImportedMenuSuggestedStation })
                  }
                  className="hostly-select h-8 w-full py-1 text-xs"
                >
                  {IMPORTED_MENU_STATION_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {IMPORTED_MENU_STATION_LABELS[st]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {publishState.detailMessage ? (
            <p className="text-[10px] font-medium text-amber-900">{publishState.detailMessage}</p>
          ) : null}

          {item.needsReview && item.aiWarnings && item.aiWarnings.length > 0 ? (
            <ul className="space-y-0.5 text-[10px] text-[var(--hostly-ink-soft)]">
              {item.aiWarnings.slice(0, 2).map((w) => (
                <li key={w}>· {w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </HostlySurface>
  );
}
