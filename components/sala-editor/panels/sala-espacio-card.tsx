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

      <span className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-2">
        <span className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
            style={{ backgroundColor: `${espacio.color}22`, color: espacio.color }}
            aria-hidden
          >
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: espacio.color }}
                aria-hidden
              />
              <span className="truncate text-xs font-extrabold text-slate-900">
                {espacio.name}
              </span>
            </span>
            <span className="mt-0.5 block text-[10px] font-bold text-slate-500">
              {elementCount} elem.
            </span>
          </span>
        </span>

        <span className="flex items-center gap-1.5 border-t border-slate-100 pt-1">
          <span
            className={[
              "rounded-full px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide",
              espacio.visible
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500",
            ].join(" ")}
          >
            {espacio.visible ? "Visible" : "Oculto"}
          </span>
          {!espacio.active ? (
            <span className="rounded-full bg-amber-50 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide text-amber-700">
              Inactivo
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
