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
import { SalaEditorShell } from "@/components/sala-editor/sala-editor-shell";
import {
  SalaEspaciosPhasePanel,
  SalaEstructuraPhasePanel,
  SalaOperacionPhasePanel,
} from "@/components/sala-editor/phases";

export type SalaEditorWorkspaceProps = {
  restaurantId: string;
  /** Espacios iniciales (p. ej. desde adaptadores legacy). */
  initialEspacios?: SalaEspacio[];
};

/**
 * Workspace scaffold del editor de sala.
 * Estado 100 % local; no montado en rutas de producción todavía.
 */
export function SalaEditorWorkspace({
  restaurantId,
  initialEspacios = [],
}: SalaEditorWorkspaceProps) {
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

  const handlePhaseChange = useCallback(
    (phase: SalaEditorPhase) => {
      setDocument((prev) => ({
        ...prev,
        navigation: navigateSalaEditorPhase(
          prev.navigation,
          phase,
          prev.espacios,
        ),
        updatedAt: Date.now(),
      }));
    },
    [],
  );

  const handleSelectEspacio = useCallback((espacioId: string) => {
    setDocument((prev) => ({
      ...prev,
      navigation: selectSalaEspacioInNavigation(prev.navigation, espacioId),
      updatedAt: Date.now(),
    }));
  }, []);

  const phasePanel = (() => {
    switch (document.navigation.phase) {
      case "espacios":
        return (
          <SalaEspaciosPhasePanel
            espacios={document.espacios}
            selectedEspacioId={document.navigation.selectedEspacioId}
            onSelectEspacio={handleSelectEspacio}
          />
        );
      case "estructura":
        return (
          <SalaEstructuraPhasePanel espacioName={selectedEspacio?.name ?? null} />
        );
      case "operacion":
        return (
          <SalaOperacionPhasePanel espacioName={selectedEspacio?.name ?? null} />
        );
      default:
        return null;
    }
  })();

  return (
    <SalaEditorShell
      navigation={document.navigation}
      disabledPhases={disabledPhases}
      espaciosCount={document.espacios.length}
      onPhaseChange={handlePhaseChange}
    >
      {phasePanel}
    </SalaEditorShell>
  );
}

export { SalaEditorShell } from "@/components/sala-editor/sala-editor-shell";
export { SalaEditorPhaseNav } from "@/components/sala-editor/sala-editor-phase-nav";
export * from "@/components/sala-editor/phases";
