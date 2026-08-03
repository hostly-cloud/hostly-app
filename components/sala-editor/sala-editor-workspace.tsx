"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaWallAttachmentKind } from "@/lib/sala-editor/types/wall-attachment";
import type { SurfaceObjectDraft } from "@/lib/sala-editor/surface/surface-object";
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
import {
  isOperationalBarElementType,
  isOperationalServiceAreaElementType,
  type OperationalElementPosition,
} from "@/lib/sala-editor/ose/operational-element";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { getOperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import { getLandscapeToolboxItem } from "@/lib/sala-editor/catalog/landscape-toolbox";
import {
  snapOperationalCenterPosition,
} from "@/lib/sala-editor/canvas/operational-snap";
import {
  SNAP_DISTANCE_PX,
  snapRectToPeers,
  type SnapGuide,
  type SnapRect,
} from "@/lib/sala-editor/snap";
import type { OperationalInstancePointerPayload } from "@/lib/sala-editor/canvas/pointer-interaction";
import type {
  WallEditMode,
  WallEditOutcome,
} from "@/lib/sala-editor/canvas/wall-interaction";
import type { WallAttachmentEditOutcome } from "@/lib/sala-editor/canvas/wall-attachment-interaction";
import type { SurfaceEditOutcome } from "@/lib/sala-editor/surface/surface-interaction";
import {
  loadSalaEditorDraft,
  saveSalaEditorDraft,
} from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import { publishSalaEditorMapViaApi } from "@/lib/sala-editor/persistence/publish-sala-editor-map-via-api";
import { loadLegacySalaEditorDocument } from "@/lib/sala-editor/adapters/legacy-adapters";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { SalaEditorShell } from "@/components/sala-editor/sala-editor-shell";
import type { SalaEditorContextActionTarget } from "@/components/sala-editor/sala-editor-context-action-bar";
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

const EMPTY_SMART_SNAP_GUIDES: SnapGuide[] = [];

function operationalInstanceToSnapRect(
  instance: OperationalElementInstance,
): SnapRect {
  const size = getOperationalInstanceCanvasSize(instance);
  return {
    id: instance.id,
    x: instance.position.x - size.width / 2,
    y: instance.position.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function isOperationalSmartSnapType(
  instance: OperationalElementInstance,
): boolean {
  return (
    instance.elementType === "TABLE" ||
    isOperationalBarElementType(instance.elementType) ||
    isOperationalServiceAreaElementType(instance.elementType)
  );
}

function operationalPositionToSnapRect(
  instance: OperationalElementInstance,
  position: OperationalElementPosition,
): SnapRect {
  const size = getOperationalInstanceCanvasSize(instance);
  return {
    id: instance.id,
    x: position.x - size.width / 2,
    y: position.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function snapRectToOperationalPosition(rect: SnapRect): OperationalElementPosition {
  return {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  };
}

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
    useState<SnapGuide[]>(EMPTY_SMART_SNAP_GUIDES);
  const [draftReady, setDraftReady] = useState(!draftPersistenceEnabled);
  const [legacyHydratedReadOnly, setLegacyHydratedReadOnly] = useState(false);
  const [publishMapBusy, setPublishMapBusy] = useState(false);
  const draftLoadSeqRef = useRef(0);
  const lastDraftSignatureRef = useRef<string | null>(null);
  const documentSnapshotRef = useRef<SalaEditorDocument | null>(null);

  const { historyApi, historyRevision } = useSalaEditorHistory();

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
    activeSurfaceMaterial,
    activeZoneType,
    activeLandscapeKind,
    surfaceObjectsInEspacio,
    selectedSurfaceObjectId,
    zonesInEspacio,
    selectedZoneId,
    selectedZone,
    structuralElementsInEspacio,
    selectedStructuralElementId,
    selectedStructuralElement,
    landscapeElementsInEspacio,
    selectedLandscapeElementId,
    selectedLandscapeElement,
    activeOperationalElementType,
    activeOperationalVisualVariant,
    activeOperationalCatalogItem,
    operationalElementInstancesInEspacio,
    selectedOperationalElementInstanceId,
    selectedOperationalElementInstance,
    selectedWallAttachmentId,
    replaceDocument,
    restoreDocumentSnapshot,
    selectTool,
    selectSurfaceMaterial,
    selectZoneType,
    selectLandscapeKind,
    addSurfaceObject,
    updateSurfaceObject,
    removeSurfaceObject,
    selectSurfaceObject,
    clearSurfaceSelection,
    addZone,
    updateZone,
    removeZone,
    selectZone,
    clearZoneSelection,
    addStructuralElement,
    updateStructuralElement,
    removeStructuralElement,
    selectStructuralElement,
    clearStructuralElementSelection,
    addLandscapeElement,
    updateLandscapeElement,
    removeLandscapeElement,
    selectLandscapeElement,
    clearLandscapeSelection,
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
    updateEspacioBase,
    addWall,
    updateWall,
    removeWall,
    addWallAttachment,
    selectWallAttachment,
    clearWallAttachmentSelection,
    updateWallAttachment,
    removeWallAttachment,
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
          setLegacyHydratedReadOnly(false);
        } else {
          const legacyHydration = await loadLegacySalaEditorDocument(restaurantId);
          if (requestId !== draftLoadSeqRef.current) return;

          if (legacyHydration) {
            replaceDocument(legacyHydration.document);
            lastDraftSignatureRef.current = JSON.stringify(legacyHydration.document);
            setLegacyHydratedReadOnly(true);
            if (
              process.env.NODE_ENV === "development" &&
              legacyHydration.warnings.length > 0
            ) {
              console.warn(
                "[SalaEditorV2] Hidratación legacy con avisos",
                legacyHydration.warnings,
              );
            }
          } else {
            lastDraftSignatureRef.current = JSON.stringify(
              initialLocalDocumentRef.current,
            );
            setLegacyHydratedReadOnly(false);
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[SalaEditorV2] No se pudo cargar el borrador", error);
        }
        if (requestId !== draftLoadSeqRef.current) return;
        lastDraftSignatureRef.current = JSON.stringify(
          initialLocalDocumentRef.current,
        );
        setLegacyHydratedReadOnly(false);
      } finally {
        if (requestId === draftLoadSeqRef.current) {
          setDraftReady(true);
        }
      }
    })();
  }, [draftPersistenceEnabled, replaceDocument, restaurantId]);

  const handlePublishMap = useCallback(async () => {
    if (publishMapBusy) return;
    if (!draftPersistenceEnabled) {
      window.alert("Activa la persistencia del borrador para publicar.");
      return;
    }
    setPublishMapBusy(true);
    try {
      // Persistir draft actual antes de publicar (la API lee draft en servidor).
      historyApi.flushScheduledCommits(getDocumentSnapshot);
      await saveSalaEditorDraft(restaurantId, document, {
        updatedBy: currentUserId,
      });
      lastDraftSignatureRef.current = JSON.stringify(document);
      const result = await publishSalaEditorMapViaApi();
      if (!result.ok) {
        window.alert(
          `No se pudo publicar el mapa.\nCódigo: ${result.error}${
            result.details ? `\n${result.details}` : ""
          }`,
        );
        return;
      }
      window.alert("Mapa publicado. El TPV usará esta versión operativa.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "PUBLISH_FAILED";
      window.alert(`No se pudo publicar el mapa.\n${msg}`);
    } finally {
      setPublishMapBusy(false);
    }
  }, [
    currentUserId,
    document,
    draftPersistenceEnabled,
    getDocumentSnapshot,
    historyApi,
    publishMapBusy,
    restaurantId,
  ]);

  useEffect(() => {
    if (!draftPersistenceEnabled || !draftReady) return;
    if (legacyHydratedReadOnly) return;

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
    legacyHydratedReadOnly,
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
    setOperationalSnapGuides(EMPTY_SMART_SNAP_GUIDES);
  }, []);

  const applyOperationalSnap = useCallback(
    (
      instanceId: string,
      raw: OperationalElementPosition,
      instance: OperationalElementInstance,
    ) => {
      if (!isOperationalSmartSnapType(instance)) {
        setOperationalSnapGuides(EMPTY_SMART_SNAP_GUIDES);
        return raw;
      }

      const peers = operationalElementInstancesInEspacio
        .filter(
          (candidate) =>
            candidate.id !== instanceId && isOperationalSmartSnapType(candidate),
        )
        .map(operationalInstanceToSnapRect);

      const result = snapRectToPeers(
        operationalPositionToSnapRect(instance, raw),
        peers,
        { threshold: SNAP_DISTANCE_PX },
      );

      setOperationalSnapGuides(result.guides);
      return snapRectToOperationalPosition(result.rect);
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
        instance,
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
      const instance = operationalElementInstancesInEspacio.find(
        (item) => item.id === instanceId,
      );
      if (!instance) return;
      beginInstancePointer(instanceId, {
        ...payload,
        canvasPoint: payload.point,
      }, instance.position);
    },
    [beginInstancePointer, isOperationalResizing, operationalElementInstancesInEspacio],
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

  const wallGridSize = selectedEspacio
    ? normalizeSalaEspacioBase(selectedEspacio.base).grid.size
    : 16;

  const handleWallEditSessionStart = useCallback(
    () => {
      historyApi.beginTransaction(documentSnapshotRef.current!);
    },
    [historyApi],
  );

  const handleWallEditSessionEnd = useCallback(
    (mode: WallEditMode, outcome: WallEditOutcome) => {
      if (outcome !== "complete") {
        historyApi.discardTransaction();
        return;
      }

      historyApi.commitTransaction(
        mode === "move" ? "wall.move" : "wall.resize",
        documentSnapshotRef.current!,
      );
    },
    [historyApi],
  );

  const {
    wallsInEspacio,
    draft: wallDraft,
    selectedWallId,
    selectedWall,
    cancelDrawing: cancelWallDrawing,
    cancelEditSession: cancelWallEditSession,
    clearWallSelection,
    handlePointerDown: handleWallPointerDown,
    handlePointerMove: handleWallPointerMove,
    handlePointerUp: handleWallPointerUp,
    handlePointerCancel: handleWallPointerCancel,
  } = useSalaWallDrawing({
    espacioId: selectedEspacio?.id ?? null,
    walls: document.walls,
    enabled: wallDrawingEnabled,
    gridSize: wallGridSize,
    onAddWall: addWall,
    onUpdateWall: updateWall,
    onEditSessionStart: handleWallEditSessionStart,
    onEditSessionEnd: handleWallEditSessionEnd,
  });

  const wallAttachmentsInEspacio = useMemo(() => {
    const wallIds = new Set(wallsInEspacio.map((wall) => wall.id));
    return document.wallAttachments.filter((attachment) =>
      wallIds.has(attachment.wallId),
    );
  }, [document.wallAttachments, wallsInEspacio]);

  const handleStructuralWallPointerDown = useCallback(
    (payload: Parameters<typeof handleWallPointerDown>[0]) => {
      clearWallAttachmentSelection();
      clearStructuralElementSelection();
      clearZoneSelection();
      clearLandscapeSelection();
      handleWallPointerDown(payload);
    },
    [
      clearLandscapeSelection,
      clearStructuralElementSelection,
      clearZoneSelection,
      clearWallAttachmentSelection,
      handleWallPointerDown,
    ],
  );

  const handleDeleteWall = useCallback(
    (wallId: string) => {
      removeWall(wallId);
      clearWallSelection();
    },
    [clearWallSelection, removeWall],
  );

  const handlePlaceWallAttachment = useCallback(
    (
      wallId: string,
      positionRatio: number,
      kind: SalaWallAttachmentKind,
    ) => {
      clearWallSelection();
      clearStructuralElementSelection();
      clearZoneSelection();
      clearLandscapeSelection();
      addWallAttachment({
        wallId,
        kind,
        positionRatio,
      });
    },
    [
      addWallAttachment,
      clearLandscapeSelection,
      clearStructuralElementSelection,
      clearZoneSelection,
      clearWallSelection,
    ],
  );

  const handleCreateSurfaceObject = useCallback(
    (draft: SurfaceObjectDraft) => {
      clearWallSelection();
      clearWallAttachmentSelection();
      addSurfaceObject(draft);
    },
    [addSurfaceObject, clearWallAttachmentSelection, clearWallSelection],
  );

  const handleSelectSurfaceObject = useCallback(
    (surfaceId: string | null) => {
      if (surfaceId) {
        clearWallSelection();
        clearWallAttachmentSelection();
      }
      selectSurfaceObject(surfaceId);
    },
    [clearWallAttachmentSelection, clearWallSelection, selectSurfaceObject],
  );

  const handleSurfaceMoveStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleSurfaceMoveEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("surface.move", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleSurfaceResizeStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleSurfaceResizeEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("surface.resize", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleZoneMoveStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleZoneMoveEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("zone.move", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleZoneResizeStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleZoneResizeEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("zone.resize", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleStructuralElementMoveStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleStructuralElementMoveEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("structural.move", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleStructuralElementResizeStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleStructuralElementResizeEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction(
          "structural.resize",
          documentSnapshotRef.current!,
        );
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleLandscapeElementMoveStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleLandscapeElementMoveEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("landscape.move", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleLandscapeElementResizeStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleLandscapeElementResizeEnd = useCallback(
    (outcome: SurfaceEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction("landscape.resize", documentSnapshotRef.current!);
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

  const handleCreateStructuralElement = useCallback(
    (draft: Parameters<typeof addStructuralElement>[0]) => {
      clearZoneSelection();
      clearWallSelection();
      clearWallAttachmentSelection();
      addStructuralElement(draft);
    },
    [addStructuralElement, clearWallAttachmentSelection, clearWallSelection, clearZoneSelection],
  );

  const handleSelectStructuralElement = useCallback(
    (elementId: string | null) => {
      if (elementId) {
        clearZoneSelection();
        clearWallSelection();
        clearWallAttachmentSelection();
      }
      selectStructuralElement(elementId);
    },
    [clearWallAttachmentSelection, clearWallSelection, clearZoneSelection, selectStructuralElement],
  );

  const handleCreateZone = useCallback(
    (draft: Parameters<typeof addZone>[0]) => {
      clearWallSelection();
      clearWallAttachmentSelection();
      addZone(draft);
    },
    [addZone, clearWallAttachmentSelection, clearWallSelection],
  );

  const handleSelectZone = useCallback(
    (zoneId: string | null) => {
      if (zoneId) {
        clearWallSelection();
        clearWallAttachmentSelection();
      }
      selectZone(zoneId);
    },
    [clearWallAttachmentSelection, clearWallSelection, selectZone],
  );

  const handleCreateLandscapeElement = useCallback(
    (draft: Parameters<typeof addLandscapeElement>[0]) => {
      clearWallSelection();
      clearWallAttachmentSelection();
      addLandscapeElement(draft);
    },
    [addLandscapeElement, clearWallAttachmentSelection, clearWallSelection],
  );

  const handleSelectLandscapeElement = useCallback(
    (elementId: string | null) => {
      if (elementId) {
        clearZoneSelection();
        clearWallSelection();
        clearWallAttachmentSelection();
      }
      selectLandscapeElement(elementId);
    },
    [clearWallAttachmentSelection, clearWallSelection, clearZoneSelection, selectLandscapeElement],
  );

  const handleSelectWallAttachment = useCallback(
    (attachmentId: string) => {
      clearWallSelection();
      clearStructuralElementSelection();
      clearZoneSelection();
      clearLandscapeSelection();
      selectWallAttachment(attachmentId);
    },
    [
      clearLandscapeSelection,
      clearStructuralElementSelection,
      clearZoneSelection,
      clearWallSelection,
      selectWallAttachment,
    ],
  );

  const handleWallAttachmentMoveStart = useCallback(() => {
    historyApi.beginTransaction(documentSnapshotRef.current!);
  }, [historyApi]);

  const handleWallAttachmentMoveEnd = useCallback(
    (outcome: WallAttachmentEditOutcome) => {
      if (outcome === "complete") {
        historyApi.commitTransaction(
          "wallAttachment.move",
          documentSnapshotRef.current!,
        );
      } else {
        historyApi.discardTransaction();
      }
    },
    [historyApi],
  );

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
      cancelWallDrawing();
      cancelWallEditSession();
      clearOperationalSnapGuides();
      historyApi.discardTransaction();
    }
    previousEspacioIdRef.current = nextId;
  }, [
    cancelDragging,
    cancelResize,
    cancelWallEditSession,
    cancelWallDrawing,
    clearOperationalSnapGuides,
    historyApi,
    selectedEspacio?.id,
  ]);

  useEffect(() => {
    if (document.navigation.phase !== "operacion") {
      clearOperationalSnapGuides();
    }
  }, [clearOperationalSnapGuides, document.navigation.phase]);

  const openAddDialog = useCallback(() => {
    setAddDialogOpen(true);
  }, []);

  const handleUndo = useCallback(() => {
    cancelDragging();
    cancelResize();
    cancelWallDrawing();
    cancelWallEditSession();
    clearOperationalSnapGuides();
    historyApi.discardTransaction();
    historyApi.flushScheduledCommits(getDocumentSnapshot);

    const nextDocument = historyApi.undo(documentSnapshotRef.current!);
    if (!nextDocument) return;

    restoreDocumentSnapshot(nextDocument);
  }, [
    cancelDragging,
    cancelResize,
    cancelWallEditSession,
    cancelWallDrawing,
    clearOperationalSnapGuides,
    getDocumentSnapshot,
    historyApi,
    restoreDocumentSnapshot,
  ]);

  const handleRedo = useCallback(() => {
    cancelDragging();
    cancelResize();
    cancelWallDrawing();
    cancelWallEditSession();
    clearOperationalSnapGuides();
    historyApi.discardTransaction();
    historyApi.flushScheduledCommits(getDocumentSnapshot);

    const nextDocument = historyApi.redo(documentSnapshotRef.current!);
    if (!nextDocument) return;

    restoreDocumentSnapshot(nextDocument);
  }, [
    cancelDragging,
    cancelResize,
    cancelWallEditSession,
    cancelWallDrawing,
    clearOperationalSnapGuides,
    getDocumentSnapshot,
    historyApi,
    restoreDocumentSnapshot,
  ]);

  const canUndoHistory = useMemo(
    () => historyApi.canUndo(),
    [historyApi, historyRevision],
  );
  const canRedoHistory = useMemo(
    () => historyApi.canRedo(),
    [historyApi, historyRevision],
  );

  const selectedElementCount = selectedEspacio
    ? (elementCountByEspacioId[selectedEspacio.id] ?? 0)
    : 0;

  const inspectorOpen = hasSalaEditorInspectorSelection({
    phase: document.navigation.phase,
    espacio: selectedEspacio,
    selectedWall: selectedWall ?? null,
    selectedOperationalElementInstance: selectedOperationalElementInstance ?? null,
  });

  const selectedSurfaceObject = useMemo(
    () =>
      selectedSurfaceObjectId
        ? surfaceObjectsInEspacio.find((surface) => surface.id === selectedSurfaceObjectId) ?? null
        : null,
    [selectedSurfaceObjectId, surfaceObjectsInEspacio],
  );

  const selectedWallAttachment = useMemo(
    () =>
      selectedWallAttachmentId
        ? wallAttachmentsInEspacio.find(
            (attachment) => attachment.id === selectedWallAttachmentId,
          ) ?? null
        : null,
    [selectedWallAttachmentId, wallAttachmentsInEspacio],
  );

  const contextActionTarget = useMemo((): SalaEditorContextActionTarget | null => {
    const phase = document.navigation.phase;

    if (phase === "estructura" && selectedStructuralElement) {
      const labels = {
        squareColumn: "Columna cuadrada",
        roundColumn: "Columna circular",
        divider: "Separador fijo",
      } as const;
      const icons = {
        squareColumn: "■",
        roundColumn: "●",
        divider: "▭",
      } as const;
      const kind = selectedStructuralElement.kind;
      return {
        kind: "structural",
        label: kind in labels ? labels[kind as keyof typeof labels] : "Elemento fijo",
        icon: kind in icons ? icons[kind as keyof typeof icons] : "▣",
        onDelete: () => removeStructuralElement(selectedStructuralElement.id),
      };
    }

    if (phase === "terreno" && selectedSurfaceObject) {
      return {
        kind: "surface",
        label: "Superficie",
        icon: "▧",
        onDelete: () => removeSurfaceObject(selectedSurfaceObject.id),
      };
    }

    if (phase === "zonas" && selectedZone) {
      return {
        kind: "zone",
        label: selectedZone.name,
        icon: "◫",
        onDelete: () => removeZone(selectedZone.id),
      };
    }

    if (phase === "paisajismo" && selectedLandscapeElement) {
      const item = getLandscapeToolboxItem(selectedLandscapeElement.kind);
      return {
        kind: "landscape",
        label: item?.label ?? "Ambiente",
        icon: item?.icon ?? "♧",
        onDelete: () => removeLandscapeElement(selectedLandscapeElement.id),
      };
    }

    if (phase === "estructura" && selectedWallAttachment) {
      const isGlass = selectedWallAttachment.kind === "glass";
      return {
        kind: isGlass ? "glass" : "door",
        label: isGlass ? "Cristal" : "Puerta",
        icon: isGlass ? "▥" : "▭",
        onDelete: () => removeWallAttachment(selectedWallAttachment.id),
      };
    }

    if (phase === "estructura" && selectedWall) {
      return {
        kind: "wall",
        label: "Muro",
        icon: "━",
        onDelete: () => handleDeleteWall(selectedWall.id),
      };
    }

    if (phase === "operacion" && selectedOperationalElementInstance) {
      const catalogItem = getOperationalElementCatalogItem(
        selectedOperationalElementInstance.elementType,
      );
      return {
        kind: "operational",
        label: catalogItem?.label ?? "Elemento operativo",
        icon: catalogItem?.icon ?? "◉",
        onDelete: () => removeOperationalElement(selectedOperationalElementInstance.id),
      };
    }

    return null;
  }, [
    document.navigation.phase,
    handleDeleteWall,
    removeOperationalElement,
    removeLandscapeElement,
    removeZone,
    removeSurfaceObject,
    removeStructuralElement,
    removeWallAttachment,
    selectedOperationalElementInstance,
    selectedLandscapeElement,
    selectedZone,
    selectedSurfaceObject,
    selectedStructuralElement,
    selectedWall,
    selectedWallAttachment,
  ]);

  return (
    <>
      <SalaEditorShell
        navigation={document.navigation}
        disabledPhases={disabledPhases}
        espaciosCount={document.espacios.length}
        inspectorOpen={inspectorOpen}
        onPhaseChange={setPhase}
        legacyEditorHref={legacyEditorHref}
        canUndo={canUndoHistory}
        canRedo={canRedoHistory}
        onUndo={handleUndo}
        onRedo={handleRedo}
        contextActionTarget={contextActionTarget}
        onPublishMap={
          draftPersistenceEnabled && !legacyHydratedReadOnly
            ? () => {
                void handlePublishMap();
              }
            : undefined
        }
        publishMapBusy={publishMapBusy}
        leftPanel={
          <SalaEditorLeftPanel
            phase={document.navigation.phase}
            espacios={document.espacios}
            selectedEspacioId={document.navigation.selectedEspacioId}
            elementCountByEspacioId={elementCountByEspacioId}
            activeStructuralToolKind={activeStructuralToolKind}
            activeZoneType={activeZoneType}
            activeLandscapeKind={activeLandscapeKind}
            activeSurfaceMaterial={activeSurfaceMaterial}
            activeOperationalElementType={activeOperationalElementType}
            activeOperationalVisualVariant={activeOperationalVisualVariant}
            onSelectEspacio={handleSelectEspacio}
            onRequestAddEspacio={openAddDialog}
            onSelectStructuralTool={selectTool}
            onSelectZoneType={selectZoneType}
            onSelectLandscapeKind={selectLandscapeKind}
            onSelectSurfaceMaterial={selectSurfaceMaterial}
            onSelectOperationalElement={selectOperationalElement}
            onUpdateEspacio={updateEspacio}
            onUpdateEspacioBase={updateEspacioBase}
          />
        }
        workspace={
          <SalaEditorWorkspaceCanvas
            restaurantId={document.restaurantId}
            phase={document.navigation.phase}
            espacio={selectedEspacio}
            hasEspacios={document.espacios.length > 0}
            activeStructuralToolboxItem={activeStructuralToolboxItem}
            activeSurfaceMaterial={activeSurfaceMaterial}
            surfaceObjects={surfaceObjectsInEspacio}
            selectedSurfaceObjectId={selectedSurfaceObjectId}
            onSurfaceObjectCreate={handleCreateSurfaceObject}
            onSurfaceObjectSelect={handleSelectSurfaceObject}
            onSurfaceObjectClearSelection={clearSurfaceSelection}
            onSurfaceObjectUpdate={updateSurfaceObject}
            onSurfaceObjectMoveStart={handleSurfaceMoveStart}
            onSurfaceObjectMoveEnd={handleSurfaceMoveEnd}
            onSurfaceObjectResizeStart={handleSurfaceResizeStart}
            onSurfaceObjectResizeEnd={handleSurfaceResizeEnd}
            activeZoneType={activeZoneType}
            zones={zonesInEspacio}
            selectedZoneId={selectedZoneId}
            onZoneCreate={handleCreateZone}
            onZoneSelect={handleSelectZone}
            onZoneClearSelection={clearZoneSelection}
            onZoneUpdate={updateZone}
            onZoneMoveStart={handleZoneMoveStart}
            onZoneMoveEnd={handleZoneMoveEnd}
            onZoneResizeStart={handleZoneResizeStart}
            onZoneResizeEnd={handleZoneResizeEnd}
            structuralElements={structuralElementsInEspacio}
            selectedStructuralElementId={selectedStructuralElementId}
            onStructuralElementCreate={handleCreateStructuralElement}
            onStructuralElementSelect={handleSelectStructuralElement}
            onStructuralElementClearSelection={clearStructuralElementSelection}
            onStructuralElementUpdate={updateStructuralElement}
            onStructuralElementMoveStart={handleStructuralElementMoveStart}
            onStructuralElementMoveEnd={handleStructuralElementMoveEnd}
            onStructuralElementResizeStart={handleStructuralElementResizeStart}
            onStructuralElementResizeEnd={handleStructuralElementResizeEnd}
            activeLandscapeKind={activeLandscapeKind}
            landscapeElements={landscapeElementsInEspacio}
            selectedLandscapeElementId={selectedLandscapeElementId}
            onLandscapeElementCreate={handleCreateLandscapeElement}
            onLandscapeElementSelect={handleSelectLandscapeElement}
            onLandscapeElementClearSelection={clearLandscapeSelection}
            onLandscapeElementUpdate={updateLandscapeElement}
            onLandscapeElementMoveStart={handleLandscapeElementMoveStart}
            onLandscapeElementMoveEnd={handleLandscapeElementMoveEnd}
            onLandscapeElementResizeStart={handleLandscapeElementResizeStart}
            onLandscapeElementResizeEnd={handleLandscapeElementResizeEnd}
            walls={wallsInEspacio}
            wallAttachments={wallAttachmentsInEspacio}
            wallDraft={wallDraft}
            selectedWallId={selectedWallId}
            selectedWallAttachmentId={selectedWallAttachmentId}
            onWallPointerDown={wallDrawingEnabled ? handleStructuralWallPointerDown : undefined}
            onWallPointerMove={wallDrawingEnabled ? handleWallPointerMove : undefined}
            onWallPointerUp={wallDrawingEnabled ? handleWallPointerUp : undefined}
            onWallPointerCancel={wallDrawingEnabled ? handleWallPointerCancel : undefined}
            onWallAttachmentPlace={handlePlaceWallAttachment}
            onWallAttachmentSelect={handleSelectWallAttachment}
            onWallAttachmentClearSelection={clearWallAttachmentSelection}
            onWallAttachmentUpdate={updateWallAttachment}
            onWallAttachmentMoveStart={handleWallAttachmentMoveStart}
            onWallAttachmentMoveEnd={handleWallAttachmentMoveEnd}
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
