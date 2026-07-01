"use client";

import type { PointerEvent } from "react";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";

export type SalaOperationalElementInstanceCardProps = {
  instance: OperationalElementInstance;
  catalogIcon?: string;
  catalogColor?: string;
  selected: boolean;
  isDragging?: boolean;
  isDropAnimating?: boolean;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
};

export function SalaOperationalElementInstanceCard({
  instance,
  catalogIcon,
  catalogColor = "#315f7d",
  selected,
  isDragging = false,
  isDropAnimating = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: SalaOperationalElementInstanceCardProps) {
  const isActive = selected || isDragging;

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      aria-pressed={selected}
      aria-label={instance.name}
      className={[
        "group relative flex min-h-[56px] min-w-[96px] items-stretch overflow-hidden rounded-xl border bg-white text-left",
        isDragging
          ? "border-[var(--hostly-accent)] shadow-[0_18px_40px_rgba(49,95,125,0.28)] ring-4 ring-[var(--hostly-accent-soft)]"
          : isActive
            ? "border-[var(--hostly-accent)] shadow-[0_10px_28px_rgba(49,95,125,0.18)] ring-2 ring-[var(--hostly-accent-soft)]"
            : "border-slate-200/90 shadow-[0_4px_16px_rgba(15,23,42,0.08)] hover:border-slate-300 hover:shadow-[0_8px_22px_rgba(15,23,42,0.1)]",
        isDragging ? "" : isDropAnimating ? "transition duration-[130ms] ease-out" : "transition duration-150",
      ].join(" ")}
      style={{
        transform: isDragging
          ? "translate(-50%, -50%) scale(1.06)"
          : "translate(-50%, -50%)",
        cursor: isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.95 : 1,
        zIndex: isDragging ? 30 : selected ? 10 : 1,
      }}
    >
      <span
        className={[
          "w-1 shrink-0 transition-colors",
          isActive ? "bg-[var(--hostly-accent)]" : "bg-transparent group-hover:bg-slate-200",
        ].join(" ")}
        aria-hidden
      />

      <span className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
          style={{ backgroundColor: `${catalogColor}22` }}
          aria-hidden
        >
          {catalogIcon ?? "⬤"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-extrabold leading-tight text-slate-900">
            {instance.name}
          </span>
          <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {isDragging ? "Moviendo…" : "Operativo"}
          </span>
        </span>
      </span>
    </button>
  );
}
