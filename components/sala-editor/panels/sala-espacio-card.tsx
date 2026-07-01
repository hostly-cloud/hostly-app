"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { salaEspacioTypeIcon } from "@/lib/sala-editor/catalog/espacio-types";

export type SalaEspacioCardProps = {
  espacio: SalaEspacio;
  selected: boolean;
  elementCount: number;
  onSelect: () => void;
};

export function SalaEspacioCard({
  espacio,
  selected,
  elementCount,
  onSelect,
}: SalaEspacioCardProps) {
  const icon = salaEspacioTypeIcon(espacio.tipo);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "group relative flex w-full items-stretch overflow-hidden rounded-xl border bg-white text-left transition duration-150",
        selected
          ? "border-[color-mix(in_srgb,var(--hostly-accent)_48%,#93c5fd)] shadow-[0_8px_24px_rgba(49,95,125,0.14),0_0_0_1px_color-mix(in_srgb,var(--hostly-accent)_18%,transparent)]"
          : "border-slate-200/90 hover:border-slate-300 hover:shadow-[0_4px_14px_rgba(15,23,42,0.06)]",
      ].join(" ")}
    >
      <span
        className={[
          "w-1 shrink-0 transition-colors",
          selected ? "bg-[var(--hostly-accent)]" : "bg-transparent group-hover:bg-slate-200",
        ].join(" ")}
        aria-hidden
      />

      <span className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-3">
        <span className="flex items-start gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
            style={{ backgroundColor: `${espacio.color}22`, color: espacio.color }}
            aria-hidden
          >
            {icon}
          </span>
          <span className="min-w-0 flex-1 pt-0.5">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                style={{ backgroundColor: espacio.color }}
                aria-hidden
              />
              <span className="truncate text-sm font-extrabold text-slate-900">
                {espacio.name}
              </span>
            </span>
            <span className="mt-1 block text-[11px] font-bold text-slate-500">
              {elementCount} elemento{elementCount === 1 ? "" : "s"}
            </span>
          </span>
        </span>

        <span className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.05em]",
              espacio.visible
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500",
            ].join(" ")}
          >
            {espacio.visible ? "Visible" : "Oculto"}
          </span>
          {!espacio.active ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.05em] text-amber-700">
              Inactivo
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
