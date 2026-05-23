"use client";

import { HostlySurface, hostlyCx } from "@/components/ui/hostly";
import {
  MENU_IMPORT_STATUS_LABELS,
  menuImportSummaryLabel,
} from "@/lib/carta/menu-import-draft-mapper";
import { menuTypeToCartaType } from "@/lib/carta/menu-import-type-map";
import { IMPORTED_MENU_CARTA_TYPE_LABELS } from "@/lib/carta/imported-menu-types";
import type { MenuImportDraftStatus, MenuImportDraftSummary } from "@/lib/firestore/menu-import-drafts";

function statusTone(status: MenuImportDraftStatus): string {
  switch (status) {
    case "analyzing":
      return "bg-sky-50 text-sky-900 border-sky-200/80";
    case "ready":
      return "bg-emerald-50 text-emerald-900 border-emerald-200/80";
    case "failed":
      return "bg-rose-50 text-rose-900 border-rose-200/80";
    case "published":
      return "bg-violet-50 text-violet-900 border-violet-200/80";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200/80";
  }
}

function formatDraftDate(ms: number): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

type ImportMenuRecentListProps = {
  drafts: MenuImportDraftSummary[];
  activeDraftId?: string | null;
  loading?: boolean;
  onOpenDraft: (draftId: string) => void;
  onNewImport?: () => void;
};

export function ImportMenuRecentList({
  drafts,
  activeDraftId,
  loading,
  onOpenDraft,
  onNewImport,
}: ImportMenuRecentListProps) {
  return (
    <HostlySurface variant="ice" className="flex min-h-0 flex-col p-3 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="hostly-section-label">Importaciones recientes</p>
          <p className="mt-0.5 text-[11px] text-[var(--hostly-ink-muted)]">
            Borradores guardados en tu restaurante
          </p>
        </div>
        {onNewImport ? (
          <button type="button" className="hostly-button-secondary shrink-0 px-3 py-1.5 text-xs" onClick={onNewImport}>
            Nueva
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="py-6 text-center text-xs text-[var(--hostly-ink-muted)]">Cargando borradores…</p>
      ) : drafts.length === 0 ? (
        <div className="rounded-[var(--hostly-radius-md)] border border-dashed border-[var(--hostly-line)] bg-white/60 px-3 py-6 text-center">
          <p className="text-xs font-medium text-[var(--hostly-navy-deep)]">Sin importaciones aún</p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--hostly-ink-muted)]">
            Al analizar una carta, el borrador quedará aquí para retomarlo más tarde.
          </p>
        </div>
      ) : (
        <ul className="hostly-stack-sm max-h-[min(52vh,520px)] overflow-y-auto overscroll-contain pr-0.5">
          {drafts.map((draft) => {
            const active = activeDraftId === draft.id;
            const cartaLabel =
              IMPORTED_MENU_CARTA_TYPE_LABELS[menuTypeToCartaType(draft.menuType)] ?? "Mixta";
            return (
              <li key={draft.id}>
                <button
                  type="button"
                  onClick={() => onOpenDraft(draft.id)}
                  className={hostlyCx(
                    "w-full rounded-[var(--hostly-radius-md)] border px-3 py-2.5 text-left transition",
                    active
                      ? "border-[var(--hostly-ice-400)] bg-white shadow-[var(--hostly-shadow-hairline)]"
                      : "border-[var(--hostly-line)] bg-white/75 hover:border-[var(--hostly-line-strong)] hover:bg-white",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[var(--hostly-navy-deep)]">
                        {menuImportSummaryLabel(draft)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--hostly-ink-muted)]">
                        {cartaLabel} · {formatDraftDate(draft.updatedAt)}
                      </p>
                    </div>
                    <span
                      className={hostlyCx(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                        statusTone(draft.status),
                      )}
                    >
                      {MENU_IMPORT_STATUS_LABELS[draft.status] ?? draft.status}
                    </span>
                  </div>
                  {draft.status === "failed" && draft.errorMessage ? (
                    <p className="mt-1.5 line-clamp-2 text-[10px] text-rose-700">{draft.errorMessage}</p>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </HostlySurface>
  );
}
