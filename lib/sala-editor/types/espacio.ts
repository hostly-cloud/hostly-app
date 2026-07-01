/**
 * Espacio — unidad central del editor de sala (Fase 1).
 * Contrato canónico futuro; no sustituye aún `Zone` ni `FloorPlan` en Firestore.
 */

export type SalaEspacioId = string;

/** Metadatos de un espacio operativo (sala, terraza, VIP, piscina…). */
export type SalaEspacio = {
  id: SalaEspacioId;
  restaurantId: string;
  name: string;
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
  createdAt?: number;
  updatedAt?: number;
};

export type SalaEspacioDraft = Pick<
  SalaEspacio,
  "name" | "color" | "sortOrder" | "visible" | "active"
>;

export const DEFAULT_SALA_ESPACIO_COLOR = "#315f7d";

export function createDefaultSalaEspacioDraft(
  overrides?: Partial<SalaEspacioDraft>,
): SalaEspacioDraft {
  return {
    name: "",
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
