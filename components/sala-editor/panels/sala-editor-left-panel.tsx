"use client";

import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { SalaEspaciosSidebar } from "@/components/sala-editor/panels/sala-espacios-sidebar";
import { SalaEstructuraSidebar } from "@/components/sala-editor/panels/sala-estructura-sidebar";
import { SalaOperacionSidebar } from "@/components/sala-editor/panels/sala-operacion-sidebar";

export type SalaEditorLeftPanelProps = {
  phase: SalaEditorPhase;
  espacios: SalaEspacio[];
  selectedEspacioId: string | null;
  elementCountByEspacioId: Record<string, number>;
  onSelectEspacio: (espacioId: string) => void;
  onRequestAddEspacio: () => void;
};

export function SalaEditorLeftPanel({
  phase,
  espacios,
  selectedEspacioId,
  elementCountByEspacioId,
  onSelectEspacio,
  onRequestAddEspacio,
}: SalaEditorLeftPanelProps) {
  return (
    <aside className="flex min-h-0 w-full flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3">
      {phase === "espacios" ? (
        <SalaEspaciosSidebar
          espacios={espacios}
          selectedEspacioId={selectedEspacioId}
          elementCountByEspacioId={elementCountByEspacioId}
          onSelectEspacio={onSelectEspacio}
          onRequestAddEspacio={onRequestAddEspacio}
        />
      ) : null}
      {phase === "estructura" ? <SalaEstructuraSidebar /> : null}
      {phase === "operacion" ? <SalaOperacionSidebar /> : null}
    </aside>
  );
}
