import { mapStationToPreparationArea } from "@/lib/carta/map-station-to-preparation-area";
import {
  resolveKdsDestination,
  type KdsDestination,
} from "@/lib/kds/kds-destination";
import {
  resolveStationFieldsForCartLine,
  type OrderLinePreparationArea,
  type OrderLineStation,
} from "@/lib/kds/order-line-station";
import { deriveLegacyStationFromOperationStation } from "@/lib/operacion/product-operation-station";
import type { Product } from "@/types/product";

/** Línea mínima para políticas de liberación (Comanda / Marchar). */
export type ComandaReleaseLine = {
  status: string;
  course?: number;
  station?: OrderLineStation;
  preparationArea?: OrderLinePreparationArea;
  product: Product;
};

export type ComandaReleaseAction =
  | "send_to_comanda"
  | "march_segundos"
  | "march_postres";

export function normalizeComandaCourseValue(raw: unknown): number | undefined {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(4, Math.max(1, Math.floor(n)));
}

function resolveComandaLineStationFields(
  line: ComandaReleaseLine,
): ReturnType<typeof resolveStationFieldsForCartLine> {
  const fields = resolveStationFieldsForCartLine(line);
  if (fields.station || fields.preparationArea) return fields;

  const opType = line.product.operationStationType;
  if (!opType) return fields;

  const legacy = deriveLegacyStationFromOperationStation({ type: opType });
  if (legacy !== "kitchen" && legacy !== "bar" && legacy !== "cocktail") {
    return fields;
  }

  const station = legacy as OrderLineStation;
  const preparationAreaRaw = mapStationToPreparationArea(station);
  const preparationArea =
    preparationAreaRaw === "cocina" ||
    preparationAreaRaw === "barra" ||
    preparationAreaRaw === "cocteleria"
      ? (preparationAreaRaw as OrderLinePreparationArea)
      : undefined;

  return {
    station,
    ...(preparationArea ? { preparationArea } : {}),
  };
}

/** Destino KDS de una línea de comanda (misma regla que badge TPV). */
export function resolveComandaLineKdsDestination(
  line: ComandaReleaseLine,
): KdsDestination {
  const stationFields = resolveComandaLineStationFields(line);
  return resolveKdsDestination({
    station: stationFields.station,
    preparationArea: stationFields.preparationArea,
    categoria: line.product.categoria,
    categoryName: line.product.categoria,
    name: line.product.nombre,
    nombre: line.product.nombre,
  });
}

/**
 * Al pulsar Comanda: libera pending → sent (barra/cóctel siempre; cocina solo entrantes / sin pase).
 */
export function shouldAutoReleaseLineOnComanda(line: ComandaReleaseLine): boolean {
  if (line.status !== "pending") return false;

  const dest = resolveComandaLineKdsDestination(line);
  if (dest === "bar" || dest === "cocktail") return true;
  if (dest === "none") return false;

  const course = normalizeComandaCourseValue(line.course) ?? 1;
  return course === 1;
}

/** Marchar segundos: primeros + segundos (course 2 y 3) aún pending. */
export function isPendingMarchSegundosLine(line: ComandaReleaseLine): boolean {
  if (line.status !== "pending") return false;
  const course = normalizeComandaCourseValue(line.course);
  return course === 2 || course === 3;
}

/** Marchar postres: course 4 pending. */
export function isPendingMarchPostresLine(line: ComandaReleaseLine): boolean {
  if (line.status !== "pending") return false;
  return normalizeComandaCourseValue(line.course) === 4;
}
