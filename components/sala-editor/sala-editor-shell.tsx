"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { SalaEditorNavigation } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import { SalaEditorPhaseNav } from "@/components/sala-editor/sala-editor-phase-nav";
import "@/components/sala-editor/sala-editor-workbench.css";

export type SalaEditorShellProps = {
  navigation: SalaEditorNavigation;
  disabledPhases?: SalaEditorPhase[];
  espaciosCount: number;
  onPhaseChange: (phase: SalaEditorPhase) => void;
  leftPanel: ReactNode;
  workspace: ReactNode;
  inspector: ReactNode;
  legacyEditorHref?: string;
};

/**
 * Shell del editor de sala V2 — workbench compacto, lienzo protagonista.
 */
export function SalaEditorShell({
  navigation,
  disabledPhases = [],
  espaciosCount,
  onPhaseChange,
  leftPanel,
  workspace,
  inspector,
  legacyEditorHref,
}: SalaEditorShellProps) {
  return (
    <section className="hostly-sala-editor-workbench">
      <header className="hostly-sala-editor-workbench__toolbar">
        <SalaEditorPhaseNav
          phase={navigation.phase}
          disabledPhases={disabledPhases}
          onPhaseChange={onPhaseChange}
        />
        <div className="hostly-sala-editor-workbench__toolbar-meta">
          <span className="hostly-sala-editor-workbench__count">
            {espaciosCount} espacio{espaciosCount === 1 ? "" : "s"}
          </span>
          {legacyEditorHref ? (
            <Link href={legacyEditorHref} className="hostly-sala-editor-workbench__legacy-link">
              Editor actual
            </Link>
          ) : null}
        </div>
      </header>

      <div className="hostly-sala-editor-workbench__body">
        <aside className="hostly-sala-editor-workbench__panel">
          <div className="hostly-sala-editor-workbench__panel-inner">{leftPanel}</div>
        </aside>
        <main className="hostly-sala-editor-workbench__canvas">{workspace}</main>
        <aside className="hostly-sala-editor-workbench__panel">
          <div className="hostly-sala-editor-workbench__inspector-scroll">{inspector}</div>
        </aside>
      </div>
    </section>
  );
}
