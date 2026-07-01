"use client";

import type { ReactNode } from "react";
import type { SalaEditorNavigation } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import { SalaEditorPhaseNav } from "@/components/sala-editor/sala-editor-phase-nav";

export type SalaEditorShellProps = {
  children: ReactNode;
  navigation: SalaEditorNavigation;
  disabledPhases?: SalaEditorPhase[];
  espaciosCount: number;
  onPhaseChange: (phase: SalaEditorPhase) => void;
};

/**
 * Shell de navegación del editor de sala (arquitectura futura).
 * No conectado al editor legacy; prepara chrome y fases 1–3.
 */
export function SalaEditorShell({
  children,
  navigation,
  disabledPhases = [],
  espaciosCount,
  onPhaseChange,
}: SalaEditorShellProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
      <header className="flex flex-col gap-2 border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
              Editor de sala
            </p>
            <h2 className="text-base font-extrabold text-slate-900">
              Diseña por espacios
            </h2>
          </div>
          <p className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {espaciosCount} espacio{espaciosCount === 1 ? "" : "s"}
          </p>
        </div>
        <SalaEditorPhaseNav
          phase={navigation.phase}
          disabledPhases={disabledPhases}
          onPhaseChange={onPhaseChange}
        />
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
