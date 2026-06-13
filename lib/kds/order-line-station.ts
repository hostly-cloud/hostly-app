import {
  mapPreparationAreaToStation,
  mapStationToPreparationArea,
} from "@/lib/carta/map-station-to-preparation-area";
import type { Product } from "@/types/product";

/** Estación canónica central (Firestore / import IA). */
export type OrderLineStation = "kitchen" | "bar" | "cocktail" | "none";

/** Área operativa TPV/KDS (español). */
export type OrderLinePreparationArea = "cocina" | "barra" | "cocteleria" | "none";

export type OrderLineStationFields = {
  station?: OrderLineStation;
  preparationArea?: OrderLinePreparationArea;
};

export type OrderLineOperationStationFields = {
  operationStationId?: string;
  operationStationName?: string;
};

function normalizeStationValue(raw: unknown): OrderLineStation | undefined {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "kitchen" || s === "cocina") return "kitchen";
  if (s === "bar" || s === "barra") return "bar";
  if (s === "cocktail" || s === "cocteleria") return "cocktail";
  if (s === "none") return "none";
  return undefined;
}

function normalizePreparationAreaValue(
  raw: unknown,
): OrderLinePreparationArea | undefined {
  const mapped = mapStationToPreparationArea(
    typeof raw === "string" ? raw : undefined,
  );
  if (mapped === "cocina") return "cocina";
  if (mapped === "barra") return "barra";
  if (mapped === "cocteleria") return "cocteleria";
  if (mapped === "none") return "none";
  if (typeof raw === "string" && raw.trim().toLowerCase() === "none") {
    return "none";
  }
  return undefined;
}

function readOperationStationId(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function readOperationStationName(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export function readOperationStationFieldsFromFirestoreRecord(
  rec: Record<string, unknown>,
): OrderLineOperationStationFields {
  const out: OrderLineOperationStationFields = {};
  const operationStationId = readOperationStationId(rec.operationStationId);
  const operationStationName = readOperationStationName(rec.operationStationName);
  if (operationStationId) out.operationStationId = operationStationId;
  if (operationStationName) out.operationStationName = operationStationName;
  return out;
}

export function operationStationFieldsToFirestorePayload(
  fields: OrderLineOperationStationFields,
): Record<string, string> {
  const patch: Record<string, string> = {};
  if (fields.operationStationId) {
    patch.operationStationId = fields.operationStationId;
  }
  if (fields.operationStationName) {
    patch.operationStationName = fields.operationStationName;
  }
  return patch;
}

type ProductWithOperationStation = Product & {
  operationStationId?: unknown;
  operationStationName?: unknown;
};

export function resolveOperationStationFieldsFromProduct(
  product: ProductWithOperationStation,
): OrderLineOperationStationFields {
  const out: OrderLineOperationStationFields = {};
  const operationStationId = readOperationStationId(product.operationStationId);
  const operationStationName = readOperationStationName(
    product.operationStationName,
  );
  if (operationStationId) out.operationStationId = operationStationId;
  if (operationStationName) out.operationStationName = operationStationName;
  return out;
}

export function resolveOperationStationFieldsForCartLine(line: {
  operationStationId?: unknown;
  operationStationName?: unknown;
  product: ProductWithOperationStation;
}): OrderLineOperationStationFields {
  const lineId = readOperationStationId(line.operationStationId);
  const lineName = readOperationStationName(line.operationStationName);
  if (lineId || lineName) {
    const out: OrderLineOperationStationFields = {};
    if (lineId) out.operationStationId = lineId;
    if (lineName) out.operationStationName = lineName;
    return out;
  }
  return resolveOperationStationFieldsFromProduct(line.product);
}

/** Deriva station/preparationArea desde producto de catálogo (central o legacy). */
export function resolveStationFieldsFromProduct(
  product: Product,
): OrderLineStationFields {
  const prepFromProduct = normalizePreparationAreaValue(product.preparationArea);
  const stationFromProduct = normalizeStationValue(
    (product as Product & { station?: unknown }).station,
  );
  const stationFromPrep = normalizeStationValue(
    mapPreparationAreaToStation(
      prepFromProduct ?? product.preparationArea ?? null,
    ),
  );
  const station = stationFromProduct ?? stationFromPrep;
  const preparationArea =
    prepFromProduct ??
    (station
      ? normalizePreparationAreaValue(mapStationToPreparationArea(station))
      : undefined);

  const out: OrderLineStationFields = {};
  if (station && station !== "none") out.station = station;
  if (preparationArea && preparationArea !== "none") {
    out.preparationArea = preparationArea;
  }
  return out;
}

/** Prioriza campos en la línea; si faltan, resuelve desde el producto embebido. */
export function resolveStationFieldsForCartLine(line: {
  station?: unknown;
  preparationArea?: unknown;
  product: Product;
}): OrderLineStationFields {
  const lineStation = normalizeStationValue(line.station);
  const linePrep = normalizePreparationAreaValue(line.preparationArea);

  if (lineStation || linePrep) {
    const station =
      lineStation ??
      normalizeStationValue(mapPreparationAreaToStation(linePrep ?? null));
    const preparationArea =
      linePrep ??
      (station
        ? normalizePreparationAreaValue(mapStationToPreparationArea(station))
        : undefined);
    const out: OrderLineStationFields = {};
    if (station && station !== "none") out.station = station;
    if (preparationArea && preparationArea !== "none") {
      out.preparationArea = preparationArea;
    }
    return out;
  }

  return resolveStationFieldsFromProduct(line.product);
}

export function readStationFieldsFromFirestoreRecord(
  rec: Record<string, unknown>,
): OrderLineStationFields {
  const out: OrderLineStationFields = {};
  const station = normalizeStationValue(rec.station);
  const preparationArea = normalizePreparationAreaValue(rec.preparationArea);
  if (station && station !== "none") out.station = station;
  if (preparationArea && preparationArea !== "none") {
    out.preparationArea = preparationArea;
  }
  if (!out.station && out.preparationArea) {
    const derived = normalizeStationValue(
      mapPreparationAreaToStation(out.preparationArea),
    );
    if (derived && derived !== "none") out.station = derived;
  }
  return out;
}

/** Payload opcional para `orders.items[]` y `orderItems`. */
export function stationFieldsToFirestorePayload(
  fields: OrderLineStationFields,
): Record<string, OrderLineStation | OrderLinePreparationArea> {
  const patch: Record<string, OrderLineStation | OrderLinePreparationArea> =
    {};
  if (fields.station) patch.station = fields.station;
  if (fields.preparationArea) patch.preparationArea = fields.preparationArea;
  return patch;
}

/**
 * TPV UI secundaria: prioriza station/preparationArea materializados en la línea;
 * si faltan, resuelve desde producto; default cocina (compat. legacy).
 */
export function resolveDisplayPreparationAreaForCartLine(line: {
  station?: unknown;
  preparationArea?: unknown;
  product: Product;
}): OrderLinePreparationArea | "cocina" | "barra" | "cocteleria" {
  const fromLine = readStationFieldsFromFirestoreRecord({
    station: line.station,
    preparationArea: line.preparationArea,
  });
  if (fromLine.preparationArea) return fromLine.preparationArea;

  const fromProduct = resolveStationFieldsFromProduct(line.product);
  if (fromProduct.preparationArea) return fromProduct.preparationArea;

  return "cocina";
}

/** Solo development: línea enviada sin station ni preparationArea. */
export function warnDevIfSentLineMissingStation(args: {
  lineId: string;
  productId: string;
  productName: string;
  fields: OrderLineStationFields;
}): void {
  if (process.env.NODE_ENV !== "development") return;
  if (args.fields.station || args.fields.preparationArea) return;
  console.warn(
    "[Hostly KDS] Línea enviada sin station/preparationArea; KDS seguirá usando heurística de categoría.",
    {
      lineId: args.lineId,
      productId: args.productId,
      productName: args.productName,
    },
  );
}
