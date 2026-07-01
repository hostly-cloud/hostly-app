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

const PHASE_INDEX: Record<SalaEditorPhase, string> = {
  espacios: "①",
  estructura: "②",
  operacion: "③",
};

export function SalaEditorPhaseNav({
  phase,
  disabledPhases = [],
  onPhaseChange,
}: SalaEditorPhaseNavProps) {
  const disabled = new Set(disabledPhases);

  return (
    <nav className="hostly-sala-editor-phase-nav" aria-label="Fases del editor de sala">
      {SALA_EDITOR_PHASE_ORDER.map((item) => {
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
              "hostly-sala-editor-phase-nav__btn",
              isActive ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="hostly-sala-editor-phase-nav__index">{PHASE_INDEX[item]}</span>
            <span className="hostly-sala-editor-phase-nav__label">
              {SALA_EDITOR_PHASE_LABELS[item]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
