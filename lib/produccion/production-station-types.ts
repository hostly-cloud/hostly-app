/** Tipo de estación de producción (compatibilidad con el primer modelo de estaciones). */
export type ProductionStationType = "cocina" | "barra" | "cocteleria" | "otro";

export const PRODUCTION_STATION_TYPES: readonly ProductionStationType[] = [
  "cocina",
  "barra",
  "cocteleria",
  "otro",
] as const;

export const PRODUCTION_STATION_TYPE_LABELS: Record<ProductionStationType, string> = {
  cocina: "Cocina",
  barra: "Barra",
  cocteleria: "Coctelería",
  otro: "Otro",
};

/** Paleta compartida por la configuración visual de estaciones. */
export const PRODUCTION_STATION_COLOR_PRESETS: readonly {
  id: string;
  value: string;
  label: string;
}[] = [
  { id: "ice", value: "#7eb8d4", label: "Azul hielo" },
  { id: "sky", value: "#38bdf8", label: "Cielo" },
  { id: "emerald", value: "#34d399", label: "Verde" },
  { id: "amber", value: "#fbbf24", label: "Ámbar" },
  { id: "rose", value: "#fb7185", label: "Rosa" },
  { id: "violet", value: "#a78bfa", label: "Violeta" },
  { id: "slate", value: "#64748b", label: "Gris" },
  { id: "navy", value: "#334155", label: "Marino" },
] as const;

export const DEFAULT_PRODUCTION_STATION_COLOR =
  PRODUCTION_STATION_COLOR_PRESETS[0]!.value;

/**
 * Forma de compatibilidad usada por consumidores antiguos.
 * La fuente operativa canónica es `operationStations`; `sortOrder` se conserva
 * cuando el documento procede de esa colección.
 */
export type ProductionStationDocument = {
  id: string;
  restaurantId: string;
  name: string;
  normalizedName: string;
  type: ProductionStationType;
  color: string;
  active: boolean;
  sortOrder?: number;
  createdAt: number;
  updatedAt: number;
};

export type ProductionStationInput = {
  name: string;
  type: ProductionStationType;
  color?: string;
  active?: boolean;
};

export function isProductionStationType(value: unknown): value is ProductionStationType {
  return (
    value === "cocina" ||
    value === "barra" ||
    value === "cocteleria" ||
    value === "otro"
  );
}

export function normalizeProductionStationName(name: string): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeProductionStationColor(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_PRODUCTION_STATION_COLOR;
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  const preset = PRODUCTION_STATION_COLOR_PRESETS.find(
    (p) => p.id === v || p.value.toLowerCase() === v.toLowerCase(),
  );
  return preset?.value ?? DEFAULT_PRODUCTION_STATION_COLOR;
}

export function getProductionStationColorLabel(color: string): string {
  const preset = PRODUCTION_STATION_COLOR_PRESETS.find(
    (p) => p.value.toLowerCase() === color.trim().toLowerCase(),
  );
  return preset?.label ?? "Personalizado";
}

export function sortProductionStations(
  stations: ProductionStationDocument[],
): ProductionStationDocument[] {
  return stations.slice().sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const aOrder =
      typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder)
        ? a.sortOrder
        : Number.MAX_SAFE_INTEGER;
    const bOrder =
      typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)
        ? b.sortOrder
        : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  });
}

export function formatProductionStationListSummary(station: ProductionStationDocument): string {
  return [
    PRODUCTION_STATION_TYPE_LABELS[station.type],
    getProductionStationColorLabel(station.color),
  ].join(" · ");
}

/** Estaciones activas, ordenadas para selectores de configuración. */
export function filterActiveProductionStations(
  stations: ProductionStationDocument[],
): ProductionStationDocument[] {
  return sortProductionStations(stations.filter((s) => s.active));
}

/**
 * Sugiere una estación activa a partir de un destino legacy de familia.
 * `postres` y `sin_destino` no se mapean automáticamente.
 */
export function suggestProductionStationForLegacyDestino(
  destino: string | undefined,
  stations: ProductionStationDocument[],
): ProductionStationDocument | null {
  const d = (destino ?? "").trim().toLowerCase();
  let type: ProductionStationType | null = null;
  if (d === "cocina" || d === "cocina_frio" || d === "cocina_caliente" || d === "postres") {
    type = "cocina";
  } else if (d === "barra") {
    type = "barra";
  } else if (d === "cocteleria") {
    type = "cocteleria";
  }
  if (!type) return null;
  const active = filterActiveProductionStations(stations).filter((s) => s.type === type);
  return active[0] ?? null;
}

/** Resuelve el id de estación inicial al abrir el formulario de familia. */
export function resolveFamiliaProductionStationId(
  familia: {
    productionStationId?: string;
    suggestedDestination?: string;
  } | null | undefined,
  stations: ProductionStationDocument[],
): string {
  const savedId = familia?.productionStationId?.trim();
  if (savedId) {
    if (stations.length === 0) return savedId;
    const saved = stations.find((s) => s.id === savedId);
    if (saved) return saved.id;
  }
  const suggested = suggestProductionStationForLegacyDestino(
    familia?.suggestedDestination,
    stations,
  );
  return suggested?.id ?? "";
}
