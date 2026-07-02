"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaEspacioType } from "@/lib/sala-editor/catalog/espacio-types";
import {
  createLocalEspacio,
  nextEspacioSortOrder,
} from "@/lib/sala-editor/preview/create-preview-espacios";
import { useSalaEditorDocument } from "@/hooks/useSalaEditorDocument";
import { useSalaEditorHistory } from "@/hooks/useSalaEditorHistory";
import { useSalaWallDrawing } from "@/hooks/useSalaWallDrawing";
import { useOperationalElementDragging } from "@/hooks/useOperationalElementDragging";
import { useOperationalElementResizing } from "@/hooks/useOperationalElementResizing";
import {
  getDefaultOperationalInstanceCanvasSize,
  getOperationalInstanceCanvasSize,
} from "@/lib/sala-editor/canvas/operational-instance-layout";
import type { OperationalElementPosition } from "@/lib/sala-editor/ose/operational-element";
import {
  EMPTY_OPERATIONAL_SNAP_GUIDES,
  snapOperationalCenterPosition,
  type OperationalSnapGuides,
} from "@/lib/sala-editor/canvas/operational-snap";
import type { OperationalInstancePointerPayload } from "@/lib/sala-editor/canvas/pointer-interaction";
import {
  loadSalaEditorDraft,
  saveSalaEditorDraft,
} from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import { SalaEditorShell } from "@/components/sala-editor/sala-editor-shell";
import { hasSalaEditorInspectorSelection } from "@/components/sala-editor/sala-editor-inspector-visibility";
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
  currentUserId?: string | null;
  draftPersistenceEnabled?: boolean;
};

/**
 * Workspace del editor de sala V2.
 * Estado 100 % local; gestor visual + herramienta activa + paredes (Fase 2.3).
 */
export function SalaEditorWorkspace({
  restaurantId,
  initialEspacios = [],
  legacyEditorHref,
  currentUserId = null,
  draftPersistenceEnabled = true,
}: SalaEditorWorkspaceProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [operationalSnapGuides, setOperationalSnapGuides] =
    useState<OperationalSnapGuides>(EMPTY_OPERATIONAL_SNAP_GUIDES);
  const [draftReady, setDraftReady] = useState(!draftPersistenceEnabled);
  const draftLoadSeqRef = useRef(0);
  const lastDraftSignatureRef = useRef<string | null>(null);
  const documentSnapshotRef = useRef<SalaEditorDocument | null>(null);

  const { historyApi } = useSalaEditorHistory();

  const getDocumentSnapshot = useCallback(() => {
    return documentSnapshotRef.current!;
  }, []);

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
    replaceDocument,
    selectTool,
    selectOperationalElement,
    placeOperationalElementAt,
    selectOperationalElementInstance,
    clearOperationalElementInstance,
    updateOperationalElement,
    removeOperationalElement,
    duplicateOperationalElement,
    resizeOperationalElementInstance,
    setPhase,
    selectEspacio,
    addEspacioAndSelect,
    updateEspacio,
    addWall,
  } = useSalaEditorDocument({
    restaurantId,
    initialEspacios,
    historyApi,
    getDocumentSnapshot,
  });
  const initialLocalDocumentRef = useRef(document);
  documentSnapshotRef.current = document;

  useEffect(() => {
    if (!draftPersistenceEnabled) {
      setDraftReady(true);
      return;
    }

    const requestId = ++draftLoadSeqRef.current;
    setDraftReady(false);

    void (async () => {
      try {
        const draft = await loadSalaEditorDraft(restaurantId);
        if (requestId !== draftLoadSeqRef.current) return;

        if (draft) {
          replaceDocument(draft.document);
          lastDraftSignatureRef.current = JSON.stringify(draft.document);
        } else {
          lastDraftSignatureRef.current = JSON.stringify(
            initialLocalDocumentRef.current,
          );
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[SalaEditorV2] No se pudo cargar el borrador", error);
        }
        if (requestId !== draftLoadSeqRef.current) return;
        lastDraftSignatureRef.current = JSON.stringify(
          initialLocalDocumentRef.current,
        );
      } finally {
        if (requestId === draftLoadSeqRef.current) {
          setDraftReady(true);
        }
      }
    })();
  }, [draftPersistenceEnabled, replaceDocument, restaurantId]);

  useEffect(() => {
    if (!draftPersistenceEnabled || !draftReady) return;

    const signature = JSON.stringify(document);
    if (signature === lastDraftSignatureRef.current) return;

    const timeout = window.setTimeout(() => {
      historyApi.flushScheduledCommits(getDocumentSnapshot);
      void saveSalaEditorDraft(restaurantId, document, {
        updatedBy: currentUserId,
      })
        .then(() => {
          lastDraftSignatureRef.current = signature;
        })
        .catch((error) => {
          if (process.env.NODE_ENV === "development") {
            console.warn("[SalaEditorV2] No se pudo guardar el borrador", error);
          }
        });
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [
    currentUserId,
    document,
    draftPersistenceEnabled,
    draftReady,
    getDocumentSnapshot,
    historyApi,
    restaurantId,
  ]);

  const operationalDragEnabled = document.navigation.phase === "operacion";

  const commitOperationalMoveHistory = useCallback(() => {
    historyApi.commitTransaction("operational.move", documentSnapshotRef.current!);
  }, [historyApi]);

  const discardOperationalMoveHistory = useCallback(() => {
    historyApi.discardTransaction();
  }, [historyApi]);

  const commitOperationalResizeHistory = useCallback(() => {
    historyApi.commitTransaction("operational.resize", documentSnapshotRef.current!);
  }, [historyApi]);

  const discardOperationalResizeHistory = useCallback(() => {
    historyApi.discardTransaction();
  }, [historyApi]);

  const clearOperationalSnapGuides = useCallback(() => {
    setOperationalSnapGuides(EMPTY_OPERATIONAL_SNAP_GUIDES);
  }, []);

  const applyOperationalSnap = useCallback(
    (
      instanceId: string,
      raw: OperationalElementPosition,
      size: { width: number; height: number },
    ) => {
      const result = snapOperationalCenterPosition(raw, {
        draggingInstanceId: instanceId,
        instances: operationalElementInstancesInEspacio,
        size,
      });
      setOperationalSnapGuides(result.guides);
      return result.position;
    },
    [operationalElementInstancesInEspacio],
  );

  const {
    draggingInstanceId: draggingOperationalInstanceId,
    dropAnimatingInstanceId: dropAnimatingOperationalInstanceId,
    beginInstancePointer,
    moveInstancePointer,
    endInstancePointer,
    cancelInstancePointer,
    cancelDragging,
    isDragging: isOperationalDragging,
    handleCanvasPointerDown: operationalCanvasPointerDown,
  } = useOperationalElementDragging({
    enabled: operationalDragEnabled,
    onUpdatePosition: (instanceId, position) => {
      const instance = operationalElementInstancesInEspacio.find(
        (item) => item.id === instanceId,
      );
      if (!instance) {
        updateOperationalElement(instanceId, { position });
        return;
      }
      const snapped = applyOperationalSnap(
        instanceId,
        position,
        getOperationalInstanceCanvasSize(instance),
      );
      updateOperationalElement(instanceId, { position: snapped });
    },
    onSelectInstance: selectOperationalElementInstance,
    onClearSelection: clearOperationalElementInstance,
    onDragSessionStart: () => {
      historyApi.beginTransaction(documentSnapshotRef.current!);
    },
    onDragSessionEnd: (outcome) => {
      if (outcome === "complete") {
        commitOperationalMoveHistory();
      } else {
        discardOperationalMoveHistory();
      }
    },
  });

  const {
    resizingInstanceId: resizingOperationalInstanceId,
    startResize,
    updateResize,
    finishResize,
    cancelResize,
    isResizing: isOperationalResizing,
  } = useOperationalElementResizing({
    enabled: operationalDragEnabled,
    onSelectInstance: selectOperationalElementInstance,
    onResize: resizeOperationalElementInstance,
    onResizeSessionEnd: (outcome) => {
      if (outcome === "complete") {
        commitOperationalResizeHistory();
      } else {
        discardOperationalResizeHistory();
      }
    },
  });

  const handleOperationalResizeStart = useCallback(
    (
      instanceId: string,
      corner: Parameters<typeof startResize>[1],
      clientX: number,
      clientY: number,
    ) => {
      const instance = operationalElementInstancesInEspacio.find(
        (item) => item.id === instanceId,
      );
      if (!instance) return;
      historyApi.beginTransaction(documentSnapshotRef.current!);
      startResize(
        instanceId,
        corner,
        clientX,
        clientY,
        getOperationalInstanceCanvasSize(instance),
        instance.position,
      );
    },
    [historyApi, operationalElementInstancesInEspacio, startResize],
  );

  const handleOperationalCanvasPointerDown = useCallback(
    (point: { x: number; y: number }) => {
      operationalCanvasPointerDown(point, () => {
        if (!activeOperationalElementType) {
          placeOperationalElementAt(point);
          return;
        }
        const defaultSize = getDefaultOperationalInstanceCanvasSize(
          activeOperationalElementType,
        );
        const { position } = snapOperationalCenterPosition(point, {
          draggingInstanceId: "__placement__",
          instances: operationalElementInstancesInEspacio,
          size: defaultSize,
        });
        placeOperationalElementAt(position);
      });
    },
    [
      activeOperationalElementType,
      operationalCanvasPointerDown,
      operationalElementInstancesInEspacio,
      placeOperationalElementAt,
    ],
  );

  const handleOperationalInstancePointerDown = useCallback(
    (instanceId: string, payload: OperationalInstancePointerPayload) => {
      if (isOperationalResizing()) return;
      beginInstancePointer(instanceId, {
        ...payload,
        canvasPoint: payload.point,
      });
    },
    [beginInstancePointer, isOperationalResizing],
  );

  const handleOperationalInstancePointerMove = useCallback(
    (instanceId: string, payload: OperationalInstancePointerPayload) => {
      moveInstancePointer(instanceId, {
        ...payload,
        canvasPoint: payload.point,
      });
    },
    [moveInstancePointer],
  );

  const handleOperationalInstancePointerUp = useCallback(
    (instanceId: string) => {
      endInstancePointer(instanceId);
      clearOperationalSnapGuides();
    },
    [clearOperationalSnapGuides, endInstancePointer],
  );

  const handleOperationalInstancePointerCancel = useCallback(
    (instanceId: string) => {
      cancelInstancePointer(instanceId);
      clearOperationalSnapGuides();
    },
    [cancelInstancePointer, clearOperationalSnapGuides],
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

  const previousEspacioIdRef = useRef<string | null>(selectedEspacio?.id ?? null);

  useEffect(() => {
    const nextId = selectedEspacio?.id ?? null;
    if (
      previousEspacioIdRef.current != null &&
      previousEspacioIdRef.current !== nextId
    ) {
      cancelDragging();
      cancelResize();
      clearOperationalSnapGuides();
      historyApi.discardTransaction();
    }
    previousEspacioIdRef.current = nextId;
  }, [
    cancelDragging,
    cancelResize,
    clearOperationalSnapGuides,
    historyApi,
    selectedEspacio?.id,
  ]);

  const openAddDialog = useCallback(() => {
    setAddDialogOpen(true);
  }, []);

  const selectedElementCount = selectedEspacio
    ? (elementCountByEspacioId[selectedEspacio.id] ?? 0)
    : 0;

  const inspectorOpen = hasSalaEditorInspectorSelection({
    phase: document.navigation.phase,
    espacio: selectedEspacio,
    selectedWall: selectedWall ?? null,
    selectedOperationalElementInstance: selectedOperationalElementInstance ?? null,
  });

  return (
    <>
      <SalaEditorShell
        navigation={document.navigation}
        disabledPhases={disabledPhases}
        espaciosCount={document.espacios.length}
        inspectorOpen={inspectorOpen}
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
            onUpdateEspacio={updateEspacio}
          />
        }
        workspace={
          <SalaEditorWorkspaceCanvas
            restaurantId={document.restaurantId}
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
            resizingOperationalInstanceId={resizingOperationalInstanceId}
            dropAnimatingOperationalInstanceId={dropAnimatingOperationalInstanceId}
            operationalSnapGuides={operationalSnapGuides}
            isOperationalDragging={isOperationalDragging}
            isOperationalResizing={isOperationalResizing}
            onOperationalCanvasPointerDown={handleOperationalCanvasPointerDown}
            onOperationalInstancePointerDown={handleOperationalInstancePointerDown}
            onOperationalInstancePointerMove={handleOperationalInstancePointerMove}
            onOperationalInstancePointerUp={handleOperationalInstancePointerUp}
            onOperationalInstancePointerCancel={handleOperationalInstancePointerCancel}
            onOperationalResizeStart={handleOperationalResizeStart}
            onOperationalResizeMove={updateResize}
            onOperationalResizeEnd={finishResize}
            onOperationalResizeCancel={cancelResize}
            onOperationalDuplicateInstance={duplicateOperationalElement}
            onOperationalDeleteInstance={removeOperationalElement}
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
