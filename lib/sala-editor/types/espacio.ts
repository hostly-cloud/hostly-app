/**
 * Espacio — unidad central del editor de sala (Fase 1).
 * Contrato canónico futuro; no sustituye aún `Zone` ni `FloorPlan` en Firestore.
 */

import type { SalaEspacioType } from "@/lib/sala-editor/catalog/espacio-types";
import type { SalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";

export type SalaEspacioId = string;

/** Metadatos de un espacio operativo (sala, terraza, VIP, piscina…). */
export type SalaEspacio = {
  id: SalaEspacioId;
  restaurantId: string;
  name: string;
  /** Tipo semántico del espacio (UI y presets). */
  tipo: SalaEspacioType;
  /** Color identificativo en listados y futuro mapa (hex). */
  color: string;
  /** Orden de presentación en navegación y pickers. */
  sortOrder: number;
  /** Si es false, no aparece en vistas operativas (TPV, mapa). */
  visible: boolean;
  /** Si es false, el espacio queda archivado sin borrarse. */
  active: boolean;
  /**
   * Puentes de migración hacia el modelo legacy.
   * Solo lectura/adaptación; no escribir en Firestore desde aquí.
   */
  legacyFloorPlanId?: string;
  legacyZoneId?: string;
  /** Preparación fundacional del mapa (forma, escala, suelo, cuadrícula). */
  base?: SalaEspacioBase;
  createdAt?: number;
  updatedAt?: number;
};

export type SalaEspacioDraft = Pick<
  SalaEspacio,
  | "name"
  | "tipo"
  | "color"
  | "sortOrder"
  | "visible"
  | "active"
  | "legacyFloorPlanId"
>;

export const DEFAULT_SALA_ESPACIO_COLOR = "#315f7d";

export function createDefaultSalaEspacioDraft(
  overrides?: Partial<SalaEspacioDraft>,
): SalaEspacioDraft {
  return {
    name: "",
    tipo: "sala",
    color: DEFAULT_SALA_ESPACIO_COLOR,
    sortOrder: 0,
    visible: true,
    active: true,
    ...overrides,
  };
}

export function sortSalaEspacios(list: SalaEspacio[]): SalaEspacio[] {
  return [...list].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, "es");
  });
}
