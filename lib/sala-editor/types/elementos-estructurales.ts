/**
 * Elementos estructurales del espacio (Fase 2).
 * Geometría y configuración; aún no conectados al render legacy.
 */

import type { SalaEspacioId } from "@/lib/sala-editor/types/espacio";

export type SalaStructuralElementId = string;

/** Tipos estructurales configurables dentro de un espacio. */
export type SalaStructuralElementKind =
  | "wall"
  | "glass"
  | "door"
  | "bar"
  | "stage"
  | "decoration"
  | "planter"
  | "separator";

export type SalaStructuralElementConfig = {
  /** Etiqueta visible en inspector (opcional). */
  label?: string;
  /** Opacidad 0–1 para cristales y separadores. */
  opacity?: number;
  /** Material o acabado sugerido (solo UI futura). */
  material?: string;
  /** Si el elemento bloquea colocación encima (pared, barra fija). */
  blocksPlacement?: boolean;
};

/** Elemento estructural posicionado en el lienzo del espacio. */
export type SalaStructuralElement = {
  id: SalaStructuralElementId;
  espacioId: SalaEspacioId;
  kind: SalaStructuralElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  locked?: boolean;
  config?: SalaStructuralElementConfig;
  createdAt?: number;
  updatedAt?: number;
};
