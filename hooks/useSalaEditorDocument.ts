"use client";

import { useCallback, useMemo, useState } from "react";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { createEmptySalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEspacio, SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type { SalaEditorActiveTool } from "@/lib/sala-editor/types/editor-tool";
import {
  createStructuralActiveTool,
  DEFAULT_STRUCTURAL_ACTIVE_TOOL_KIND,
  isToolSelected,
} from "@/lib/sala-editor/types/editor-tool";
import {
  getStructuralToolboxItem,
} from "@/lib/sala-editor/catalog/structural-toolbox";
import {
  getDisabledSalaEditorPhases,
  navigateSalaEditorPhase,
  selectSalaEspacioInNavigation,
} from "@/lib/sala-editor/navigation/editor-phase-routing";

export type UseSalaEditorDocumentOptions = {
  restaurantId: string;
  initialEspacios?: SalaEspacio[];
};

/**
 * Estado local del documento del editor de sala.
 * Sin Firestore ni sessionStorage — solo preview arquitectónico.
 */
export function useSalaEditorDocument({
  restaurantId,
  initialEspacios = [],
}: UseSalaEditorDocumentOptions) {
  const [document, setDocument] = useState<SalaEditorDocument>(() => ({
    ...createEmptySalaEditorDocument(restaurantId),
    espacios: initialEspacios,
    navigation: {
      phase: "espacios",
      selectedEspacioId: initialEspacios[0]?.id ?? null,
    },
  }));

  const [activeTool, setActiveTool] = useState<SalaEditorActiveTool>(null);

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
      const structural = document.structuralElements.filter(
        (el) => el.espacioId === espacio.id,
      ).length;
      const operational = document.operationalElements.filter(
        (el) => el.espacioId === espacio.id,
      ).length;
      counts[espacio.id] = structural + operational;
    }
    return counts;
  }, [document.espacios, document.structuralElements, document.operationalElements]);

  const activeStructuralToolKind = useMemo((): SalaStructuralElementKind | null => {
    if (activeTool?.layer !== "estructura") return null;
    return activeTool.kind;
  }, [activeTool]);

  const activeStructuralToolboxItem = useMemo(() => {
    if (!activeStructuralToolKind) return null;
    return getStructuralToolboxItem(activeStructuralToolKind) ?? null;
  }, [activeStructuralToolKind]);

  const clearTool = useCallback(() => {
    setActiveTool(null);
  }, []);

  const selectTool = useCallback((kind: SalaStructuralElementKind) => {
    setActiveTool(createStructuralActiveTool(kind));
  }, []);

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
      } else {
        setActiveTool(null);
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
    setDocument((prev) => ({
      ...prev,
      espacios: [...prev.espacios, espacio],
      navigation: selectSalaEspacioInNavigation(prev.navigation, espacio.id),
      updatedAt: Date.now(),
    }));
  }, []);

  const updateEspacio = useCallback(
    (espacioId: string, patch: Partial<SalaEspacioDraft>) => {
      setDocument((prev) => ({
        ...prev,
        espacios: prev.espacios.map((espacio) =>
          espacio.id === espacioId ? { ...espacio, ...patch } : espacio,
        ),
        updatedAt: Date.now(),
      }));
    },
    [],
  );

  return {
    document,
    disabledPhases,
    selectedEspacio,
    elementCountByEspacioId,
    activeTool,
    setActiveTool,
    activeStructuralToolKind,
    activeStructuralToolboxItem,
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
  };
}
