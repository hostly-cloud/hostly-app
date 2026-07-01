"use client";

import type { ReactNode } from "react";
import type { SalaEditorNavigation } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import { SalaEditorPhaseNav } from "@/components/sala-editor/sala-editor-phase-nav";

export type SalaEditorShellProps = {
  navigation: SalaEditorNavigation;
  disabledPhases?: SalaEditorPhase[];
  espaciosCount: number;
  onPhaseChange: (phase: SalaEditorPhase) => void;
  leftPanel: ReactNode;
  workspace: ReactNode;
  inspector: ReactNode;
};

/**
 * Shell del editor de sala V2: navegación + tres columnas.
 */
export function SalaEditorShell({
  navigation,
  disabledPhases = [],
  espaciosCount,
  onPhaseChange,
  leftPanel,
  workspace,
  inspector,
}: SalaEditorShellProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
      <header className="flex shrink-0 flex-col gap-2 border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
              Preview · Configuración
            </p>
            <h2 className="text-base font-extrabold text-slate-900">
              Editor Sala V2
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

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
        {leftPanel}
        <div className="flex min-h-0 min-w-0 flex-col">{workspace}</div>
        <aside className="flex min-h-0 w-full flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3">
          {inspector}
        </aside>
      </div>
    </section>
  );
}
