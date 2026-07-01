/**
 * Elementos operativos del espacio (Fase 3).
 * Mesas, asientos y superficies de servicio; evolucionan hacia reservas y TPV.
 */

import type { SalaEspacioId } from "@/lib/sala-editor/types/espacio";

export type SalaOperationalElementId = string;

/** Tipos operativos colocables en un espacio. */
export type SalaOperationalElementKind =
  | "table"
  | "high-table"
  | "sofa"
  | "sunbed"
  | "balinese-bed"
  | "stool"
  | "chair"
  | "custom";

export type SalaOperationalElementConfig = {
  label?: string;
  seats?: number;
  /** Forma visual futura (cuadrada, redonda…). */
  shape?: "square" | "round" | "rect";
  /** Capacidad máxima sugerida para reservas. */
  maxCovers?: number;
};

/** Elemento operativo posicionado en el lienzo del espacio. */
export type SalaOperationalElement = {
  id: SalaOperationalElementId;
  espacioId: SalaEspacioId;
  kind: SalaOperationalElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  locked?: boolean;
  config?: SalaOperationalElementConfig;
  /**
   * Puente hacia `tables/{id}` legacy cuando exista persistencia.
   * Solo preparación; no escribir desde esta capa.
   */
  legacyTableId?: string;
  createdAt?: number;
  updatedAt?: number;
};
