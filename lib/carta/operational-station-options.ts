import {
  mapPreparationAreaToStation,
  mapStationToPreparationArea,
} from "@/lib/carta/map-station-to-preparation-area";

/** Estación canónica (Firestore / KDS / impresión). Sala no incluida — pendiente de tipos. */
export type OperationalStationValue = "kitchen" | "bar" | "cocktail" | "none";

export type OperationalPreparationAreaValue =
  | "cocina"
  | "barra"
  | "cocteleria"
  | "none";

export type OperationalStationOption = {
  value: OperationalStationValue;
  label: string;
  preparationArea: OperationalPreparationAreaValue;
};

export const OPERATIONAL_STATION_OPTIONS: readonly OperationalStationOption[] = [
  { value: "kitchen", label: "Cocina", preparationArea: "cocina" },
  { value: "bar", label: "Barra", preparationArea: "barra" },
  { value: "cocktail", label: "Coctelería", preparationArea: "cocteleria" },
  { value: "none", label: "Ninguna / Sin estación", preparationArea: "none" },
] as const;

const LEGACY_SELECT_PREFIX = "__legacy__:";

export function legacyStationSelectValue(raw: string): string {
  return `${LEGACY_SELECT_PREFIX}${raw.trim()}`;
}

export function isLegacyStationSelectValue(value: string): boolean {
  return value.startsWith(LEGACY_SELECT_PREFIX);
}

export function readLegacyStationFromSelectValue(value: string): string {
  return value.slice(LEGACY_SELECT_PREFIX.length).trim();
}

export function stationToPreparationArea(
  station: string | null | undefined,
): OperationalPreparationAreaValue | undefined {
  const mapped = mapStationToPreparationArea(station);
  if (
    mapped === "cocina" ||
    mapped === "barra" ||
    mapped === "cocteleria" ||
    mapped === "none"
  ) {
    return mapped;
  }
  return undefined;
}

export function preparationAreaToStation(
  preparationArea: string | null | undefined,
): OperationalStationValue | undefined {
  const mapped = mapPreparationAreaToStation(preparationArea);
  if (
    mapped === "kitchen" ||
    mapped === "bar" ||
    mapped === "cocktail" ||
    mapped === "none"
  ) {
    return mapped;
  }
  return undefined;
}

export function getStationLabel(
  stationOrPreparationArea: string | null | undefined,
): string {
  const norm = normalizeOperationalStationSelection(stationOrPreparationArea);
  if (norm.isLegacy && norm.legacyRaw) {
    return `Legacy: ${norm.legacyRaw}`;
  }
  const opt = OPERATIONAL_STATION_OPTIONS.find((o) => o.value === norm.station);
  return opt?.label ?? "Sin estación";
}

export type NormalizedOperationalStation = {
  station: OperationalStationValue;
  preparationArea: OperationalPreparationAreaValue;
  isLegacy: boolean;
  legacyRaw?: string;
};

/**
 * Normaliza station/preparationArea desde Firestore, draft o texto legacy.
 * Valores desconocidos → isLegacy (no se reescriben hasta guardar con opción válida).
 */
export function normalizeOperationalStationSelection(
  raw: string | null | undefined,
): NormalizedOperationalStation {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return { station: "none", preparationArea: "none", isLegacy: false };
  }

  const lower = trimmed.toLowerCase();
  const asStation = preparationAreaToStation(lower) ?? preparationAreaToStation(trimmed);
  if (asStation && stationToPreparationArea(asStation)) {
    return {
      station: asStation,
      preparationArea: stationToPreparationArea(asStation)!,
      isLegacy: false,
    };
  }

  const asPrep = stationToPreparationArea(lower) ?? stationToPreparationArea(trimmed);
  if (asPrep) {
    const station = preparationAreaToStation(asPrep) ?? "none";
    return {
      station,
      preparationArea: asPrep,
      isLegacy: false,
    };
  }

  return {
    station: "none",
    preparationArea: "none",
    isLegacy: true,
    legacyRaw: trimmed,
  };
}

/** Valor para `<select>`: estación canónica o clave legacy. */
export function operationalStationToSelectValue(
  stationOrPreparationArea: string | null | undefined,
): string {
  const norm = normalizeOperationalStationSelection(stationOrPreparationArea);
  if (norm.isLegacy && norm.legacyRaw) {
    return legacyStationSelectValue(norm.legacyRaw);
  }
  return norm.station;
}

/** Desde valor del select → preparationArea persistida (y legacy intacto). */
export function selectValueToPreparationArea(selectValue: string): string {
  if (isLegacyStationSelectValue(selectValue)) {
    return readLegacyStationFromSelectValue(selectValue);
  }
  const opt = OPERATIONAL_STATION_OPTIONS.find((o) => o.value === selectValue);
  return opt?.preparationArea ?? "none";
}

/** Desde valor del select → station canónica (legacy → none hasta migrar). */
export function selectValueToStation(selectValue: string): OperationalStationValue {
  if (isLegacyStationSelectValue(selectValue)) {
    return "none";
  }
  const opt = OPERATIONAL_STATION_OPTIONS.find((o) => o.value === selectValue);
  return opt?.value ?? "none";
}
