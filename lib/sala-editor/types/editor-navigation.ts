/**
 * Navegación del editor de sala por fases.
 * Fase 1 → espacios · Fase 2 → estructura · Fase 3 → operación.
 */

import type { SalaEspacioId } from "@/lib/sala-editor/types/espacio";

export type SalaEditorPhase = "espacios" | "estructura" | "operacion";

export type SalaEditorNavigation = {
  phase: SalaEditorPhase;
  /** Espacio activo al editar estructura u operación (Fases 2 y 3). */
  selectedEspacioId: SalaEspacioId | null;
};

export const SALA_EDITOR_PHASE_ORDER: readonly SalaEditorPhase[] = [
  "espacios",
  "estructura",
  "operacion",
] as const;

export const SALA_EDITOR_PHASE_LABELS: Record<SalaEditorPhase, string> = {
  espacios: "Espacios",
  estructura: "Estructura",
  operacion: "Operación",
};

export const SALA_EDITOR_PHASE_DESCRIPTIONS: Record<SalaEditorPhase, string> = {
  espacios: "Define salas, terrazas y zonas del local.",
  estructura: "Paredes, barras, puertas y elementos fijos.",
  operacion: "Mesas, asientos y superficies de servicio.",
};

export function createDefaultSalaEditorNavigation(): SalaEditorNavigation {
  return {
    phase: "espacios",
    selectedEspacioId: null,
  };
}
