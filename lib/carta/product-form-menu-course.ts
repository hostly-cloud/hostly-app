import { normalizeOperationalStationSelection } from "@/lib/carta/operational-station-options";
import type { TipoProductoVenta } from "@/lib/carta/product-sale-contract";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import {
  isLegacyOperationStationSelectValue,
  resolveOperationStationFromSelectValue,
} from "@/lib/operacion/product-operation-station";

function isBarOrCocktailStationType(type: OperationStationDocument["type"]): boolean {
  return type === "bar" || type === "cocktail";
}

function isBarOrCocktailLegacyStation(station: string): boolean {
  return station === "bar" || station === "cocktail";
}

/** Bebidas y productos de barra/coctelería no usan pase de comida. */
export function productFormSkipsMenuCourse(args: {
  tipo: TipoProductoVenta;
  operationStationSelect: string;
  operationStations: readonly OperationStationDocument[];
}): boolean {
  if (args.tipo === "bebida") return true;

  const station = resolveOperationStationFromSelectValue(
    args.operationStationSelect,
    args.operationStations,
  );
  if (station && isBarOrCocktailStationType(station.type)) return true;

  if (isLegacyOperationStationSelectValue(args.operationStationSelect)) {
    const raw = args.operationStationSelect.slice("__legacy__:".length);
    const norm = normalizeOperationalStationSelection(raw);
    if (isBarOrCocktailLegacyStation(norm.station)) return true;
  }

  const norm = normalizeOperationalStationSelection(args.operationStationSelect);
  if (isBarOrCocktailLegacyStation(norm.station)) return true;

  return false;
}
