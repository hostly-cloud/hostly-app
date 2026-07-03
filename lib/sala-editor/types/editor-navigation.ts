/**
 * Navegación del editor de sala por fases.
 * Mapas se conserva como estado interno; el flujo visible es Base → Terreno → Estructura → Operación.
 */

import type { SalaEspacioId } from "@/lib/sala-editor/types/espacio";

export type SalaEditorPhase =
  | "espacios"
  | "base"
  | "terreno"
  | "estructura"
  | "operacion";

export type SalaEditorNavigation = {
  phase: SalaEditorPhase;
  /** Espacio activo al editar estructura u operación (Fases 2 y 3). */
  selectedEspacioId: SalaEspacioId | null;
};

export const SALA_EDITOR_PHASE_ORDER: readonly SalaEditorPhase[] = [
  "espacios",
  "base",
  "terreno",
  "estructura",
  "operacion",
] as const;

export const SALA_EDITOR_VISIBLE_PHASE_ORDER: readonly SalaEditorPhase[] = [
  "base",
  "terreno",
  "estructura",
  "operacion",
] as const;

export const SALA_EDITOR_PHASE_LABELS: Record<SalaEditorPhase, string> = {
  espacios: "Mapas",
  base: "Base",
  terreno: "Terreno",
  estructura: "Estructura",
  operacion: "Operación",
};

export const SALA_EDITOR_PHASE_DESCRIPTIONS: Record<SalaEditorPhase, string> = {
  espacios: "Define los mapas operativos del restaurante.",
  base: "Define dimensiones, escala, cuadrícula y fondo neutro.",
  terreno: "Construye superficies y materiales dentro del mapa.",
  estructura: "Paredes, barras, puertas y elementos fijos.",
  operacion: "Mesas, asientos y superficies de servicio.",
};

export function createDefaultSalaEditorNavigation(): SalaEditorNavigation {
  return {
    phase: "espacios",
    selectedEspacioId: null,
  };
}
