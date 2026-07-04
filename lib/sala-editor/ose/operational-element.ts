/**
 * Operational Space Engine — entidad operativa canónica (Fase 1).
 * Sustituye conceptualmente a «mesa» como unidad principal del mapa.
 * Una mesa es un OperationalElement de tipo TABLE.
 *
 * Solo modelo; sin persistencia ni lógica operativa.
 */

export type OperationalElementId = string;

export type OperationalElementType =
  | "TABLE"
  | "HIGH_TABLE"
  | "BAR_SEAT"
  | "BAR_STRAIGHT"
  | "BAR_L"
  | "RECEPTION"
  | "WAITER_STATION"
  | "SOFA"
  | "SUNBED"
  | "BALINESE_BED"
  | "ROOM"
  | "CABANA"
  | "PICKUP_POINT"
  | "CUSTOM";

export type OperationalBarElementType = "BAR_STRAIGHT" | "BAR_L";
export type OperationalServiceAreaElementType =
  | "RECEPTION"
  | "WAITER_STATION"
  | "PICKUP_POINT";

export type OperationalElementState =
  | "libre"
  | "ocupado"
  | "reservado"
  | "bloqueado"
  | "pendiente_limpieza"
  | "fuera_servicio";

export type OperationalElementPosition = {
  x: number;
  y: number;
};

export type OperationalElementMetadata = Record<string, unknown>;

/** Elemento operativo posicionado en un Espacio del Mapa Operativo. */
export type OperationalElement = {
  id: OperationalElementId;
  spaceId: string;
  zoneId: string | null;
  type: OperationalElementType;
  name: string;
  capacity: number;
  position: OperationalElementPosition;
  rotation: number;
  visible: boolean;
  enabled: boolean;
  metadata: OperationalElementMetadata;
  state: OperationalElementState;
};

export type OperationalElementDraft = Omit<OperationalElement, "id">;

export const DEFAULT_OPERATIONAL_ELEMENT_STATE: OperationalElementState = "libre";

export function isOperationalBarElementType(
  value: OperationalElementType,
): value is OperationalBarElementType {
  return value === "BAR_STRAIGHT" || value === "BAR_L";
}

export function isOperationalServiceAreaElementType(
  value: OperationalElementType,
): value is OperationalServiceAreaElementType {
  return (
    value === "RECEPTION" ||
    value === "WAITER_STATION" ||
    value === "PICKUP_POINT"
  );
}

export function createOperationalElement(
  draft: OperationalElementDraft,
): OperationalElement {
  return {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...draft,
  };
}
