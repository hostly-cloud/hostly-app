"use client";

import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { SalaEspacioWorkspaceHero } from "@/components/sala-editor/panels/sala-espacio-workspace-hero";
import { SalaEspaciosEmptyState } from "@/components/sala-editor/panels/sala-espacios-empty-state";

export type SalaEditorWorkspaceCanvasProps = {
  phase: SalaEditorPhase;
  espacio: SalaEspacio | null;
  hasEspacios: boolean;
  onRequestCreateEspacio: () => void;
};

export function SalaEditorWorkspaceCanvas({
  phase,
  espacio,
  hasEspacios,
  onRequestCreateEspacio,
}: SalaEditorWorkspaceCanvasProps) {
  if (!hasEspacios) {
    return <SalaEspaciosEmptyState onCreateEspacio={onRequestCreateEspacio} />;
  }

  if (phase === "espacios" && espacio) {
    return <SalaEspacioWorkspaceHero espacio={espacio} />;
  }

  if (!espacio) {
    return (
      <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-10 text-center">
        <p className="text-sm font-extrabold text-slate-700">
          Selecciona un espacio
        </p>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          Elige una tarjeta en el panel izquierdo para ver su lienzo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f1f5f9_100%)]">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <h3 className="text-2xl font-extrabold text-slate-900">{espacio.name}</h3>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          {phase === "estructura"
            ? "Próximamente colocarás paredes, cristales y barras en este espacio."
            : "Próximamente colocarás mesas, hamacas y asientos en este espacio."}
        </p>
      </div>
    </div>
  );
}
