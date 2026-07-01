"use client";

import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import {
  SALA_EDITOR_PHASE_DESCRIPTIONS,
  SALA_EDITOR_PHASE_LABELS,
  SALA_EDITOR_PHASE_ORDER,
} from "@/lib/sala-editor/types/editor-navigation";

export type SalaEditorPhaseNavProps = {
  phase: SalaEditorPhase;
  disabledPhases?: SalaEditorPhase[];
  onPhaseChange: (phase: SalaEditorPhase) => void;
};

export function SalaEditorPhaseNav({
  phase,
  disabledPhases = [],
  onPhaseChange,
}: SalaEditorPhaseNavProps) {
  const disabled = new Set(disabledPhases);

  return (
    <nav
      className="flex flex-wrap gap-2"
      aria-label="Fases del editor de sala"
    >
      {SALA_EDITOR_PHASE_ORDER.map((item, index) => {
        const isActive = item === phase;
        const isDisabled = disabled.has(item);
        return (
          <button
            key={item}
            type="button"
            disabled={isDisabled}
            aria-current={isActive ? "step" : undefined}
            title={SALA_EDITOR_PHASE_DESCRIPTIONS[item]}
            onClick={() => onPhaseChange(item)}
            className={[
              "inline-flex min-h-[40px] flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition",
              "disabled:cursor-not-allowed disabled:opacity-45",
              isActive
                ? "border-[color-mix(in_srgb,var(--hostly-accent)_42%,#e2e8f0)] bg-white text-[var(--hostly-accent)] shadow-[0_4px_14px_rgba(15,23,42,0.08)]"
                : "border-slate-200/80 bg-slate-50/80 text-slate-600 hover:border-[color-mix(in_srgb,var(--hostly-accent)_24%,#e2e8f0)] hover:bg-[var(--hostly-accent-soft)] hover:text-[var(--hostly-accent)]",
            ].join(" ")}
          >
            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
              {index + 1 === 1 ? "①" : index + 1 === 2 ? "②" : "③"}
            </span>
            <span className="text-sm font-extrabold leading-tight">
              {SALA_EDITOR_PHASE_LABELS[item]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
