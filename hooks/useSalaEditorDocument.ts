"use client";

import { useCallback, useMemo, useState } from "react";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { createEmptySalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { normalizeSalaEditorDocument } from "@/lib/sala-editor/normalize/normalize-sala-editor-document";
import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEspacio, SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import type { SalaEspacioBasePatch } from "@/lib/sala-editor/base/espacio-base-editor";
import { applySalaEspacioBasePatch } from "@/lib/sala-editor/base/espacio-base-editor";
import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type {
  SalaStructuralElement,
  SalaStructuralElementDraft,
} from "@/lib/sala-editor/types/elementos-estructurales";
import { createSalaStructuralElement } from "@/lib/sala-editor/types/elementos-estructurales";
import type { SalaEditorActiveTool } from "@/lib/sala-editor/types/editor-tool";
import {
  createStructuralActiveTool,
  DEFAULT_STRUCTURAL_ACTIVE_TOOL_KIND,
  isToolSelected,
} from "@/lib/sala-editor/types/editor-tool";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import { createSalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { SalaWallAttachment } from "@/lib/sala-editor/types/wall-attachment";
import {
  createSalaWallAttachment,
  removeWallAttachmentsForWall,
} from "@/lib/sala-editor/types/wall-attachment";
import {
  getStructuralToolboxItem,
} from "@/lib/sala-editor/catalog/structural-toolbox";
import type { ActiveOperationalElementSelection } from "@/lib/sala-editor/ose/active-operational-element";
import type { OperationalElementType, OperationalElementPosition } from "@/lib/sala-editor/ose/operational-element";
import type {
  SurfaceMaterialKind,
  SurfaceObject,
  SurfaceObjectDraft,
} from "@/lib/sala-editor/surface/surface-object";
import { createSurfaceObject } from "@/lib/sala-editor/surface/surface-object";
import type {
  LandscapeElement,
  LandscapeElementDraft,
  LandscapeElementKind,
} from "@/lib/sala-editor/landscape/landscape-element";
import { createLandscapeElement } from "@/lib/sala-editor/landscape/landscape-element";
import {
  createActiveOperationalElement,
  DEFAULT_ACTIVE_OPERATIONAL_ELEMENT_TYPE,
  isOperationalElementTypeSelected,
} from "@/lib/sala-editor/ose/active-operational-element";
import { getOperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { buildOperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { nextOperationalElementInstanceName } from "@/lib/sala-editor/ose/operational-element-naming";
import { withOperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import type { OperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import {
  getDefaultOperationalInstanceCanvasSize,
  withOperationalInstanceCanvasSize,
  type OperationalInstanceCanvasSize,
} from "@/lib/sala-editor/canvas/operational-instance-layout";
import {
  getDisabledSalaEditorPhases,
  navigateSalaEditorPhase,
  selectSalaEspacioInNavigation,
} from "@/lib/sala-editor/navigation/editor-phase-routing";
import type { SalaEditorHistoryApi } from "@/hooks/useSalaEditorHistory";

export type UseSalaEditorDocumentOptions = {
  restaurantId: string;
  initialEspacios?: SalaEspacio[];
  historyApi?: SalaEditorHistoryApi | null;
  getDocumentSnapshot?: () => SalaEditorDocument;
};

/**
 * Estado local del documento del editor de sala.
 * La persistencia de borrador vive fuera del hook para no mezclar UI/OSE con Firestore.
 */
export function useSalaEditorDocument({
  restaurantId,
  initialEspacios = [],
  historyApi = null,
  getDocumentSnapshot,
}: UseSalaEditorDocumentOptions) {
  const [document, setDocument] = useState<SalaEditorDocument>(() =>
    normalizeSalaEditorDocument({
      ...createEmptySalaEditorDocument(restaurantId),
      espacios: initialEspacios,
      navigation: {
        phase: "espacios",
        selectedEspacioId: initialEspacios[0]?.id ?? null,
      },
    }),
  );

  const [activeTool, setActiveTool] = useState<SalaEditorActiveTool>(null);
  const [activeOperationalElement, setActiveOperationalElement] =
    useState<ActiveOperationalElementSelection>(null);
  const [activeSurfaceMaterial, setActiveSurfaceMaterial] =
    useState<SurfaceMaterialKind | null>(null);
  const [activeLandscapeKind, setActiveLandscapeKind] =
    useState<LandscapeElementKind | null>(null);
  const [selectedSurfaceObjectId, setSelectedSurfaceObjectId] =
    useState<string | null>(null);
  const [selectedLandscapeElementId, setSelectedLandscapeElementId] =
    useState<string | null>(null);
  const [selectedStructuralElementId, setSelectedStructuralElementId] =
    useState<string | null>(null);
  const [selectedOperationalElementInstanceId, setSelectedOperationalElementInstanceId] =
    useState<string | null>(null);
  const [selectedWallAttachmentId, setSelectedWallAttachmentId] =
    useState<string | null>(null);

  const replaceDocument = useCallback((nextDocument: SalaEditorDocument) => {
    if (nextDocument.restaurantId !== restaurantId) return;
    setDocument(normalizeSalaEditorDocument(nextDocument));
    setActiveTool(null);
    setActiveOperationalElement(null);
    setActiveSurfaceMaterial(null);
    setActiveLandscapeKind(null);
    setSelectedSurfaceObjectId(null);
    setSelectedLandscapeElementId(null);
    setSelectedStructuralElementId(null);
    setSelectedOperationalElementInstanceId(null);
    setSelectedWallAttachmentId(null);
    historyApi?.reset();
  }, [historyApi, restaurantId]);

  const restoreDocumentSnapshot = useCallback((nextDocument: SalaEditorDocument) => {
    if (nextDocument.restaurantId !== restaurantId) return;
    setDocument(normalizeSalaEditorDocument(nextDocument));
    setActiveTool(null);
    setActiveOperationalElement(null);
    setActiveSurfaceMaterial(null);
    setActiveLandscapeKind(null);
    setSelectedSurfaceObjectId(null);
    setSelectedLandscapeElementId(null);
    setSelectedStructuralElementId(null);
    setSelectedOperationalElementInstanceId(null);
    setSelectedWallAttachmentId(null);
  }, [restaurantId]);

  const disabledPhases = useMemo(
    () => getDisabledSalaEditorPhases(document.espacios, document.navigation),
    [document.espacios, document.navigation],
  );

  const selectedEspacio = useMemo(
    () =>
      document.espacios.find(
        (e) => e.id === document.navigation.selectedEspacioId,
      ) ?? null,
    [document.espacios, document.navigation.selectedEspacioId],
  );

  const elementCountByEspacioId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const espacio of document.espacios) {
      const walls = document.walls.filter((w) => w.espacioId === espacio.id).length;
      const structural = document.structuralElements.filter(
        (el) => el.espacioId === espacio.id,
      ).length;
      const oseOperational = document.operationalElementInstances.filter(
        (el) => el.spaceId === espacio.id,
      ).length;
      const operational = document.operationalElements.filter(
        (el) => el.espacioId === espacio.id,
      ).length;
      const surfaces = document.surfaceObjects.filter(
        (surface) => surface.espacioId === espacio.id,
      ).length;
      const landscape = document.landscapeElements.filter(
        (element) => element.espacioId === espacio.id,
      ).length;
      counts[espacio.id] =
        walls + structural + landscape + oseOperational + operational + surfaces;
    }
    return counts;
  }, [
    document.espacios,
    document.walls,
    document.structuralElements,
    document.operationalElements,
    document.operationalElementInstances,
    document.surfaceObjects,
    document.landscapeElements,
  ]);

  const activeStructuralToolKind = useMemo((): SalaStructuralElementKind | null => {
    if (activeTool?.layer !== "estructura") return null;
    return activeTool.kind;
  }, [activeTool]);

  const activeStructuralToolboxItem = useMemo(() => {
    if (!activeStructuralToolKind) return null;
    return getStructuralToolboxItem(activeStructuralToolKind) ?? null;
  }, [activeStructuralToolKind]);

  const activeOperationalCatalogItem = useMemo(() => {
    if (activeOperationalElement?.layer !== "operacion") return null;
    return getOperationalElementCatalogItem(activeOperationalElement.type) ?? null;
  }, [activeOperationalElement]);

  const activeOperationalElementType = useMemo((): OperationalElementType | null => {
    if (activeOperationalElement?.layer !== "operacion") return null;
    return activeOperationalElement.type;
  }, [activeOperationalElement]);

  const activeOperationalVisualVariant = useMemo(() => {
    if (activeOperationalElement?.layer !== "operacion") return null;
    return activeOperationalElement.visualVariant ?? null;
  }, [activeOperationalElement]);

  const selectSurfaceMaterial = useCallback((material: SurfaceMaterialKind) => {
    setActiveSurfaceMaterial(material);
    setActiveLandscapeKind(null);
    setSelectedSurfaceObjectId(null);
    setSelectedLandscapeElementId(null);
    setSelectedStructuralElementId(null);
  }, []);

  const selectLandscapeKind = useCallback((kind: LandscapeElementKind) => {
    setActiveLandscapeKind(kind);
    setActiveSurfaceMaterial(null);
    setSelectedLandscapeElementId(null);
    setSelectedSurfaceObjectId(null);
    setSelectedStructuralElementId(null);
    setSelectedOperationalElementInstanceId(null);
    setSelectedWallAttachmentId(null);
  }, []);

  const surfaceObjectsInEspacio = useMemo(
    () =>
      selectedEspacio
        ? document.surfaceObjects.filter(
            (surface) => surface.espacioId === selectedEspacio.id,
          )
        : [],
    [document.surfaceObjects, selectedEspacio],
  );

  const addSurfaceObject = useCallback((draft: SurfaceObjectDraft): SurfaceObject => {
    const surface = createSurfaceObject(draft);
    let previousDocument: SalaEditorDocument | null = null;
    let nextDocument: SalaEditorDocument | null = null;

    setDocument((prev) => {
      previousDocument = prev;
      nextDocument = {
        ...prev,
        surfaceObjects: [...prev.surfaceObjects, surface],
        updatedAt: Date.now(),
      };
      return nextDocument;
    });

    if (previousDocument && nextDocument) {
      historyApi?.recordCommit("surface.create", previousDocument, nextDocument);
    }

    setSelectedSurfaceObjectId(surface.id);
    return surface;
  }, [historyApi]);

  const landscapeElementsInEspacio = useMemo(
    () =>
      selectedEspacio
        ? document.landscapeElements.filter(
            (element) => element.espacioId === selectedEspacio.id,
          )
        : [],
    [document.landscapeElements, selectedEspacio],
  );

  const selectedLandscapeElement = useMemo(
    () =>
      selectedLandscapeElementId
        ? document.landscapeElements.find(
            (element) => element.id === selectedLandscapeElementId,
          ) ?? null
        : null,
    [document.landscapeElements, selectedLandscapeElementId],
  );

  const addLandscapeElement = useCallback((draft: LandscapeElementDraft): LandscapeElement => {
    const element = createLandscapeElement(draft);
    let previousDocument: SalaEditorDocument | null = null;
    let nextDocument: SalaEditorDocument | null = null;

    setDocument((prev) => {
      previousDocument = prev;
      nextDocument = {
        ...prev,
        landscapeElements: [...prev.landscapeElements, element],
        updatedAt: Date.now(),
      };
      return nextDocument;
    });

    if (previousDocument && nextDocument) {
      historyApi?.recordCommit("landscape.create", previousDocument, nextDocument);
    }

    setSelectedLandscapeElementId(element.id);
    return element;
  }, [historyApi]);

  const updateLandscapeElement = useCallback(
    (elementId: string, patch: Partial<Omit<LandscapeElement, "id">>) => {
      setDocument((prev) => ({
        ...prev,
        landscapeElements: prev.landscapeElements.map((element) =>
          element.id === elementId
            ? { ...element, ...patch, updatedAt: Date.now() }
            : element,
        ),
        updatedAt: Date.now(),
      }));
    },
    [],
  );

  const removeLandscapeElement = useCallback((elementId: string) => {
    let previousDocument: SalaEditorDocument | null = null;
    let nextDocument: SalaEditorDocument | null = null;

    setDocument((prev) => {
      previousDocument = prev;
      nextDocument = {
        ...prev,
        landscapeElements: prev.landscapeElements.filter(
          (element) => element.id !== elementId,
        ),
        updatedAt: Date.now(),
      };
      return nextDocument;
    });

    if (previousDocument && nextDocument) {
      historyApi?.recordCommit("landscape.delete", previousDocument, nextDocument);
    }
    setSelectedLandscapeElementId((current) =>
      current === elementId ? null : current,
    );
  }, [historyApi]);

  const selectLandscapeElement = useCallback((elementId: string | null) => {
    setSelectedLandscapeElementId(elementId);
    if (elementId) {
      setSelectedSurfaceObjectId(null);
      setSelectedStructuralElementId(null);
      setSelectedOperationalElementInstanceId(null);
      setSelectedWallAttachmentId(null);
    }
  }, []);

  const clearLandscapeSelection = useCallback(() => {
    setSelectedLandscapeElementId(null);
  }, []);

  const updateSurfaceObject = useCallback(
    (surfaceId: string, patch: Partial<Omit<SurfaceObject, "id">>) => {
      setDocument((prev) => ({
        ...prev,
        surfaceObjects: prev.surfaceObjects.map((surface) =>
          surface.id === surfaceId ? { ...surface, ...patch } : surface,
        ),
        updatedAt: Date.now(),
      }));
    },
    [],
  );

  const removeSurfaceObject = useCallback((surfaceId: string) => {
    let previousDocument: SalaEditorDocument | null = null;
    let nextDocument: SalaEditorDocument | null = null;

    setDocument((prev) => {
      previousDocument = prev;
      nextDocument = {
        ...prev,
        surfaceObjects: prev.surfaceObjects.filter(
          (surface) => surface.id !== surfaceId,
        ),
        updatedAt: Date.now(),
      };
      return nextDocument;
    });

    if (previousDocument && nextDocument) {
      historyApi?.recordCommit("surface.delete", previousDocument, nextDocument);
    }
    setSelectedSurfaceObjectId((current) => (current === surfaceId ? null : current));
  }, [historyApi]);

  const selectSurfaceObject = useCallback((surfaceId: string | null) => {
    setSelectedSurfaceObjectId(surfaceId);
    if (surfaceId) {
      setSelectedLandscapeElementId(null);
      setSelectedStructuralElementId(null);
      setSelectedOperationalElementInstanceId(null);
    }
  }, []);

  const clearSurfaceSelection = useCallback(() => {
    setSelectedSurfaceObjectId(null);
  }, []);

  const structuralElementsInEspacio = useMemo(
    () =>
      selectedEspacio
        ? document.structuralElements.filter(
            (element) => element.espacioId === selectedEspacio.id,
          )
        : [],
    [document.structuralElements, selectedEspacio],
  );

  const selectedStructuralElement = useMemo(
    () =>
      selectedStructuralElementId
        ? structuralElementsInEspacio.find(
            (element) => element.id === selectedStructuralElementId,
          ) ?? null
        : null,
    [selectedStructuralElementId, structuralElementsInEspacio],
  );

  const addStructuralElement = useCallback(
    (draft: SalaStructuralElementDraft): SalaStructuralElement => {
      const element = createSalaStructuralElement(draft);
      let previousDocument: SalaEditorDocument | null = null;
      let nextDocument: SalaEditorDocument | null = null;

      setDocument((prev) => {
        previousDocument = prev;
        nextDocument = {
          ...prev,
          structuralElements: [...prev.structuralElements, element],
          updatedAt: Date.now(),
        };
        return nextDocument;
      });

      if (previousDocument && nextDocument) {
        historyApi?.recordCommit("structural.create", previousDocument, nextDocument);
      }

      setSelectedStructuralElementId(element.id);
      setSelectedSurfaceObjectId(null);
      setSelectedLandscapeElementId(null);
      setSelectedOperationalElementInstanceId(null);
      setSelectedWallAttachmentId(null);
      return element;
    },
    [historyApi],
  );

  const updateStructuralElement = useCallback(
    (
      elementId: string,
      patch: Partial<Omit<SalaStructuralElement, "id">>,
    ) => {
      setDocument((prev) => ({
        ...prev,
        structuralElements: prev.structuralElements.map((element) =>
          element.id === elementId
            ? { ...element, ...patch, updatedAt: Date.now() }
            : element,
        ),
        updatedAt: Date.now(),
      }));
    },
    [],
  );

  const removeStructuralElement = useCallback(
    (elementId: string) => {
      let previousDocument: SalaEditorDocument | null = null;
      let nextDocument: SalaEditorDocument | null = null;

      setDocument((prev) => {
        if (!prev.structuralElements.some((element) => element.id === elementId)) {
          return prev;
        }
        previousDocument = prev;
        nextDocument = {
          ...prev,
          structuralElements: prev.structuralElements.filter(
            (element) => element.id !== elementId,
          ),
          updatedAt: Date.now(),
        };
        return nextDocument;
      });

      if (previousDocument && nextDocument) {
        historyApi?.recordCommit("structural.delete", previousDocument, nextDocument);
      }

      setSelectedStructuralElementId((current) =>
        current === elementId ? null : current,
      );
    },
    [historyApi],
  );

  const selectStructuralElement = useCallback((elementId: string | null) => {
    setSelectedStructuralElementId(elementId);
    if (elementId) {
      setSelectedSurfaceObjectId(null);
      setSelectedLandscapeElementId(null);
      setSelectedOperationalElementInstanceId(null);
      setSelectedWallAttachmentId(null);
    }
  }, []);

  const clearStructuralElementSelection = useCallback(() => {
    setSelectedStructuralElementId(null);
  }, []);

  const operationalElementInstancesInEspacio = useMemo(
    () =>
      selectedEspacio
        ? document.operationalElementInstances.filter(
            (instance) => instance.spaceId === selectedEspacio.id,
          )
        : [],
    [document.operationalElementInstances, selectedEspacio],
  );

  const selectedOperationalElementInstance = useMemo(
    () =>
      operationalElementInstancesInEspacio.find(
        (instance) => instance.id === selectedOperationalElementInstanceId,
      ) ?? null,
    [
      operationalElementInstancesInEspacio,
      selectedOperationalElementInstanceId,
    ],
  );

  const clearOperationalElement = useCallback(() => {
    setActiveOperationalElement(null);
  }, []);

  const clearOperationalElementInstance = useCallback(() => {
    setSelectedOperationalElementInstanceId(null);
  }, []);

  const selectOperationalElementInstance = useCallback((instanceId: string | null) => {
    setSelectedOperationalElementInstanceId(instanceId);
    if (instanceId) {
      setSelectedSurfaceObjectId(null);
      setSelectedLandscapeElementId(null);
      setSelectedStructuralElementId(null);
    }
  }, []);

  const selectOperationalElement = useCallback(
    (type: OperationalElementType, visualVariant?: OperationalVisualVariant) => {
      setActiveOperationalElement(createActiveOperationalElement(type, visualVariant));
      setSelectedOperationalElementInstanceId(null);
      setSelectedLandscapeElementId(null);
      setSelectedStructuralElementId(null);
    },
    [],
  );

  const addOperationalElement = useCallback((instance: OperationalElementInstance) => {
    let previousDocument: SalaEditorDocument | null = null;
    let nextDocument: SalaEditorDocument | null = null;

    setDocument((prev) => {
      previousDocument = prev;
      nextDocument = {
        ...prev,
        operationalElementInstances: [...prev.operationalElementInstances, instance],
        updatedAt: Date.now(),
      };
      return nextDocument;
    });

    if (previousDocument && nextDocument) {
      historyApi?.recordCommit("operational.create", previousDocument, nextDocument);
    }
    setSelectedOperationalElementInstanceId(instance.id);
    setSelectedSurfaceObjectId(null);
    setSelectedLandscapeElementId(null);
    setSelectedStructuralElementId(null);
  }, [historyApi]);

  const removeOperationalElement = useCallback((instanceId: string) => {
    let previousDocument: SalaEditorDocument | null = null;
    let nextDocument: SalaEditorDocument | null = null;

    setDocument((prev) => {
      previousDocument = prev;
      nextDocument = {
        ...prev,
        operationalElementInstances: prev.operationalElementInstances.filter(
          (instance) => instance.id !== instanceId,
        ),
        updatedAt: Date.now(),
      };
      return nextDocument;
    });

    if (previousDocument && nextDocument) {
      historyApi?.recordCommit("operational.delete", previousDocument, nextDocument);
    }
    setSelectedOperationalElementInstanceId((current) =>
      current === instanceId ? null : current,
    );
  }, [historyApi]);

  const updateOperationalElement = useCallback(
    (
      instanceId: string,
      patch: Partial<Omit<OperationalElementInstance, "id">>,
    ) => {
      setDocument((prev) => ({
        ...prev,
        operationalElementInstances: prev.operationalElementInstances.map(
          (instance) =>
            instance.id === instanceId ? { ...instance, ...patch } : instance,
        ),
        updatedAt: Date.now(),
      }));
    },
    [],
  );

  const duplicateOperationalElement = useCallback((instanceId: string) => {
    let duplicateId: string | null = null;
    let previousDocument: SalaEditorDocument | null = null;
    let nextDocument: SalaEditorDocument | null = null;

    setDocument((prev) => {
      const source = prev.operationalElementInstances.find(
        (instance) => instance.id === instanceId,
      );
      if (!source) return prev;

      const duplicate = buildOperationalElementInstance({
        spaceId: source.spaceId,
        zoneId: source.zoneId,
        elementType: source.elementType,
        name: nextOperationalElementInstanceName(
          prev.operationalElementInstances,
          source.spaceId,
          source.elementType,
        ),
        position: {
          x: source.position.x + 24,
          y: source.position.y + 24,
        },
        rotation: source.rotation,
        capacity: source.capacity,
        visible: source.visible,
        enabled: source.enabled,
        metadata: { ...source.metadata },
        state: source.state,
      });

      duplicateId = duplicate.id;

      previousDocument = prev;
      nextDocument = {
        ...prev,
        operationalElementInstances: [
          ...prev.operationalElementInstances,
          duplicate,
        ],
        updatedAt: Date.now(),
      };
      return nextDocument;
    });

    if (previousDocument && nextDocument) {
      historyApi?.recordCommit("operational.duplicate", previousDocument, nextDocument);
    }

    if (duplicateId) {
      setSelectedOperationalElementInstanceId(duplicateId);
    }
  }, [historyApi]);

  const resizeOperationalElementInstance = useCallback(
    (
      instanceId: string,
      patch: {
        size: OperationalInstanceCanvasSize;
        position: OperationalElementPosition;
      },
    ) => {
      setDocument((prev) => ({
        ...prev,
        operationalElementInstances: prev.operationalElementInstances.map(
          (instance) =>
            instance.id === instanceId
              ? {
                  ...instance,
                  position: patch.position,
                  metadata: withOperationalInstanceCanvasSize(
                    instance.metadata,
                    patch.size,
                  ),
                }
              : instance,
        ),
        updatedAt: Date.now(),
      }));
    },
    [],
  );

  const placeOperationalElementAt = useCallback(
    (position: OperationalElementPosition) => {
      if (!selectedEspacio || !activeOperationalElementType) return;

      const catalogItem = getOperationalElementCatalogItem(
        activeOperationalElementType,
      );
      if (!catalogItem) return;

      const name = nextOperationalElementInstanceName(
        document.operationalElementInstances,
        selectedEspacio.id,
        activeOperationalElementType,
      );

      const defaultSize = getDefaultOperationalInstanceCanvasSize(
        activeOperationalElementType,
      );

      let metadata = withOperationalInstanceCanvasSize({}, defaultSize);
      if (activeOperationalElement?.visualVariant) {
        metadata = withOperationalVisualVariant(
          metadata,
          activeOperationalElement.visualVariant,
        );
      }

      const instance = buildOperationalElementInstance({
        spaceId: selectedEspacio.id,
        elementType: activeOperationalElementType,
        name,
        position,
        capacity: catalogItem.defaultCapacity,
        metadata,
      });

      addOperationalElement(instance);
    },
    [
      activeOperationalElement,
      activeOperationalElementType,
      addOperationalElement,
      document.operationalElementInstances,
      selectedEspacio,
    ],
  );

  const isOperationalElementSelected = useCallback(
    (type: OperationalElementType) =>
      isOperationalElementTypeSelected(activeOperationalElement, type),
    [activeOperationalElement],
  );

  const clearTool = useCallback(() => {
    setActiveTool(null);
  }, []);

  const selectTool = useCallback((kind: SalaStructuralElementKind) => {
    setActiveTool(createStructuralActiveTool(kind));
    setSelectedSurfaceObjectId(null);
    setSelectedOperationalElementInstanceId(null);
  }, []);

  const addWall = useCallback((wall: SalaWallSegment) => {
    let previousDocument: SalaEditorDocument | null = null;
    let nextDocument: SalaEditorDocument | null = null;

    setDocument((prev) => {
      previousDocument = prev;
      nextDocument = {
        ...prev,
        walls: [...prev.walls, wall],
        updatedAt: Date.now(),
      };
      return nextDocument;
    });

    if (previousDocument && nextDocument) {
      historyApi?.recordCommit("wall.create", previousDocument, nextDocument);
    }
  }, [historyApi]);

  const updateWall = useCallback(
    (
      wallId: string,
      patch: Partial<Pick<SalaWallSegment, "x1" | "y1" | "x2" | "y2">>,
    ) => {
      setDocument((prev) => ({
        ...prev,
        walls: prev.walls.map((wall) =>
          wall.id === wallId ? { ...wall, ...patch } : wall,
        ),
        updatedAt: Date.now(),
      }));
    },
    [],
  );

  const removeWall = useCallback((wallId: string) => {
    let previousDocument: SalaEditorDocument | null = null;
    let nextDocument: SalaEditorDocument | null = null;
    let shouldClearAttachmentSelection = false;

    setDocument((prev) => {
      previousDocument = prev;
      const removedAttachmentIds = new Set(
        prev.wallAttachments
          .filter((attachment) => attachment.wallId === wallId)
          .map((attachment) => attachment.id),
      );
      if (
        selectedWallAttachmentId &&
        removedAttachmentIds.has(selectedWallAttachmentId)
      ) {
        shouldClearAttachmentSelection = true;
      }
      nextDocument = {
        ...prev,
        walls: prev.walls.filter((wall) => wall.id !== wallId),
        wallAttachments: removeWallAttachmentsForWall(
          prev.wallAttachments,
          wallId,
        ),
        updatedAt: Date.now(),
      };
      return nextDocument;
    });

    if (previousDocument && nextDocument) {
      historyApi?.recordCommit("wall.delete", previousDocument, nextDocument);
    }
    if (shouldClearAttachmentSelection) {
      setSelectedWallAttachmentId(null);
    }
  }, [historyApi, selectedWallAttachmentId]);

  const addWallAttachment = useCallback(
    (draft: Omit<SalaWallAttachment, "id">): SalaWallAttachment | null => {
      let created: SalaWallAttachment | null = null;
      let previousDocument: SalaEditorDocument | null = null;
      let nextDocument: SalaEditorDocument | null = null;

      setDocument((prev) => {
        if (!prev.walls.some((wall) => wall.id === draft.wallId)) return prev;
        created = createSalaWallAttachment(draft);
        previousDocument = prev;
        nextDocument = {
          ...prev,
          wallAttachments: [...prev.wallAttachments, created],
          updatedAt: Date.now(),
        };
        return nextDocument;
      });

      if (previousDocument && nextDocument) {
        historyApi?.recordCommit(
          "wallAttachment.create",
          previousDocument,
          nextDocument,
        );
      }

      const createdAttachment = created as SalaWallAttachment | null;
      if (createdAttachment) {
        setSelectedWallAttachmentId(createdAttachment.id);
      }

      return createdAttachment;
    },
    [historyApi],
  );

  const selectWallAttachment = useCallback((attachmentId: string) => {
    setSelectedWallAttachmentId(attachmentId);
  }, []);

  const clearWallAttachmentSelection = useCallback(() => {
    setSelectedWallAttachmentId(null);
  }, []);

  const updateWallAttachment = useCallback(
    (
      attachmentId: string,
      patch: Partial<Pick<SalaWallAttachment, "positionRatio" | "offset">>,
    ) => {
      setDocument((prev) => ({
        ...prev,
        wallAttachments: prev.wallAttachments.map((attachment) =>
          attachment.id === attachmentId
            ? { ...attachment, ...patch }
            : attachment,
        ),
        updatedAt: Date.now(),
      }));
    },
    [],
  );

  const removeWallAttachment = useCallback((attachmentId: string) => {
    let previousDocument: SalaEditorDocument | null = null;
    let nextDocument: SalaEditorDocument | null = null;

    setDocument((prev) => {
      if (!prev.wallAttachments.some((attachment) => attachment.id === attachmentId)) {
        return prev;
      }
      previousDocument = prev;
      nextDocument = {
        ...prev,
        wallAttachments: prev.wallAttachments.filter(
          (attachment) => attachment.id !== attachmentId,
        ),
        updatedAt: Date.now(),
      };
      return nextDocument;
    });

    if (previousDocument && nextDocument) {
      historyApi?.recordCommit(
        "wallAttachment.delete",
        previousDocument,
        nextDocument,
      );
    }
    setSelectedWallAttachmentId((current) =>
      current === attachmentId ? null : current,
    );
  }, [historyApi]);

  const duplicateWall = useCallback((wallId: string): string | null => {
    let duplicateId: string | null = null;
    let previousDocument: SalaEditorDocument | null = null;
    let nextDocument: SalaEditorDocument | null = null;

    setDocument((prev) => {
      const source = prev.walls.find((wall) => wall.id === wallId);
      if (!source) return prev;

      const duplicate = createSalaWallSegment({
        espacioId: source.espacioId,
        x1: source.x1 + 24,
        y1: source.y1 + 24,
        x2: source.x2 + 24,
        y2: source.y2 + 24,
      });

      duplicateId = duplicate.id;
      previousDocument = prev;
      nextDocument = {
        ...prev,
        walls: [...prev.walls, duplicate],
        updatedAt: Date.now(),
      };
      return nextDocument;
    });

    if (previousDocument && nextDocument) {
      historyApi?.recordCommit("wall.duplicate", previousDocument, nextDocument);
    }

    return duplicateId;
  }, [historyApi]);

  const isStructuralToolSelected = useCallback(
    (kind: SalaStructuralElementKind) => isToolSelected(activeTool, kind),
    [activeTool],
  );

  const setPhase = useCallback(
    (phase: SalaEditorPhase) => {
      setDocument((prev) => ({
        ...prev,
        navigation: navigateSalaEditorPhase(prev.navigation, phase, prev.espacios),
        updatedAt: Date.now(),
      }));

      if (phase === "estructura") {
        setActiveTool(createStructuralActiveTool(DEFAULT_STRUCTURAL_ACTIVE_TOOL_KIND));
        setActiveOperationalElement(null);
        setActiveSurfaceMaterial(null);
        setActiveLandscapeKind(null);
        setSelectedSurfaceObjectId(null);
        setSelectedLandscapeElementId(null);
        setSelectedOperationalElementInstanceId(null);
      } else if (phase === "terreno") {
        setActiveTool(null);
        setActiveOperationalElement(null);
        setActiveLandscapeKind(null);
        setSelectedLandscapeElementId(null);
        setSelectedStructuralElementId(null);
        setSelectedOperationalElementInstanceId(null);
      } else if (phase === "paisajismo") {
        setActiveTool(null);
        setActiveOperationalElement(null);
        setActiveSurfaceMaterial(null);
        setActiveLandscapeKind("rectangularPlanter");
        setSelectedSurfaceObjectId(null);
        setSelectedStructuralElementId(null);
        setSelectedOperationalElementInstanceId(null);
      } else if (phase === "operacion") {
        setActiveTool(null);
        setActiveSurfaceMaterial(null);
        setActiveLandscapeKind(null);
        setSelectedSurfaceObjectId(null);
        setSelectedLandscapeElementId(null);
        setSelectedStructuralElementId(null);
        setActiveOperationalElement(
          createActiveOperationalElement(DEFAULT_ACTIVE_OPERATIONAL_ELEMENT_TYPE),
        );
        setSelectedOperationalElementInstanceId(null);
      } else {
        setActiveTool(null);
        setActiveOperationalElement(null);
        setActiveSurfaceMaterial(null);
        setActiveLandscapeKind(null);
        setSelectedSurfaceObjectId(null);
        setSelectedLandscapeElementId(null);
        setSelectedStructuralElementId(null);
        setSelectedOperationalElementInstanceId(null);
      }
    },
    [],
  );

  const selectEspacio = useCallback((espacioId: string | null) => {
    setDocument((prev) => ({
      ...prev,
      navigation: selectSalaEspacioInNavigation(prev.navigation, espacioId),
      updatedAt: Date.now(),
    }));
    setSelectedSurfaceObjectId(null);
    setSelectedLandscapeElementId(null);
    setSelectedStructuralElementId(null);
    setSelectedOperationalElementInstanceId(null);
  }, []);

  const replaceEspacios = useCallback((espacios: SalaEspacio[]) => {
    setDocument((prev) => ({
      ...prev,
      espacios,
      updatedAt: Date.now(),
    }));
  }, []);

  const addEspacio = useCallback((espacio: SalaEspacio) => {
    setDocument((prev) => ({
      ...prev,
      espacios: [...prev.espacios, espacio],
      updatedAt: Date.now(),
    }));
  }, []);

  const addEspacioAndSelect = useCallback((espacio: SalaEspacio) => {
    let previousDocument: SalaEditorDocument | null = null;
    let nextDocument: SalaEditorDocument | null = null;

    setDocument((prev) => {
      previousDocument = prev;
      nextDocument = {
        ...prev,
        espacios: [...prev.espacios, espacio],
        navigation: selectSalaEspacioInNavigation(prev.navigation, espacio.id),
        updatedAt: Date.now(),
      };
      return nextDocument;
    });

    if (previousDocument && nextDocument) {
      historyApi?.recordCommit("espacio.create", previousDocument, nextDocument);
    }
  }, [historyApi]);

  const updateEspacio = useCallback(
    (espacioId: string, patch: Partial<SalaEspacioDraft>) => {
      setDocument((prev) => {
        const next = {
          ...prev,
          espacios: prev.espacios.map((espacio) =>
            espacio.id === espacioId ? { ...espacio, ...patch } : espacio,
          ),
          updatedAt: Date.now(),
        };
        if (historyApi && getDocumentSnapshot) {
          historyApi.scheduleEspacioUpdateCommit(prev, getDocumentSnapshot);
        }
        return next;
      });
    },
    [getDocumentSnapshot, historyApi],
  );

  const updateEspacioBase = useCallback(
    (espacioId: string, patch: SalaEspacioBasePatch) => {
      setDocument((prev) => {
        const next = {
          ...prev,
          espacios: prev.espacios.map((espacio) =>
            espacio.id === espacioId
              ? {
                  ...espacio,
                  base: applySalaEspacioBasePatch(espacio.base, patch),
                }
              : espacio,
          ),
          updatedAt: Date.now(),
        };
        if (historyApi && getDocumentSnapshot) {
          historyApi.scheduleEspacioUpdateCommit(prev, getDocumentSnapshot);
        }
        return next;
      });
    },
    [getDocumentSnapshot, historyApi],
  );

  return {
    document,
    replaceDocument,
    restoreDocumentSnapshot,
    disabledPhases,
    selectedEspacio,
    elementCountByEspacioId,
    activeTool,
    setActiveTool,
    activeStructuralToolKind,
    activeStructuralToolboxItem,
    activeOperationalElement,
    setActiveOperationalElement,
    activeOperationalElementType,
    activeOperationalVisualVariant,
    activeSurfaceMaterial,
    activeLandscapeKind,
    selectSurfaceMaterial,
    selectLandscapeKind,
    surfaceObjectsInEspacio,
    selectedSurfaceObjectId,
    selectSurfaceObject,
    clearSurfaceSelection,
    addSurfaceObject,
    updateSurfaceObject,
    removeSurfaceObject,
    structuralElementsInEspacio,
    selectedStructuralElementId,
    selectedStructuralElement,
    addStructuralElement,
    updateStructuralElement,
    removeStructuralElement,
    selectStructuralElement,
    clearStructuralElementSelection,
    landscapeElementsInEspacio,
    selectedLandscapeElementId,
    selectedLandscapeElement,
    addLandscapeElement,
    updateLandscapeElement,
    removeLandscapeElement,
    selectLandscapeElement,
    clearLandscapeSelection,
    activeOperationalCatalogItem,
    operationalElementInstancesInEspacio,
    selectedOperationalElementInstanceId,
    selectedOperationalElementInstance,
    selectedWallAttachmentId,
    selectOperationalElement,
    clearOperationalElement,
    isOperationalElementSelected,
    addOperationalElement,
    removeOperationalElement,
    duplicateOperationalElement,
    resizeOperationalElementInstance,
    updateOperationalElement,
    selectOperationalElementInstance,
    clearOperationalElementInstance,
    placeOperationalElementAt,
    selectTool,
    clearTool,
    isToolSelected: isStructuralToolSelected,
    isStructuralToolSelected,
    setPhase,
    selectEspacio,
    replaceEspacios,
    addEspacio,
    addEspacioAndSelect,
    updateEspacio,
    updateEspacioBase,
    addWall,
    updateWall,
    removeWall,
    duplicateWall,
    addWallAttachment,
    selectWallAttachment,
    clearWallAttachmentSelection,
    updateWallAttachment,
    removeWallAttachment,
  };
}
