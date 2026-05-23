import {
  readStationFieldsFromFirestoreRecord,
  type OrderLineStationFields,
} from "@/lib/kds/order-line-station";
import {
  resolveKdsDestination,
  type KdsDestination,
} from "@/lib/kds/kds-destination";
import {
  isOperationStationType,
  type OperationStationType,
} from "@/lib/operacion/operation-station-types";
import type { Product } from "@/types/product";

export type OperationStationRoutingSource = OrderLineStationFields & {
  operationStationId?: unknown;
  operationStationName?: unknown;
  operationStationType?: unknown;
  product?: Product | null;
  categoria?: unknown;
  categoryName?: unknown;
  name?: unknown;
  nombre?: unknown;
};

export type ResolvedOperationStationRouting = {
  operationStationId?: string;
  operationStationName?: string;
  legacyDestination: KdsDestination;
  stationType?: OperationStationType;
};

function readOperationStationId(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function readOperationStationName(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function stationTypeFromLegacyDestination(
  destination: KdsDestination,
): OperationStationType | undefined {
  if (destination === "kitchen") return "kitchen";
  if (destination === "bar") return "bar";
  if (destination === "cocktail") return "cocktail";
  return undefined;
}

/**
 * Resuelve metadata de routing operativo para comanda / KDS / impresión.
 * `legacyDestination` sigue siendo la clave visual actual (cocina/barra/cóctel).
 */
export function resolveOperationStationRouting(
  source: OperationStationRoutingSource,
): ResolvedOperationStationRouting {
  const product = source.product ?? undefined;
  const operationStationId =
    readOperationStationId(source.operationStationId) ??
    readOperationStationId(product?.operationStationId);
  const operationStationName =
    readOperationStationName(source.operationStationName) ??
    readOperationStationName(product?.operationStationName);

  const stationFields = readStationFieldsFromFirestoreRecord({
    station: source.station ?? product?.station,
    preparationArea: source.preparationArea ?? product?.preparationArea,
  });

  const legacyDestination = resolveKdsDestination({
    station: stationFields.station,
    preparationArea: stationFields.preparationArea,
    categoria:
      typeof source.categoria === "string"
        ? source.categoria
        : product?.categoria,
    categoryName:
      typeof source.categoryName === "string"
        ? source.categoryName
        : undefined,
    name:
      typeof source.name === "string"
        ? source.name
        : typeof source.nombre === "string"
          ? source.nombre
          : product?.nombre,
    nombre: source.nombre ?? product?.nombre,
  });

  const explicitType = isOperationStationType(source.operationStationType)
    ? source.operationStationType
    : isOperationStationType(product?.operationStationType)
      ? product.operationStationType
      : undefined;

  const stationType =
    explicitType ?? stationTypeFromLegacyDestination(legacyDestination);

  return {
    ...(operationStationId ? { operationStationId } : {}),
    ...(operationStationName ? { operationStationName } : {}),
    legacyDestination,
    ...(stationType ? { stationType } : {}),
  };
}
