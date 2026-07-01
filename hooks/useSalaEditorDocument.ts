"use client";

import { useCallback, useMemo, useState } from "react";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { createEmptySalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
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
 * Sin Firestore ni sessionStorage — solo preparación arquitectónica.
 */
export function useSalaEditorDocument({
  restaurantId,
  initialEspacios = [],
}: UseSalaEditorDocumentOptions) {
  const [document, setDocument] = useState<SalaEditorDocument>(() => ({
    ...createEmptySalaEditorDocument(restaurantId),
    espacios: initialEspacios,
  }));

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

  const setPhase = useCallback((phase: SalaEditorPhase) => {
    setDocument((prev) => ({
      ...prev,
      navigation: navigateSalaEditorPhase(prev.navigation, phase, prev.espacios),
      updatedAt: Date.now(),
    }));
  }, []);

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

  return {
    document,
    disabledPhases,
    selectedEspacio,
    setPhase,
    selectEspacio,
    replaceEspacios,
  };
}
