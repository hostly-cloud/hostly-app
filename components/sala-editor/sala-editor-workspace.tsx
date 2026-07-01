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
import { useSalaWallDrawing } from "@/hooks/useSalaWallDrawing";
import { useOperationalElementDragging } from "@/hooks/useOperationalElementDragging";
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
  legacyEditorHref?: string;
};

/**
 * Workspace del editor de sala V2.
 * Estado 100 % local; gestor visual + herramienta activa + paredes (Fase 2.3).
 */
export function SalaEditorWorkspace({
  restaurantId,
  initialEspacios = [],
  legacyEditorHref,
}: SalaEditorWorkspaceProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const {
    document,
    disabledPhases,
    selectedEspacio,
    elementCountByEspacioId,
    activeStructuralToolKind,
    activeStructuralToolboxItem,
    activeOperationalElementType,
    activeOperationalCatalogItem,
    operationalElementInstancesInEspacio,
    selectedOperationalElementInstanceId,
    selectedOperationalElementInstance,
    selectTool,
    selectOperationalElement,
    placeOperationalElementAt,
    selectOperationalElementInstance,
    clearOperationalElementInstance,
    updateOperationalElement,
    setPhase,
    selectEspacio,
    addEspacioAndSelect,
    updateEspacio,
    addWall,
  } = useSalaEditorDocument({
    restaurantId,
    initialEspacios,
  });

  const operationalDragEnabled = document.navigation.phase === "operacion";

  const {
    draggingInstanceId: draggingOperationalInstanceId,
    dropAnimatingInstanceId: dropAnimatingOperationalInstanceId,
    startDragging,
    updateDragging,
    finishDragging,
    cancelDragging,
    isDragging: isOperationalDragging,
    handleCanvasPointerDown: operationalCanvasPointerDown,
  } = useOperationalElementDragging({
    enabled: operationalDragEnabled,
    onUpdatePosition: (instanceId, position) => {
      updateOperationalElement(instanceId, { position });
    },
    onSelectInstance: selectOperationalElementInstance,
    onClearSelection: clearOperationalElementInstance,
  });

  const handleOperationalCanvasPointerDown = useCallback(
    (point: { x: number; y: number }) => {
      operationalCanvasPointerDown(point, () => {
        placeOperationalElementAt(point);
      });
    },
    [operationalCanvasPointerDown, placeOperationalElementAt],
  );

  const handleOperationalInstancePointerDown = useCallback(
    (instanceId: string, _point: { x: number; y: number }) => {
      startDragging(instanceId);
    },
    [startDragging],
  );

  const handleOperationalInstancePointerMove = useCallback(
    (instanceId: string, point: { x: number; y: number }) => {
      updateDragging(instanceId, point);
    },
    [updateDragging],
  );

  const handleOperationalInstancePointerUp = useCallback(
    (instanceId: string) => {
      if (isOperationalDragging()) {
        finishDragging();
      }
    },
    [finishDragging, isOperationalDragging],
  );

  const handleOperationalInstancePointerCancel = useCallback(
    (_instanceId: string) => {
      cancelDragging();
    },
    [cancelDragging],
  );

  const wallDrawingEnabled =
    document.navigation.phase === "estructura" &&
    activeStructuralToolKind === "wall";

  const {
    wallsInEspacio,
    draft: wallDraft,
    selectedWallId,
    selectedWall,
    handlePointerDown: handleWallPointerDown,
    handlePointerMove: handleWallPointerMove,
  } = useSalaWallDrawing({
    espacioId: selectedEspacio?.id ?? null,
    walls: document.walls,
    enabled: wallDrawingEnabled,
    onAddWall: addWall,
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
        legacyEditorHref={legacyEditorHref}
        leftPanel={
          <SalaEditorLeftPanel
            phase={document.navigation.phase}
            espacios={document.espacios}
            selectedEspacioId={document.navigation.selectedEspacioId}
            elementCountByEspacioId={elementCountByEspacioId}
            activeStructuralToolKind={activeStructuralToolKind}
            activeOperationalElementType={activeOperationalElementType}
            onSelectEspacio={handleSelectEspacio}
            onRequestAddEspacio={openAddDialog}
            onSelectStructuralTool={selectTool}
            onSelectOperationalElement={selectOperationalElement}
          />
        }
        workspace={
          <SalaEditorWorkspaceCanvas
            phase={document.navigation.phase}
            espacio={selectedEspacio}
            hasEspacios={document.espacios.length > 0}
            activeStructuralToolboxItem={activeStructuralToolboxItem}
            walls={wallsInEspacio}
            wallDraft={wallDraft}
            selectedWallId={selectedWallId}
            onWallPointerDown={wallDrawingEnabled ? handleWallPointerDown : undefined}
            onWallPointerMove={wallDrawingEnabled ? handleWallPointerMove : undefined}
            activeOperationalCatalogItem={activeOperationalCatalogItem}
            operationalElementInstances={operationalElementInstancesInEspacio}
            selectedOperationalElementInstanceId={selectedOperationalElementInstanceId}
            draggingOperationalInstanceId={draggingOperationalInstanceId}
            dropAnimatingOperationalInstanceId={dropAnimatingOperationalInstanceId}
            isOperationalDragging={isOperationalDragging}
            onOperationalCanvasPointerDown={handleOperationalCanvasPointerDown}
            onOperationalInstancePointerDown={handleOperationalInstancePointerDown}
            onOperationalInstancePointerMove={handleOperationalInstancePointerMove}
            onOperationalInstancePointerUp={handleOperationalInstancePointerUp}
            onOperationalInstancePointerCancel={handleOperationalInstancePointerCancel}
            onRequestCreateEspacio={openAddDialog}
          />
        }
        inspector={
          <SalaEditorInspectorPanel
            phase={document.navigation.phase}
            espacio={selectedEspacio}
            elementCount={selectedElementCount}
            activeStructuralToolboxItem={activeStructuralToolboxItem}
            selectedWall={selectedWall}
            activeOperationalCatalogItem={activeOperationalCatalogItem}
            selectedOperationalElementInstance={selectedOperationalElementInstance}
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
