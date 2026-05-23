"use client";

import { useMemo } from "react";
import { HostlySurface, hostlyCx } from "@/components/ui/hostly";
import type { CategoryOutcomeMap } from "@/lib/carta/create-categories-types";
import type { CreateMenuImportCategoriesResult } from "@/lib/carta/create-categories-types";
import type { PublishPreviewMissingCategory } from "@/lib/carta/publish-preview-types";
import type { ImportedMenuSuggestedStation } from "@/lib/carta/imported-menu-types";
import {
  IMPORTED_MENU_STATION_LABELS,
  IMPORTED_MENU_STATION_OPTIONS,
} from "@/lib/carta/imported-menu-types";

export type MissingCategoryDraftRow = {
  key: string;
  name: string;
  suggestedStation: ImportedMenuSuggestedStation;
  itemCount: number;
  selected: boolean;
};

type MissingCategoriesWizardProps = {
  missingCategories: PublishPreviewMissingCategory[];
  rows: MissingCategoryDraftRow[];
  onRowChange: (key: string, patch: Partial<MissingCategoryDraftRow>) => void;
  onCreate: () => void;
  onDismiss: () => void;
  loading?: boolean;
  error?: string | null;
  lastResult?: CreateMenuImportCategoriesResult | null;
  categoryOutcomes?: CategoryOutcomeMap;
};

function outcomeBadge(key: string, outcomes?: CategoryOutcomeMap): { label: string; tone: string } | null {
  const outcome = outcomes?.[key];
  if (outcome === "created") {
    return { label: "Categoría creada", tone: "border-emerald-200/80 bg-emerald-50 text-emerald-900" };
  }
  if (outcome === "reused") {
    return { label: "Reutilizada", tone: "border-slate-200/80 bg-slate-50 text-slate-800" };
  }
  return { label: "Nueva categoría", tone: "border-violet-200/80 bg-violet-50 text-violet-900" };
}

export function buildMissingCategoryRows(
  missing: PublishPreviewMissingCategory[],
  inferStation: (categoryName: string) => ImportedMenuSuggestedStation,
): MissingCategoryDraftRow[] {
  return missing.map((mc) => ({
    key: mc.categoryName,
    name: mc.categoryName,
    suggestedStation: inferStation(mc.categoryName),
    itemCount: mc.itemIds.length,
    selected: true,
  }));
}

export function MissingCategoriesWizard({
  missingCategories,
  rows,
  onRowChange,
  onCreate,
  onDismiss,
  loading,
  error,
  lastResult,
  categoryOutcomes,
}: MissingCategoriesWizardProps) {
  const selectedCount = useMemo(() => rows.filter((r) => r.selected).length, [rows]);

  if (missingCategories.length === 0 && !lastResult) return null;

  return (
    <HostlySurface variant="flat" className="border-amber-200/80 bg-amber-50/50 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-950">Categorías faltantes detectadas</p>
          <p className="mt-0.5 text-xs text-amber-900/80">
            Crea las categorías en Hostly para desbloquear productos antes de publicar.
          </p>
        </div>
        <button
          type="button"
          className="hostly-button-secondary shrink-0 px-3 py-1.5 text-xs"
          onClick={onDismiss}
        >
          Omitir por ahora
        </button>
      </div>

      {lastResult ? (
        <p className="mt-2 text-xs font-medium text-emerald-900">
          {lastResult.totals.createdCount} categoría{lastResult.totals.createdCount === 1 ? "" : "s"} creada
          {lastResult.totals.createdCount === 1 ? "" : "s"}
          {lastResult.totals.reusedCount > 0
            ? ` · ${lastResult.totals.reusedCount} reutilizada${lastResult.totals.reusedCount === 1 ? "" : "s"}`
            : ""}
          {lastResult.totals.skippedCount > 0 ? ` · ${lastResult.totals.skippedCount} omitida(s)` : ""}
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-rose-800">{error}</p> : null}

      {missingCategories.length > 0 ? (
        <div className="mt-3 space-y-2">
          {rows.map((row) => {
            const badge = outcomeBadge(row.key, categoryOutcomes);
            return (
              <div
                key={row.key}
                className="grid gap-2 rounded-lg border border-amber-200/60 bg-white/80 p-2.5 sm:grid-cols-[auto_1fr_140px_auto]"
              >
                <label className="flex items-center gap-2 pt-1 sm:pt-2">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) => onRowChange(row.key, { selected: e.target.checked })}
                    className="h-4 w-4 rounded border-[var(--hostly-line-strong)]"
                  />
                </label>
                <div>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => onRowChange(row.key, { name: e.target.value })}
                    className="hostly-input w-full py-1.5 text-sm"
                    placeholder="Nombre categoría"
                  />
                  <p className="mt-0.5 text-[10px] text-[var(--hostly-ink-soft)]">
                    {row.itemCount} producto{row.itemCount === 1 ? "" : "s"} afectado{row.itemCount === 1 ? "" : "s"}
                  </p>
                </div>
                <select
                  value={row.suggestedStation}
                  onChange={(e) =>
                    onRowChange(row.key, { suggestedStation: e.target.value as ImportedMenuSuggestedStation })
                  }
                  className="hostly-select w-full py-1.5 text-sm"
                >
                  {IMPORTED_MENU_STATION_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {IMPORTED_MENU_STATION_LABELS[st]}
                    </option>
                  ))}
                </select>
                {badge ? (
                  <span className={hostlyCx("hostly-chip self-start px-2 py-0.5 text-[10px] sm:mt-2", badge.tone)}>
                    {badge.label}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {missingCategories.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="hostly-button-primary w-full px-4 py-2 text-sm sm:w-auto"
            disabled={loading || selectedCount === 0}
            onClick={onCreate}
          >
            {loading ? "Creando categorías…" : `Crear categorías (${selectedCount})`}
          </button>
        </div>
      ) : null}
    </HostlySurface>
  );
}
