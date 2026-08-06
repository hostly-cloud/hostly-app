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

type PhaseGroup = {
  id: "space" | "environment" | "operation";
  label: string;
  description: string;
  guidance: string;
  phases: SalaEditorPhase[];
};

const PHASE_GROUPS: PhaseGroup[] = [
  {
    id: "space",
    label: "Espacio",
    description: "Prepara la base y organiza el plano",
    guidance: "Define la base y la distribución del local.",
    phases: ["base", "terreno", "zonas"],
  },
  {
    id: "environment",
    label: "Ambiente",
    description: "Define límites y completa el entorno",
    guidance: "Da forma a la estructura y al entorno.",
    phases: ["estructura", "paisajismo"],
  },
  {
    id: "operation",
    label: "Operación",
    description: "Coloca mesas y puntos de servicio",
    guidance: "Coloca mesas, barras y puntos de servicio.",
    phases: ["operacion"],
  },
];

export function SalaEditorPhaseNav({
  phase,
  disabledPhases = [],
  onPhaseChange,
}: SalaEditorPhaseNavProps) {
  const disabled = new Set(disabledPhases);
  const visiblePhase = phase === "espacios" ? "base" : phase;
  const activeIndex = SALA_EDITOR_VISIBLE_PHASE_ORDER.indexOf(visiblePhase);

  return (
    <nav
      className="hostly-sala-editor-phase-groups"
      aria-label="Preparación del restaurante"
    >
      {PHASE_GROUPS.map((group) => {
        const activeInGroup = group.phases.includes(visiblePhase);

        return (
          <section
            key={group.id}
            className={[
              "hostly-sala-editor-phase-group",
              activeInGroup ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={group.label}
          >
            <div className="hostly-sala-editor-phase-group__heading">
              <span className="hostly-sala-editor-phase-group__label">
                {group.label}
              </span>
              <span className="hostly-sala-editor-phase-group__description">
                {group.description}
              </span>
            </div>

            {activeInGroup ? (
              <p className="hostly-sala-editor-phase-group__guidance">
                {group.guidance}
              </p>
            ) : null}

            <ol className="hostly-sala-editor-phase-group__steps">
              {group.phases.map((item) => {
                const itemIndex = SALA_EDITOR_VISIBLE_PHASE_ORDER.indexOf(item);
                const isActive = item === visiblePhase;
                const isDisabled = disabled.has(item);
                const isComplete = activeIndex > itemIndex;

                return (
                  <li key={item} className="hostly-sala-editor-phase-group__step">
                    <button
                      type="button"
                      disabled={isDisabled}
                      aria-current={isActive ? "step" : undefined}
                      title={SALA_EDITOR_PHASE_DESCRIPTIONS[item]}
                      onClick={() => onPhaseChange(item)}
                      className={[
                        "hostly-sala-editor-phase-group__button",
                        isActive ? "is-active" : "",
                        isComplete ? "is-complete" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span
                        className="hostly-sala-editor-phase-group__marker"
                        aria-hidden
                      >
                        {isComplete ? "✓" : ""}
                      </span>
                      <span className="hostly-sala-editor-phase-group__button-label">
                        {SALA_EDITOR_PHASE_LABELS[item]}
                      </span>
                      {item === "zonas" ? (
                        <span className="hostly-sala-editor-phase-group__optional">
                          Opcional
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </nav>
  );
}
