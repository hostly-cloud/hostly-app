/**
 * Reglas de navegación entre fases del editor de sala.
 * Helpers puros; sin side effects ni persistencia.
 */

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type {
  SalaEditorNavigation,
  SalaEditorPhase,
} from "@/lib/sala-editor/types/editor-navigation";
import {
  SALA_EDITOR_PHASE_ORDER,
  createDefaultSalaEditorNavigation,
} from "@/lib/sala-editor/types/editor-navigation";

export function canEnterSalaEditorPhase(
  phase: SalaEditorPhase,
  espacios: Pick<SalaEspacio, "id" | "active">[],
  navigation: SalaEditorNavigation,
): boolean {
  if (phase === "espacios") return true;

  const hasActiveEspacio = espacios.some((e) => e.active);
  if (!hasActiveEspacio) return false;

  if (
    phase === "base" ||
    phase === "terreno" ||
    phase === "estructura" ||
    phase === "operacion"
  ) {
    return navigation.selectedEspacioId != null;
  }

  return false;
}

export function getDisabledSalaEditorPhases(
  espacios: Pick<SalaEspacio, "id" | "active">[],
  navigation: SalaEditorNavigation,
): SalaEditorPhase[] {
  return SALA_EDITOR_PHASE_ORDER.filter(
    (phase) => !canEnterSalaEditorPhase(phase, espacios, navigation),
  );
}

export function navigateSalaEditorPhase(
  navigation: SalaEditorNavigation,
  nextPhase: SalaEditorPhase,
  espacios: Pick<SalaEspacio, "id" | "active">[],
): SalaEditorNavigation {
  if (!canEnterSalaEditorPhase(nextPhase, espacios, navigation)) {
    return navigation;
  }
  return { ...navigation, phase: nextPhase };
}

export function selectSalaEspacioInNavigation(
  navigation: SalaEditorNavigation,
  espacioId: string | null,
): SalaEditorNavigation {
  return {
    ...navigation,
    selectedEspacioId: espacioId,
  };
}

export function resetSalaEditorNavigation(): SalaEditorNavigation {
  return createDefaultSalaEditorNavigation();
}

export function salaEditorPhaseIndex(phase: SalaEditorPhase): number {
  return SALA_EDITOR_PHASE_ORDER.indexOf(phase);
}

export function isSalaEditorPhaseComplete(
  phase: SalaEditorPhase,
  counts: {
    espacios: number;
    structuralElements: number;
    operationalElements: number;
  },
): boolean {
  if (phase === "espacios") return counts.espacios > 0;
  if (phase === "base") return counts.espacios > 0;
  if (phase === "terreno") return counts.espacios > 0;
  if (phase === "estructura") return counts.structuralElements > 0;
  if (phase === "operacion") return counts.operationalElements > 0;
  return false;
}
