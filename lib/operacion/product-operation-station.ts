import {
  legacyStationSelectValue,
  normalizeOperationalStationSelection,
  operationalStationToSelectValue,
  type OperationalStationValue,
} from "@/lib/carta/operational-station-options";
import { mapStationToPreparationArea } from "@/lib/carta/map-station-to-preparation-area";
import type { ProductDocument } from "@/lib/firestore/products";
import type {
  OperationStationDocument,
  OperationStationType,
} from "@/lib/operacion/operation-station-types";

/** Valor del `<select>`: sin estación operativa asignada. */
export const OPERATION_STATION_SELECT_NONE = "__none__";

export type ProductOperationStationPatch = {
  operationStationId?: string;
  operationStationName?: string;
  station: OperationalStationValue | string;
  preparationArea: string;
  clearOperationStation?: boolean;
};

export function deriveLegacyStationFromOperationStation(
  station: Pick<OperationStationDocument, "type">,
): OperationalStationValue {
  switch (station.type) {
    case "kitchen":
      return "kitchen";
    case "bar":
      return "bar";
    case "cocktail":
      return "cocktail";
    case "floor":
      return "bar";
    case "custom":
    default:
      return "none";
  }
}

export function derivePreparationAreaFromLegacyStation(
  station: OperationalStationValue,
): string {
  return mapStationToPreparationArea(station) ?? "none";
}

export function buildProductStationPatchFromOperationStation(
  station: OperationStationDocument | null,
): ProductOperationStationPatch {
  if (!station || !station.active) {
    return {
      clearOperationStation: true,
      station: "none",
      preparationArea: "none",
    };
  }
  const legacyStation = deriveLegacyStationFromOperationStation(station);
  return {
    operationStationId: station.id,
    operationStationName: station.name.trim(),
    station: legacyStation,
    preparationArea: derivePreparationAreaFromLegacyStation(legacyStation),
  };
}

export function buildProductStationPatchFromOperationStationType(
  operationStationId: string,
  operationStationName: string,
  type: OperationStationType,
): ProductOperationStationPatch {
  return buildProductStationPatchFromOperationStation({
    id: operationStationId.trim(),
    restaurantId: "",
    name: operationStationName.trim(),
    normalizedName: "",
    type,
    active: true,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
  });
}

export function isNoneOperationStationSelectValue(value: string): boolean {
  return value === OPERATION_STATION_SELECT_NONE;
}

export function resolveOperationStationFromSelectValue(
  selectValue: string,
  stations: readonly OperationStationDocument[],
): OperationStationDocument | null {
  const v = selectValue.trim();
  if (!v || isNoneOperationStationSelectValue(v)) return null;
  if (v.startsWith("__legacy__:")) return null;
  const found = stations.find((s) => s.id === v);
  return found && found.active ? found : null;
}

/** Valor inicial del select desde producto central. */
export function operationStationSelectValueFromProduct(
  product: Pick<
    ProductDocument,
    "operationStationId" | "operationStationName" | "station" | "preparationArea"
  >,
): string {
  const oid = product.operationStationId?.trim();
  if (oid) return oid;
  return operationalStationToSelectValue(
    product.preparationArea ?? product.station,
  );
}

export function buildProductStationPatchFromSelectValue(
  selectValue: string,
  stations: readonly OperationStationDocument[],
): ProductOperationStationPatch {
  const station = resolveOperationStationFromSelectValue(selectValue, stations);
  if (station) {
    return buildProductStationPatchFromOperationStation(station);
  }
  if (isNoneOperationStationSelectValue(selectValue)) {
    return buildProductStationPatchFromOperationStation(null);
  }
  const norm = normalizeOperationalStationSelection(
    selectValue.startsWith("__legacy__:")
      ? selectValue.slice("__legacy__:".length)
      : selectValue,
  );
  if (norm.isLegacy && norm.legacyRaw) {
    return {
      clearOperationStation: true,
      station: norm.legacyRaw,
      preparationArea: norm.legacyRaw,
    };
  }
  return {
    clearOperationStation: true,
    station: norm.station,
    preparationArea: norm.preparationArea,
  };
}

export function resolveProductOperationStationLabel(
  product: Pick<
    ProductDocument,
    "operationStationId" | "operationStationName" | "station" | "preparationArea"
  >,
  stations: readonly OperationStationDocument[],
): string {
  const oid = product.operationStationId?.trim();
  if (oid) {
    const match = stations.find((s) => s.id === oid);
    if (match) return match.name;
    const denorm = product.operationStationName?.trim();
    if (denorm) return denorm;
  }
  const norm = normalizeOperationalStationSelection(
    product.preparationArea ?? product.station,
  );
  if (norm.isLegacy && norm.legacyRaw) {
    return `Legacy: ${norm.legacyRaw}`;
  }
  if (norm.station === "kitchen") return "Legacy: Cocina";
  if (norm.station === "bar") return "Legacy: Barra";
  if (norm.station === "cocktail") return "Legacy: Coctelería";
  if (norm.station === "none") return "Sin estación";
  return `Legacy: ${norm.station}`;
}

export function legacyFallbackSelectOptionLabel(
  selectValue: string,
): string | null {
  if (!selectValue.startsWith("__legacy__:")) return null;
  const raw = selectValue.slice("__legacy__:".length).trim();
  if (!raw) return null;
  const norm = normalizeOperationalStationSelection(raw);
  if (!norm.isLegacy) {
    if (norm.station === "kitchen") return "Legacy: Cocina";
    if (norm.station === "bar") return "Legacy: Barra";
    if (norm.station === "cocktail") return "Legacy: Coctelería";
    return null;
  }
  return `Legacy: ${norm.legacyRaw ?? raw}`;
}

export function isLegacyOperationStationSelectValue(value: string): boolean {
  return value.startsWith("__legacy__:");
}

/** Etiqueta legacy amigable para opción de select (Cocina/Barra/Coctelería). */
export function legacyStationSelectValueForCanonical(
  station: "kitchen" | "bar" | "cocktail",
): string {
  return legacyStationSelectValue(
    station === "kitchen"
      ? "cocina"
      : station === "bar"
        ? "barra"
        : "cocteleria",
  );
}
