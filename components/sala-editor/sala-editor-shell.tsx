"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { SalaEditorNavigation } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import { SalaEditorPhaseNav } from "@/components/sala-editor/sala-editor-phase-nav";
import { SalaEditorHistoryControls } from "@/components/sala-editor/sala-editor-history-controls";
import type { SalaEditorContextActionTarget } from "@/components/sala-editor/sala-editor-context-action-bar";
import { SalaEditorContextActionBar } from "@/components/sala-editor/sala-editor-context-action-bar";
import "@/components/sala-editor/sala-editor-workbench.css";

export type SalaEditorShellProps = {
  navigation: SalaEditorNavigation;
  disabledPhases?: SalaEditorPhase[];
  espaciosCount: number;
  inspectorOpen: boolean;
  onPhaseChange: (phase: SalaEditorPhase) => void;
  leftPanel: ReactNode;
  workspace: ReactNode;
  inspector: ReactNode;
  legacyEditorHref?: string;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  contextActionTarget?: SalaEditorContextActionTarget | null;
};

/**
 * Shell del editor de sala V2 — workbench compacto, lienzo protagonista.
 */
export function SalaEditorShell({
  navigation,
  disabledPhases = [],
  espaciosCount,
  inspectorOpen,
  onPhaseChange,
  leftPanel,
  workspace,
  inspector,
  legacyEditorHref,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  contextActionTarget = null,
}: SalaEditorShellProps) {
  return (
    <section
      className={[
        "hostly-sala-editor-workbench",
        inspectorOpen ? "hostly-sala-editor-workbench--inspector-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="hostly-sala-editor-workbench__toolbar">
        <div className="hostly-sala-editor-workbench__toolbar-start">
          <SalaEditorPhaseNav
            phase={navigation.phase}
            disabledPhases={disabledPhases}
            onPhaseChange={onPhaseChange}
          />
          {onUndo && onRedo ? (
            <SalaEditorHistoryControls
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={onUndo}
              onRedo={onRedo}
            />
          ) : null}
        </div>
        <div className="hostly-sala-editor-workbench__toolbar-meta">
          <span className="hostly-sala-editor-workbench__count">
            {espaciosCount} mapa{espaciosCount === 1 ? "" : "s"}
          </span>
          {legacyEditorHref ? (
            <Link href={legacyEditorHref} className="hostly-sala-editor-workbench__legacy-link">
              Editor actual
            </Link>
          ) : null}
        </div>
      </header>

      <SalaEditorContextActionBar target={contextActionTarget} />

      <div className="hostly-sala-editor-workbench__body">
        <aside className="hostly-sala-editor-workbench__panel hostly-sala-editor-workbench__panel--toolbox">
          <div className="hostly-sala-editor-workbench__panel-inner">{leftPanel}</div>
        </aside>
        <main className="hostly-sala-editor-workbench__canvas">{workspace}</main>
        {inspectorOpen ? (
          <aside className="hostly-sala-editor-workbench__panel hostly-sala-editor-workbench__panel--inspector hostly-sala-editor-workbench__panel--inspector-subtle">
            <div className="hostly-sala-editor-workbench__inspector-scroll">{inspector}</div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
