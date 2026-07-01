"use client";

import type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";

export type SalaOperationalElementCardProps = {
  item: OperationalElementCatalogItem;
  selected: boolean;
  onSelect: () => void;
};

export function SalaOperationalElementCard({
  item,
  selected,
  onSelect,
}: SalaOperationalElementCardProps) {
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

      <span className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base transition"
          style={{
            backgroundColor: selected
              ? "var(--hostly-accent-soft)"
              : `${item.color}18`,
            boxShadow: selected
              ? "inset 0 0 0 1px color-mix(in srgb, var(--hostly-accent) 22%, transparent)"
              : `inset 0 0 0 1px ${item.color}33`,
          }}
          aria-hidden
        >
          {item.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold text-slate-900">
            {item.label}
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">
            {item.description}
          </span>
        </span>
      </span>
    </button>
  );
}
