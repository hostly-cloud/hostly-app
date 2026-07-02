/**
 * Navegación del editor de sala por fases.
 * Fase 1 → mapas · Fase 2 → base · Fase 3 → estructura · Fase 4 → operación.
 */

import type { SalaEspacioId } from "@/lib/sala-editor/types/espacio";

export type SalaEditorPhase = "espacios" | "base" | "estructura" | "operacion";

export type SalaEditorNavigation = {
  phase: SalaEditorPhase;
  /** Espacio activo al editar estructura u operación (Fases 2 y 3). */
  selectedEspacioId: SalaEspacioId | null;
};

export const SALA_EDITOR_PHASE_ORDER: readonly SalaEditorPhase[] = [
  "espacios",
  "base",
  "estructura",
  "operacion",
] as const;

export const SALA_EDITOR_PHASE_LABELS: Record<SalaEditorPhase, string> = {
  espacios: "Mapas",
  base: "Base",
  estructura: "Estructura",
  operacion: "Operación",
};

export const SALA_EDITOR_PHASE_DESCRIPTIONS: Record<SalaEditorPhase, string> = {
  espacios: "Define los mapas operativos del restaurante.",
  base: "Prepara forma, escala, suelo y referencias del mapa.",
  estructura: "Paredes, barras, puertas y elementos fijos.",
  operacion: "Mesas, asientos y superficies de servicio.",
};

export function createDefaultSalaEditorNavigation(): SalaEditorNavigation {
  return {
    phase: "espacios",
    selectedEspacioId: null,
  };
}
