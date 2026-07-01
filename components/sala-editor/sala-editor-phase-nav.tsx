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
  const activeIndex = SALA_EDITOR_PHASE_ORDER.indexOf(phase);

  return (
    <nav className="hostly-sala-editor-stepper" aria-label="Fases del editor de sala">
      <ol className="hostly-sala-editor-stepper__track">
        {SALA_EDITOR_PHASE_ORDER.map((item, index) => {
          const isActive = item === phase;
          const isDisabled = disabled.has(item);
          const isComplete = activeIndex > index;

          return (
            <li
              key={item}
              className={[
                "hostly-sala-editor-stepper__step",
                isActive ? "is-active" : "",
                isComplete ? "is-complete" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {index > 0 ? (
                <span className="hostly-sala-editor-stepper__connector" aria-hidden />
              ) : null}
              <button
                type="button"
                disabled={isDisabled}
                aria-current={isActive ? "step" : undefined}
                title={SALA_EDITOR_PHASE_DESCRIPTIONS[item]}
                onClick={() => onPhaseChange(item)}
                className="hostly-sala-editor-stepper__btn"
              >
                <span className="hostly-sala-editor-stepper__badge">{PHASE_INDEX[item]}</span>
                <span className="hostly-sala-editor-stepper__label">
                  {SALA_EDITOR_PHASE_LABELS[item]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
