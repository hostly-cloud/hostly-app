"use client";

import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";

export type SalaOperationalElementInstanceCardProps = {
  instance: OperationalElementInstance;
  catalogIcon?: string;
  selected: boolean;
  onSelect: () => void;
};

export function SalaOperationalElementInstanceCard({
  instance,
  catalogIcon,
  selected,
  onSelect,
}: SalaOperationalElementInstanceCardProps) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      aria-pressed={selected}
      className={[
        "whitespace-nowrap rounded-xl border bg-white px-3 py-2 text-left shadow-sm transition duration-150",
        selected
          ? "border-[color-mix(in_srgb,var(--hostly-accent)_48%,#93c5fd)] shadow-[0_6px_18px_rgba(49,95,125,0.12)]"
          : "border-slate-200/90 hover:border-slate-300 hover:shadow-[0_4px_14px_rgba(15,23,42,0.06)]",
      ].join(" ")}
      style={{
        transform: "translate(-50%, -50%)",
      }}
    >
      <span className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
        <span className="text-[var(--hostly-accent)]" aria-hidden>
          ○
        </span>
        {catalogIcon ? (
          <span className="text-base" aria-hidden>
            {catalogIcon}
          </span>
        ) : null}
        {instance.name}
      </span>
    </button>
  );
}
