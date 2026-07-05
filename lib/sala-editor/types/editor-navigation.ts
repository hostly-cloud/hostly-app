/**
 * Navegación del editor de sala por fases.
 * Mapas se conserva como estado interno; el flujo visible es Base → Terreno → Estructura → Operación.
 */

import type { SalaEspacioId } from "@/lib/sala-editor/types/espacio";

export type SalaEditorPhase =
  | "espacios"
  | "base"
  | "zonas"
  | "terreno"
  | "estructura"
  | "paisajismo"
  | "operacion";

export type SalaEditorNavigation = {
  phase: SalaEditorPhase;
  /** Espacio activo al editar estructura u operación (Fases 2 y 3). */
  selectedEspacioId: SalaEspacioId | null;
};

export const SALA_EDITOR_PHASE_ORDER: readonly SalaEditorPhase[] = [
  "espacios",
  "base",
  "zonas",
  "terreno",
  "estructura",
  "paisajismo",
  "operacion",
] as const;

export const SALA_EDITOR_VISIBLE_PHASE_ORDER: readonly SalaEditorPhase[] = [
  "base",
  "zonas",
  "terreno",
  "estructura",
  "operacion",
  "paisajismo",
] as const;

export const SALA_EDITOR_PHASE_LABELS: Record<SalaEditorPhase, string> = {
  espacios: "Espacios",
  base: "Mi restaurante",
  zonas: "Espacios",
  terreno: "Suelo",
  estructura: "Elementos fijos",
  paisajismo: "Ambiente",
  operacion: "Mesas y servicio",
};

export const SALA_EDITOR_PHASE_DESCRIPTIONS: Record<SalaEditorPhase, string> = {
  espacios: "Organiza las salas, terrazas y zonas de tu restaurante.",
  base: "Ajusta el tamaño y el suelo de este espacio.",
  zonas: "Marca áreas reconocibles como sala, terraza, jardín o VIP.",
  terreno: "Dibuja suelos y materiales del espacio.",
  estructura: "Coloca paredes, puertas, cristales y separadores.",
  paisajismo: "Añade elementos que ayuden a reconocer el ambiente.",
  operacion: "Coloca mesas, barras y puntos de apoyo del servicio.",
};

export function createDefaultSalaEditorNavigation(): SalaEditorNavigation {
  return {
    phase: "espacios",
    selectedEspacioId: null,
  };
}
