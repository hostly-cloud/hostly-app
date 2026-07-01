"use client";

import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";

export type SalaStructuralToolCardProps = {
  item: StructuralToolboxItem;
  selected: boolean;
  onSelect: () => void;
};

export function SalaStructuralToolCard({
  item,
  selected,
  onSelect,
}: SalaStructuralToolCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
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

      <span className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2">
        <span
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm",
            selected ? "bg-[var(--hostly-accent-soft)]" : "bg-slate-50",
          ].join(" ")}
          aria-hidden
        >
          {item.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-extrabold text-slate-900">
            {item.label}
          </span>
          <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">
            {item.description}
          </span>
        </span>
      </span>
    </button>
  );
}
