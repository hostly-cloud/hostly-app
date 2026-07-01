"use client";

import { useCallback, useState } from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import type { SalaEspacioType } from "@/lib/sala-editor/catalog/espacio-types";
import {
  createLocalEspacio,
  nextEspacioSortOrder,
} from "@/lib/sala-editor/preview/create-preview-espacios";
import { useSalaEditorDocument } from "@/hooks/useSalaEditorDocument";
import { SalaEditorShell } from "@/components/sala-editor/sala-editor-shell";
import {
  SalaEditorLeftPanel,
  SalaEditorInspectorPanel,
  SalaEditorWorkspaceCanvas,
  SalaAddEspacioDialog,
} from "@/components/sala-editor/panels";

export type SalaEditorWorkspaceProps = {
  restaurantId: string;
  initialEspacios?: SalaEspacio[];
};

/**
 * Workspace del editor de sala V2.
 * Estado 100 % local; gestor visual de espacios (Fase 2.1).
 */
export function SalaEditorWorkspace({
  restaurantId,
  initialEspacios = [],
}: SalaEditorWorkspaceProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const {
    document,
    disabledPhases,
    selectedEspacio,
    elementCountByEspacioId,
    setPhase,
    selectEspacio,
    addEspacioAndSelect,
    updateEspacio,
  } = useSalaEditorDocument({
    restaurantId,
    initialEspacios,
  });

  const handleCreateEspacio = useCallback(
    (payload: { name: string; tipo: SalaEspacioType; color: string }) => {
      const created = createLocalEspacio({
        restaurantId: document.restaurantId,
        name: payload.name,
        tipo: payload.tipo,
        color: payload.color,
        sortOrder: nextEspacioSortOrder(document.espacios),
      });
      addEspacioAndSelect(created);
    },
    [addEspacioAndSelect, document.espacios, document.restaurantId],
  );

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

  const openAddDialog = useCallback(() => {
    setAddDialogOpen(true);
  }, []);

  const selectedElementCount = selectedEspacio
    ? (elementCountByEspacioId[selectedEspacio.id] ?? 0)
    : 0;

  return (
    <>
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
            elementCountByEspacioId={elementCountByEspacioId}
            onSelectEspacio={handleSelectEspacio}
            onRequestAddEspacio={openAddDialog}
          />
        }
        workspace={
          <SalaEditorWorkspaceCanvas
            phase={document.navigation.phase}
            espacio={selectedEspacio}
            hasEspacios={document.espacios.length > 0}
            onRequestCreateEspacio={openAddDialog}
          />
        }
        inspector={
          <SalaEditorInspectorPanel
            phase={document.navigation.phase}
            espacio={selectedEspacio}
            elementCount={selectedElementCount}
            onUpdateEspacio={handleUpdateEspacio}
          />
        }
      />

      <SalaAddEspacioDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onCreate={handleCreateEspacio}
      />
    </>
  );
}

export { SalaEditorShell } from "@/components/sala-editor/sala-editor-shell";
export { SalaEditorPhaseNav } from "@/components/sala-editor/sala-editor-phase-nav";
export * from "@/components/sala-editor/phases";
export * from "@/components/sala-editor/panels";
