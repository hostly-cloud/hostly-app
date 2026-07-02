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
import type { SalaEditorActiveTool } from "@/lib/sala-editor/types/editor-tool";
import {
  createStructuralActiveTool,
  DEFAULT_STRUCTURAL_ACTIVE_TOOL_KIND,
  isToolSelected,
} from "@/lib/sala-editor/types/editor-tool";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import { createSalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import { removeWallAttachmentsForWall } from "@/lib/sala-editor/types/wall-attachment";
import {
  getStructuralToolboxItem,
} from "@/lib/sala-editor/catalog/structural-toolbox";
import type { ActiveOperationalElementSelection } from "@/lib/sala-editor/ose/active-operational-element";
import type { OperationalElementType, OperationalElementPosition } from "@/lib/sala-editor/ose/operational-element";
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
  const [selectedOperationalElementInstanceId, setSelectedOperationalElementInstanceId] =
    useState<string | null>(null);

  const replaceDocument = useCallback((nextDocument: SalaEditorDocument) => {
    if (nextDocument.restaurantId !== restaurantId) return;
    setDocument(normalizeSalaEditorDocument(nextDocument));
    setActiveTool(null);
    setActiveOperationalElement(null);
    setSelectedOperationalElementInstanceId(null);
    historyApi?.reset();
  }, [historyApi, restaurantId]);

  const restoreDocumentSnapshot = useCallback((nextDocument: SalaEditorDocument) => {
    if (nextDocument.restaurantId !== restaurantId) return;
    setDocument(normalizeSalaEditorDocument(nextDocument));
    setActiveTool(null);
    setActiveOperationalElement(null);
    setSelectedOperationalElementInstanceId(null);
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
      counts[espacio.id] = walls + structural + oseOperational + operational;
    }
    return counts;
  }, [
    document.espacios,
    document.walls,
    document.structuralElements,
    document.operationalElements,
    document.operationalElementInstances,
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
  }, []);

  const selectOperationalElement = useCallback(
    (type: OperationalElementType, visualVariant?: OperationalVisualVariant) => {
      setActiveOperationalElement(createActiveOperationalElement(type, visualVariant));
      setSelectedOperationalElementInstanceId(null);
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

    setDocument((prev) => {
      previousDocument = prev;
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
        setSelectedOperationalElementInstanceId(null);
      } else if (phase === "operacion") {
        setActiveTool(null);
        setActiveOperationalElement(
          createActiveOperationalElement(DEFAULT_ACTIVE_OPERATIONAL_ELEMENT_TYPE),
        );
        setSelectedOperationalElementInstanceId(null);
      } else {
        setActiveTool(null);
        setActiveOperationalElement(null);
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
    activeOperationalCatalogItem,
    operationalElementInstancesInEspacio,
    selectedOperationalElementInstanceId,
    selectedOperationalElementInstance,
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
  };
}
