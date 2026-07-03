"use client";

import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEspacio, SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import type { OperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import type { SurfaceMaterialKind } from "@/lib/sala-editor/surface/surface-object";
import type { SalaEspacioBasePatch } from "@/lib/sala-editor/base/espacio-base-editor";
import { SalaEspaciosSidebar } from "@/components/sala-editor/panels/sala-espacios-sidebar";
import { SalaBaseSidebar } from "@/components/sala-editor/panels/sala-base-sidebar";
import { SalaTerrenoSidebar } from "@/components/sala-editor/panels/sala-terreno-sidebar";
import { SalaEstructuraSidebar } from "@/components/sala-editor/panels/sala-estructura-sidebar";
import { SalaOperacionSidebar } from "@/components/sala-editor/panels/sala-operacion-sidebar";

export type SalaEditorLeftPanelProps = {
  phase: SalaEditorPhase;
  espacios: SalaEspacio[];
  selectedEspacioId: string | null;
  elementCountByEspacioId: Record<string, number>;
  activeStructuralToolKind: SalaStructuralElementKind | null;
  activeOperationalElementType: OperationalElementType | null;
  activeOperationalVisualVariant?: OperationalVisualVariant | null;
  activeSurfaceMaterial?: SurfaceMaterialKind | null;
  onSelectEspacio: (espacioId: string) => void;
  onRequestAddEspacio: () => void;
  onSelectStructuralTool: (kind: SalaStructuralElementKind) => void;
  onSelectSurfaceMaterial: (material: SurfaceMaterialKind) => void;
  onSelectOperationalElement: (
    type: OperationalElementType,
    visualVariant?: OperationalVisualVariant,
  ) => void;
  onUpdateEspacio?: (espacioId: string, patch: Partial<SalaEspacioDraft>) => void;
  onUpdateEspacioBase?: (
    espacioId: string,
    patch: SalaEspacioBasePatch,
  ) => void;
};

export function SalaEditorLeftPanel({
  phase,
  espacios,
  selectedEspacioId,
  elementCountByEspacioId,
  activeStructuralToolKind,
  activeOperationalElementType,
  activeOperationalVisualVariant = null,
  activeSurfaceMaterial = null,
  onSelectEspacio,
  onRequestAddEspacio,
  onSelectStructuralTool,
  onSelectSurfaceMaterial,
  onSelectOperationalElement,
  onUpdateEspacio,
  onUpdateEspacioBase,
}: SalaEditorLeftPanelProps) {
  const selectedEspacio =
    selectedEspacioId != null
      ? espacios.find((espacio) => espacio.id === selectedEspacioId) ?? null
      : null;

  return (
    <div className="hostly-sala-editor-left-panel">
      {espacios.length > 0 && phase !== "espacios" ? (
        <SalaEspaciosSidebar
          mode="switcher"
          espacios={espacios}
          selectedEspacioId={selectedEspacioId}
          elementCountByEspacioId={elementCountByEspacioId}
          onSelectEspacio={onSelectEspacio}
          onRequestAddEspacio={onRequestAddEspacio}
          onUpdateEspacio={onUpdateEspacio}
        />
      ) : null}
      <div className="hostly-sala-editor-left-panel__scroll">
        {phase === "espacios" ? (
          <SalaEspaciosSidebar
            mode="primary"
            espacios={espacios}
            selectedEspacioId={selectedEspacioId}
            elementCountByEspacioId={elementCountByEspacioId}
            onSelectEspacio={onSelectEspacio}
            onRequestAddEspacio={onRequestAddEspacio}
            onUpdateEspacio={onUpdateEspacio}
          />
        ) : null}
        {phase === "base" ? (
          <SalaBaseSidebar
            espacio={selectedEspacio}
            onUpdateBase={(espacioId, patch) => onUpdateEspacioBase?.(espacioId, patch)}
          />
        ) : null}
        {phase === "terreno" ? (
          <SalaTerrenoSidebar
            activeSurfaceMaterial={activeSurfaceMaterial}
            onSelectSurfaceMaterial={onSelectSurfaceMaterial}
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
            activeVisualVariant={activeOperationalVisualVariant}
            onSelectElementType={onSelectOperationalElement}
          />
        ) : null}
      </div>
    </div>
  );
}
