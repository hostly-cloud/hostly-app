"use client";

import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEspacio, SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import { SalaEspaciosSidebar } from "@/components/sala-editor/panels/sala-espacios-sidebar";
import { SalaEstructuraSidebar } from "@/components/sala-editor/panels/sala-estructura-sidebar";
import { SalaOperacionSidebar } from "@/components/sala-editor/panels/sala-operacion-sidebar";

export type SalaEditorLeftPanelProps = {
  phase: SalaEditorPhase;
  espacios: SalaEspacio[];
  selectedEspacioId: string | null;
  elementCountByEspacioId: Record<string, number>;
  activeStructuralToolKind: SalaStructuralElementKind | null;
  activeOperationalElementType: OperationalElementType | null;
  onSelectEspacio: (espacioId: string) => void;
  onRequestAddEspacio: () => void;
  onSelectStructuralTool: (kind: SalaStructuralElementKind) => void;
  onSelectOperationalElement: (type: OperationalElementType) => void;
  onUpdateEspacio?: (espacioId: string, patch: Partial<SalaEspacioDraft>) => void;
};

export function SalaEditorLeftPanel({
  phase,
  espacios,
  selectedEspacioId,
  elementCountByEspacioId,
  activeStructuralToolKind,
  activeOperationalElementType,
  onSelectEspacio,
  onRequestAddEspacio,
  onSelectStructuralTool,
  onSelectOperationalElement,
  onUpdateEspacio,
}: SalaEditorLeftPanelProps) {
  return (
    <>
      {phase === "espacios" ? (
        <SalaEspaciosSidebar
          espacios={espacios}
          selectedEspacioId={selectedEspacioId}
          elementCountByEspacioId={elementCountByEspacioId}
          onSelectEspacio={onSelectEspacio}
          onRequestAddEspacio={onRequestAddEspacio}
          onUpdateEspacio={onUpdateEspacio}
        />
      ) : null}
      {phase === "estructura" ? (
        <SalaEstructuraSidebar
          activeToolKind={activeStructuralToolKind}
          onSelectTool={onSelectStructuralTool}
        />
      ) : null}
      {phase === "operacion" ? (
        <SalaOperacionSidebar
          activeElementType={activeOperationalElementType}
          onSelectElementType={onSelectOperationalElement}
        />
      ) : null}
    </>
  );
}
