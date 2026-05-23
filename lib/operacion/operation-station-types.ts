/** Tipo canónico de estación (routing KDS legacy + futuro operationStationId). */
export type OperationStationType =
  | "kitchen"
  | "bar"
  | "cocktail"
  | "floor"
  | "custom";

export const OPERATION_STATION_TYPES: readonly OperationStationType[] = [
  "kitchen",
  "bar",
  "cocktail",
  "floor",
  "custom",
] as const;

export const OPERATION_STATION_TYPE_LABELS: Record<
  OperationStationType,
  string
> = {
  kitchen: "Cocina",
  bar: "Barra",
  cocktail: "Coctelería",
  floor: "Sala / Planta",
  custom: "Personalizada",
};

/** `restaurants/{restaurantId}/operationStations/{stationId}` */
export type OperationStationDocument = {
  id: string;
  restaurantId: string;
  name: string;
  normalizedName: string;
  type: OperationStationType;
  active: boolean;
  sortOrder: number;
  printerChannel?: string;
  printerName?: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
};

export type OperationStationInput = {
  name: string;
  type: OperationStationType;
  active?: boolean;
  sortOrder?: number;
  printerChannel?: string;
  printerName?: string;
};

export const DEFAULT_OPERATION_STATION_SPECS: readonly {
  id: string;
  name: string;
  type: OperationStationType;
  sortOrder: number;
}[] = [
  { id: "default-kitchen", name: "Cocina", type: "kitchen", sortOrder: 0 },
  { id: "default-bar", name: "Barra", type: "bar", sortOrder: 10 },
  {
    id: "default-cocktail",
    name: "Coctelería",
    type: "cocktail",
    sortOrder: 20,
  },
] as const;

export function isOperationStationType(
  value: unknown,
): value is OperationStationType {
  return (
    value === "kitchen" ||
    value === "bar" ||
    value === "cocktail" ||
    value === "floor" ||
    value === "custom"
  );
}

export function normalizeOperationStationName(name: string): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sortOperationStations(
  stations: OperationStationDocument[],
): OperationStationDocument[] {
  return stations.slice().sort((a, b) => {
    const d = a.sortOrder - b.sortOrder;
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, "es");
  });
}
