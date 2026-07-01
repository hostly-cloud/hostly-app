"use client";

import { useCallback, useMemo } from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import {
  createLocalEspacioFromPreset,
  nextAvailableEspacioPresetKey,
} from "@/lib/sala-editor/preview/create-preview-espacios";
import { useSalaEditorDocument } from "@/hooks/useSalaEditorDocument";
import { SalaEditorShell } from "@/components/sala-editor/sala-editor-shell";
import {
  SalaEditorLeftPanel,
  SalaEditorInspectorPanel,
  SalaEditorWorkspaceCanvas,
} from "@/components/sala-editor/panels";

export type SalaEditorWorkspaceProps = {
  restaurantId: string;
  initialEspacios?: SalaEspacio[];
};

/**
 * Workspace del editor de sala V2.
 * Estado 100 % local; preview de navegación y paneles.
 */
export function SalaEditorWorkspace({
  restaurantId,
  initialEspacios = [],
}: SalaEditorWorkspaceProps) {
  const {
    document,
    disabledPhases,
    selectedEspacio,
    setPhase,
    selectEspacio,
    addEspacio,
    updateEspacio,
  } = useSalaEditorDocument({
    restaurantId,
    initialEspacios,
  });

  const canAddEspacio = useMemo(
    () => nextAvailableEspacioPresetKey(document.espacios.map((e) => e.name)) != null,
    [document.espacios],
  );

  const handleAddEspacio = useCallback(() => {
    const key = nextAvailableEspacioPresetKey(document.espacios.map((e) => e.name));
    if (!key) return;
    const created = createLocalEspacioFromPreset(
      document.restaurantId,
      key,
      document.espacios.map((e) => e.name),
    );
    if (!created) return;
    addEspacio(created);
    selectEspacio(created.id);
  }, [addEspacio, document.espacios, document.restaurantId, selectEspacio]);

  const handleUpdateEspacio = useCallback(
    (patch: Partial<SalaEspacioDraft>) => {
      if (!selectedEspacio) return;
      updateEspacio(selectedEspacio.id, patch);
    },
    [selectedEspacio, updateEspacio],
  );

  const handleSelectEspacio = useCallback(
    (espacioId: string) => {
      selectEspacio(espacioId);
    },
    [selectEspacio],
  );

  return (
    <SalaEditorShell
      navigation={document.navigation}
      disabledPhases={disabledPhases}
      espaciosCount={document.espacios.length}
      onPhaseChange={setPhase}
      leftPanel={
        <SalaEditorLeftPanel
          phase={document.navigation.phase}
          espacios={document.espacios}
          selectedEspacioId={document.navigation.selectedEspacioId}
          onSelectEspacio={handleSelectEspacio}
          onAddEspacio={handleAddEspacio}
          canAddEspacio={canAddEspacio}
        />
      }
      workspace={
        <SalaEditorWorkspaceCanvas
          phase={document.navigation.phase}
          espacioName={selectedEspacio?.name ?? null}
        />
      }
      inspector={
        <SalaEditorInspectorPanel
          phase={document.navigation.phase}
          espacio={selectedEspacio}
          onUpdateEspacio={handleUpdateEspacio}
        />
      }
    />
  );
}

export { SalaEditorShell } from "@/components/sala-editor/sala-editor-shell";
export { SalaEditorPhaseNav } from "@/components/sala-editor/sala-editor-phase-nav";
export * from "@/components/sala-editor/phases";
export * from "@/components/sala-editor/panels";
