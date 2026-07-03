"use client";

import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import {
  SALA_EDITOR_PHASE_DESCRIPTIONS,
  SALA_EDITOR_PHASE_LABELS,
  SALA_EDITOR_VISIBLE_PHASE_ORDER,
} from "@/lib/sala-editor/types/editor-navigation";

export type SalaEditorPhaseNavProps = {
  phase: SalaEditorPhase;
  disabledPhases?: SalaEditorPhase[];
  onPhaseChange: (phase: SalaEditorPhase) => void;
};

const PHASE_INDEX: Record<SalaEditorPhase, string> = {
  espacios: "•",
  base: "①",
  terreno: "②",
  estructura: "③",
  operacion: "④",
};

export function SalaEditorPhaseNav({
  phase,
  disabledPhases = [],
  onPhaseChange,
}: SalaEditorPhaseNavProps) {
  const disabled = new Set(disabledPhases);
  const visiblePhase = phase === "espacios" ? "base" : phase;
  const activeIndex = SALA_EDITOR_VISIBLE_PHASE_ORDER.indexOf(visiblePhase);

  return (
    <nav className="hostly-sala-editor-stepper" aria-label="Fases del editor de sala">
      <ol className="hostly-sala-editor-stepper__track">
        {SALA_EDITOR_VISIBLE_PHASE_ORDER.map((item, index) => {
          const isActive = item === visiblePhase;
          const isDisabled = disabled.has(item);
          const isComplete = activeIndex > index;
          const isPending = !isActive && !isComplete;

          return (
            <li
              key={item}
              className={[
                "hostly-sala-editor-stepper__segment",
                isActive ? "is-active" : "",
                isComplete ? "is-complete" : "",
                isPending ? "is-pending" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                disabled={isDisabled}
                aria-current={isActive ? "step" : undefined}
                title={SALA_EDITOR_PHASE_DESCRIPTIONS[item]}
                onClick={() => onPhaseChange(item)}
                className="hostly-sala-editor-stepper__node"
              >
                <span className="hostly-sala-editor-stepper__marker" aria-hidden>
                  {isComplete ? "✓" : PHASE_INDEX[item]}
                </span>
                <span className="hostly-sala-editor-stepper__label">
                  {SALA_EDITOR_PHASE_LABELS[item]}
                </span>
              </button>

              {index < SALA_EDITOR_VISIBLE_PHASE_ORDER.length - 1 ? (
                <span className="hostly-sala-editor-stepper__rail" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
