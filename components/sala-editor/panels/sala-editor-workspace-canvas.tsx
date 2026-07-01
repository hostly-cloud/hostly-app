"use client";

import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import { SALA_EDITOR_PHASE_LABELS } from "@/lib/sala-editor/types/editor-navigation";

export type SalaEditorWorkspaceCanvasProps = {
  phase: SalaEditorPhase;
  espacioName: string | null;
};

export function SalaEditorWorkspaceCanvas({
  phase,
  espacioName,
}: SalaEditorWorkspaceCanvasProps) {
  if (!espacioName) {
    return (
      <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-10 text-center">
        <p className="text-sm font-extrabold text-slate-700">
          Selecciona un espacio
        </p>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          Elige un espacio en el panel izquierdo para previsualizar el lienzo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f1f5f9_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      <div className="flex items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 py-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
            {SALA_EDITOR_PHASE_LABELS[phase]}
          </p>
          <h3 className="text-lg font-extrabold text-slate-900">{espacioName}</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
          Preview
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="text-sm font-bold text-slate-600">
            Lienzo limpio — sin geometría todavía
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {phase === "espacios"
              ? "Validación de navegación y selección de espacio."
              : phase === "estructura"
                ? "Aquí colocarás paredes, barras y elementos fijos."
                : "Aquí colocarás mesas, hamacas y asientos de servicio."}
          </p>
        </div>
      </div>
    </div>
  );
}
