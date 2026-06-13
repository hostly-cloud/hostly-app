import type { PrinterStationKey } from "@/lib/printing/printer-config-types";
import type { OperationStationDocument, OperationStationType } from "@/lib/operacion/operation-station-types";
import {
  filterActiveProductionStations,
  isProductionStationType,
  normalizeProductionStationName,
  type ProductionStationDocument,
  type ProductionStationType,
} from "@/lib/produccion/production-station-types";

/** Bucket legacy alineado con KDS / impresión (`PrinterStationKey` + `none`). */
export type LegacyBucket = PrinterStationKey | "none";

export type ResolvedProductionStationSource =
  | "line"
  | "product"
  | "family"
  | "operation_legacy"
  | "station_legacy"
  | "default";

export type ResolvedProductionStation = {
  productionStationId: string | null;
  productionStationName: string | null;
  productionStationType: ProductionStationType | null;
  legacyBucket: LegacyBucket;
  source: ResolvedProductionStationSource;
  printerName?: string | null;
  printerChannel?: string | null;
};

export type ResolveEffectiveProductionStationLineInput = {
  productionStationId?: string | null;
  operationStationId?: string | null;
  station?: string | null;
  preparationArea?: string | null;
};

export type ResolveEffectiveProductionStationProductInput = {
  productionStationId?: string | null;
  operationStationId?: string | null;
  operationStationName?: string | null;
  station?: string | null;
  preparationArea?: string | null;
};

export type ResolveEffectiveProductionStationFamilyInput = {
  productionStationId?: string | null;
  productionStationName?: string | null;
  productionStationType?: ProductionStationType | null;
};

export type ResolveEffectiveProductionStationInput = {
  line?: ResolveEffectiveProductionStationLineInput | null;
  product?: ResolveEffectiveProductionStationProductInput | null;
  family?: ResolveEffectiveProductionStationFamilyInput | null;
  productionStations: readonly ProductionStationDocument[];
  operationStations: readonly OperationStationDocument[];
};

const DEFAULT_LEGACY_BUCKET: LegacyBucket = "kitchen";

function readTrimmedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function buildProductionStationIndex(
  stations: readonly ProductionStationDocument[],
): Map<string, ProductionStationDocument> {
  return new Map(stations.map((s) => [s.id, s]));
}

function buildOperationStationIndex(
  stations: readonly OperationStationDocument[],
): Map<string, OperationStationDocument> {
  return new Map(stations.map((s) => [s.id, s]));
}

function operationTypeToProductionType(
  type: OperationStationType,
): ProductionStationType | null {
  switch (type) {
    case "kitchen":
      return "cocina";
    case "bar":
    case "floor":
      return "barra";
    case "cocktail":
      return "cocteleria";
    case "custom":
      return "otro";
    default:
      return null;
  }
}

/** Deriva bucket legacy desde tipo de estación de producción u operativa. */
function resolveLegacyBucket(
  type: ProductionStationType | OperationStationType | null | undefined,
): LegacyBucket {
  if (!type) return DEFAULT_LEGACY_BUCKET;
  if (type === "cocina" || type === "kitchen") return "kitchen";
  if (type === "barra" || type === "bar" || type === "floor") return "bar";
  if (type === "cocteleria" || type === "cocktail") return "cocktail";
  if (type === "otro" || type === "custom") return DEFAULT_LEGACY_BUCKET;
  if (type === "none") return "none";
  return DEFAULT_LEGACY_BUCKET;
}

/** Normaliza `station` / `preparationArea` legacy a bucket KDS. */
export function legacyBucketFromStationAndPreparationArea(
  station?: string | null,
  preparationArea?: string | null,
): LegacyBucket {
  const candidates = [station, preparationArea];
  for (const raw of candidates) {
    const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!s || s === "none") continue;
    if (s === "kitchen" || s === "cocina") return "kitchen";
    if (s === "bar" || s === "barra") return "bar";
    if (s === "cocktail" || s === "cocteleria") return "cocktail";
  }
  return "none";
}

function pickProductionStationByType(
  productionStations: readonly ProductionStationDocument[],
  type: ProductionStationType,
  preferredName?: string | null,
): ProductionStationDocument | null {
  const active = filterActiveProductionStations([...productionStations]).filter(
    (s) => s.type === type,
  );
  if (active.length === 0) return null;

  const preferredNorm = preferredName
    ? normalizeProductionStationName(preferredName)
    : "";
  if (preferredNorm) {
    const byName = active.find(
      (s) => normalizeProductionStationName(s.name) === preferredNorm,
    );
    if (byName) return byName;
  }

  return active[0] ?? null;
}

function pickProductionStationByLegacyBucket(
  productionStations: readonly ProductionStationDocument[],
  bucket: LegacyBucket,
  preferredName?: string | null,
): ProductionStationDocument | null {
  if (bucket === "none") return null;
  const type: ProductionStationType =
    bucket === "kitchen"
      ? "cocina"
      : bucket === "bar"
        ? "barra"
        : "cocteleria";
  return pickProductionStationByType(productionStations, type, preferredName);
}

/** Mapea estación operativa legacy a estación de producción del tenant. */
function mapOperationStationToProductionStation(
  operationStation: OperationStationDocument,
  productionStations: readonly ProductionStationDocument[],
): ProductionStationDocument | null {
  const productionType = operationTypeToProductionType(operationStation.type);
  if (!productionType) return null;
  return pickProductionStationByType(
    productionStations,
    productionType,
    operationStation.name,
  );
}

function printerFieldsFromOperationStation(
  operationStation: OperationStationDocument | null | undefined,
): Pick<ResolvedProductionStation, "printerName" | "printerChannel"> {
  if (!operationStation) return {};
  const printerName = operationStation.printerName?.trim() || null;
  const printerChannel = operationStation.printerChannel?.trim() || null;
  return {
    ...(printerName ? { printerName } : {}),
    ...(printerChannel ? { printerChannel } : {}),
  };
}

function resolvedFromProductionStation(
  station: ProductionStationDocument,
  source: ResolvedProductionStationSource,
  printerOverride?: Pick<ResolvedProductionStation, "printerName" | "printerChannel">,
): ResolvedProductionStation {
  return {
    productionStationId: station.id,
    productionStationName: station.name,
    productionStationType: station.type,
    legacyBucket: resolveLegacyBucket(station.type),
    source,
    ...printerOverride,
  };
}

function resolvedFromProductionStationId(
  productionStationId: string,
  productionStationsById: ReadonlyMap<string, ProductionStationDocument>,
  source: ResolvedProductionStationSource,
  denorm?: {
    productionStationName?: string | null;
    productionStationType?: ProductionStationType | null;
  },
  printerOverride?: Pick<ResolvedProductionStation, "printerName" | "printerChannel">,
): ResolvedProductionStation | null {
  const found = productionStationsById.get(productionStationId);
  if (found) {
    return resolvedFromProductionStation(found, source, printerOverride);
  }

  const type =
    denorm?.productionStationType &&
    isProductionStationType(denorm.productionStationType)
      ? denorm.productionStationType
      : null;

  return {
    productionStationId,
    productionStationName: denorm?.productionStationName?.trim() || null,
    productionStationType: type,
    legacyBucket: resolveLegacyBucket(type ?? undefined),
    source,
    ...printerOverride,
  };
}

function resolveFromLegacyStationFields(
  station: string | null | undefined,
  preparationArea: string | null | undefined,
  productionStations: readonly ProductionStationDocument[],
): ResolvedProductionStation | null {
  const bucket = legacyBucketFromStationAndPreparationArea(station, preparationArea);
  if (bucket === "none") return null;

  const matched = pickProductionStationByLegacyBucket(productionStations, bucket);
  if (matched) {
    return resolvedFromProductionStation(matched, "station_legacy");
  }

  return {
    productionStationId: null,
    productionStationName: null,
    productionStationType: null,
    legacyBucket: bucket,
    source: "station_legacy",
  };
}

function resolveDefault(
  productionStations: readonly ProductionStationDocument[],
): ResolvedProductionStation {
  const matched = pickProductionStationByLegacyBucket(
    productionStations,
    DEFAULT_LEGACY_BUCKET,
  );
  if (matched) {
    return resolvedFromProductionStation(matched, "default");
  }

  return {
    productionStationId: null,
    productionStationName: null,
    productionStationType: null,
    legacyBucket: DEFAULT_LEGACY_BUCKET,
    source: "default",
  };
}

/**
 * Resuelve la estación de producción efectiva sin I/O.
 * Prioridad: línea → producto → familia → operationStationId → station legacy → default cocina.
 */
export function resolveEffectiveProductionStation(
  input: ResolveEffectiveProductionStationInput,
): ResolvedProductionStation {
  const productionStationsById = buildProductionStationIndex(input.productionStations);
  const operationStationsById = buildOperationStationIndex(input.operationStations);

  const lineProductionStationId = readTrimmedId(input.line?.productionStationId);
  if (lineProductionStationId) {
    const resolved = resolvedFromProductionStationId(
      lineProductionStationId,
      productionStationsById,
      "line",
    );
    if (resolved) return resolved;
  }

  const productProductionStationId = readTrimmedId(input.product?.productionStationId);
  if (productProductionStationId) {
    const resolved = resolvedFromProductionStationId(
      productProductionStationId,
      productionStationsById,
      "product",
    );
    if (resolved) return resolved;
  }

  const familyProductionStationId = readTrimmedId(input.family?.productionStationId);
  if (familyProductionStationId) {
    const resolved = resolvedFromProductionStationId(
      familyProductionStationId,
      productionStationsById,
      "family",
      {
        productionStationName: input.family?.productionStationName,
        productionStationType: input.family?.productionStationType,
      },
    );
    if (resolved) return resolved;
  }

  const operationStationId =
    readTrimmedId(input.line?.operationStationId) ??
    readTrimmedId(input.product?.operationStationId);
  if (operationStationId) {
    const operationStation = operationStationsById.get(operationStationId);
    if (operationStation) {
      const mapped = mapOperationStationToProductionStation(
        operationStation,
        input.productionStations,
      );
      const printerOverride = printerFieldsFromOperationStation(operationStation);
      if (mapped) {
        return resolvedFromProductionStation(
          mapped,
          "operation_legacy",
          printerOverride,
        );
      }
      return {
        productionStationId: null,
        productionStationName: operationStation.name,
        productionStationType: operationTypeToProductionType(operationStation.type),
        legacyBucket: resolveLegacyBucket(operationStation.type),
        source: "operation_legacy",
        ...printerOverride,
      };
    }
  }

  const legacyStation =
    input.line?.station ?? input.product?.station ?? null;
  const legacyPreparationArea =
    input.line?.preparationArea ?? input.product?.preparationArea ?? null;
  const fromLegacyStation = resolveFromLegacyStationFields(
    legacyStation,
    legacyPreparationArea,
    input.productionStations,
  );
  if (fromLegacyStation) return fromLegacyStation;

  return resolveDefault(input.productionStations);
}
