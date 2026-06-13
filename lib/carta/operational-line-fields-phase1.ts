/**
 * Origen operativo unificado para TPV y `orders.items[]` (Fase 1 → 2.3a).
 *
 * ## Autoridad actual (runtime)
 *
 * | Campo | Autoridad | Uso |
 * |-------|-----------|-----|
 * | `station` / `preparationArea` | **Resolver** (Fase 2.1, `USE_RESOLVER_AS_AUTHORITY`) | Bucket KDS: cocina / barra / coctelería |
 * | `operationStationId` / `operationStationName` | **Legacy** (producto → línea → Firestore) | Subestación: filtro fino KDS, badge TPV, impresora |
 * | `course` | Legacy (`resolveProductDefaultCourse`) | Comanda / Marchar |
 *
 * KDS tablero (Cocina/Barra/Coctelería) **no** enruta por `operationStationId`.
 *
 * ## Fase 2.3a (este archivo)
 *
 * - Documentación y guardas **solo development**.
 * - Sin cambio de persistencia ni routing.
 *
 * ## Criterios futura migración `operationStationId` → resolver (Fase 2.3b+)
 *
 * Activar solo cuando se cumpla **todo**:
 * 1. Tenant con **varias** estaciones operativas activas del mismo tipo (p. ej. 2+ cocinas).
 * 2. `ResolvedProductionStation.operationStationId` proyectado con reglas explícitas
 *    (operation_legacy, default-* por bucket, o mapa production → operation).
 * 3. QA con impresión activa (`printerConfig.enabled`) y filtro fino KDS.
 * 4. Catálogo sin conflictos bucket(station) vs bucket(operationStationId).
 * 5. Rollback: flag dedicado (no reutilizar `USE_RESOLVER_AS_AUTHORITY`).
 *
 * Rollback Fase 2.1 bucket: `USE_RESOLVER_AS_AUTHORITY = false`.
 */

import {
  legacyBucketFromStationAndPreparationArea,
  resolveEffectiveProductionStation,
  type LegacyBucket,
  type ResolvedProductionStation,
  type ResolvedProductionStationSource,
} from "@/lib/produccion/resolve-effective-production-station";
import {
  resolveOperationStationFieldsForCartLine,
  resolveOperationStationFieldsFromProduct,
  resolveStationFieldsForCartLine,
  resolveStationFieldsFromProduct,
  type OrderLineOperationStationFields,
  type OrderLinePreparationArea,
  type OrderLineStation,
  type OrderLineStationFields,
} from "@/lib/kds/order-line-station";
import { resolveKdsDestination, type KdsDestination } from "@/lib/kds/kds-destination";
import { deriveLegacyStationFromOperationStation } from "@/lib/operacion/product-operation-station";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import type { ProductionStationDocument } from "@/lib/produccion/production-station-types";
import type { ResolveEffectiveProductionStationFamilyInput } from "@/lib/produccion/resolve-effective-production-station";
import type { Product } from "@/types/product";

/**
 * Fase 2.1 — autoridad del resolver para `station` / `preparationArea` en `orders.items[]`.
 * `false` restaura Fase 2.0 (legacy autoridad, resolver solo trace).
 */
export const USE_RESOLVER_AS_AUTHORITY = true;

/** Trazabilidad interna; no se persiste en Firestore. */
export type OperationalLineFieldsPhase1Trace = {
  resolverSource: ResolvedProductionStationSource;
  resolverLegacyBucket: LegacyBucket;
  divergedFromLegacy: boolean;
};

export type OperationalLineFieldsPhase1Result = {
  stationFields: OrderLineStationFields;
  opFields: OrderLineOperationStationFields;
  phase1Trace: OperationalLineFieldsPhase1Trace;
};

/** Snapshot comparable legacy vs resolver (solo auditoría; no altera runtime). */
export type OperationalRoutingSnapshot = {
  station?: OrderLineStation;
  preparationArea?: OrderLinePreparationArea;
  operationStationId?: string;
  operationStationName?: string;
  legacyBucket: LegacyBucket;
  kdsDestination: KdsDestination;
  resolverSource?: ResolvedProductionStationSource;
};

export type OperationalParityCatalogContext = {
  productionStations?: readonly ProductionStationDocument[];
  operationStations?: readonly OperationStationDocument[];
  family?: ResolveEffectiveProductionStationFamilyInput | null;
};

type CartLineOperationalInput = {
  station?: unknown;
  preparationArea?: unknown;
  operationStationId?: unknown;
  operationStationName?: unknown;
  product: Product;
};

function buildResolverProductInput(
  product: Product,
): NonNullable<
  Parameters<typeof resolveEffectiveProductionStation>[0]["product"]
> {
  return {
    station: product.station ?? null,
    preparationArea: product.preparationArea ?? null,
    operationStationId: product.operationStationId ?? null,
    operationStationName: product.operationStationName ?? null,
  };
}

function readOptionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function buildResolverLineInput(
  line: CartLineOperationalInput,
): NonNullable<
  Parameters<typeof resolveEffectiveProductionStation>[0]["line"]
> {
  return {
    station: readOptionalTrimmedString(line.station),
    preparationArea: readOptionalTrimmedString(line.preparationArea),
    operationStationId: readOptionalTrimmedString(line.operationStationId),
  };
}

function legacyBucketFromStationFields(
  fields: OrderLineStationFields,
): LegacyBucket {
  return legacyBucketFromStationAndPreparationArea(
    fields.station ?? null,
    fields.preparationArea ?? null,
  );
}

function kdsRoutableFromProduct(product: Product) {
  return {
    station: product.station,
    preparationArea: product.preparationArea,
    categoria: product.categoria,
    categoryName: product.categoria,
    name: product.nombre,
    nombre: product.nombre,
  };
}

function kdsDestinationFromLegacyBucket(
  bucket: LegacyBucket,
  product: Product,
): KdsDestination {
  if (bucket === "kitchen" || bucket === "bar" || bucket === "cocktail") {
    return bucket;
  }
  return resolveKdsDestination(kdsRoutableFromProduct(product));
}

/** Proyección del bucket del resolver a campos de línea (Fase 2+). */
export function stationFieldsFromLegacyBucket(
  bucket: LegacyBucket,
): OrderLineStationFields {
  switch (bucket) {
    case "kitchen":
      return { station: "kitchen", preparationArea: "cocina" };
    case "bar":
      return { station: "bar", preparationArea: "barra" };
    case "cocktail":
      return { station: "cocktail", preparationArea: "cocteleria" };
    case "none":
      return { station: "none", preparationArea: "none" };
    default:
      return {};
  }
}

function snapshotFromStationAndOpFields(
  stationFields: OrderLineStationFields,
  opFields: OrderLineOperationStationFields,
  product: Product,
  resolverSource?: ResolvedProductionStationSource,
): OperationalRoutingSnapshot {
  const legacyBucket = legacyBucketFromStationFields(stationFields);
  return {
    ...(stationFields.station ? { station: stationFields.station } : {}),
    ...(stationFields.preparationArea
      ? { preparationArea: stationFields.preparationArea }
      : {}),
    ...(opFields.operationStationId
      ? { operationStationId: opFields.operationStationId }
      : {}),
    ...(opFields.operationStationName
      ? { operationStationName: opFields.operationStationName }
      : {}),
    legacyBucket,
    kdsDestination: kdsDestinationFromLegacyBucket(legacyBucket, product),
    ...(resolverSource ? { resolverSource } : {}),
  };
}

/** Legacy autoritario actual (misma regla que runtime Fase 1). */
export function computeLegacyOperationalSnapshot(
  product: Product,
): OperationalRoutingSnapshot {
  const stationFields = resolveStationFieldsFromProduct(product);
  const opFields = resolveOperationStationFieldsFromProduct(product);
  return snapshotFromStationAndOpFields(stationFields, opFields, product);
}

/**
 * Salida proyectada de resolveEffectiveProductionStation para auditoría.
 * No modifica runtime; permite pasar catálogos reales en Fase 1.5.
 */
export function computeResolverOperationalSnapshot(
  product: Product,
  catalogs: OperationalParityCatalogContext = {},
): OperationalRoutingSnapshot {
  const opFields = resolveOperationStationFieldsFromProduct(product);
  const resolved = resolveEffectiveProductionStation({
    product: buildResolverProductInput(product),
    line: null,
    family: catalogs.family ?? null,
    productionStations: catalogs.productionStations ?? [],
    operationStations: catalogs.operationStations ?? [],
  });
  const stationFields = stationFieldsFromLegacyBucket(resolved.legacyBucket);
  return snapshotFromStationAndOpFields(
    stationFields,
    opFields,
    product,
    resolved.source,
  );
}

function warnPhase1ResolverDivergence(args: {
  context: "product" | "cart_line";
  productId: string;
  legacyBucket: LegacyBucket;
  trace: OperationalLineFieldsPhase1Trace;
}): void {
  if (USE_RESOLVER_AS_AUTHORITY) return;
  if (process.env.NODE_ENV !== "development") return;
  if (!args.trace.divergedFromLegacy) return;
  console.warn(
    "[Hostly operational Fase 2.0 shadow] resolveEffectiveProductionStation diverge del legacy; se mantiene legacy.",
    {
      context: args.context,
      productId: args.productId,
      legacyBucket: args.legacyBucket,
      resolverSource: args.trace.resolverSource,
      resolverLegacyBucket: args.trace.resolverLegacyBucket,
    },
  );
}

/** Resolución válida: station, preparationArea o legacyBucket explícito del resolver. */
function isValidResolverStationResolution(
  resolved: ResolvedProductionStation,
  projected: OrderLineStationFields,
): boolean {
  if (projected.station || projected.preparationArea) return true;
  const bucket = resolved.legacyBucket;
  return (
    bucket === "kitchen" ||
    bucket === "bar" ||
    bucket === "cocktail" ||
    bucket === "none"
  );
}

function warnResolverAuthorityFallback(args: {
  context: "product" | "cart_line";
  productId: string;
  resolverSource: ResolvedProductionStationSource;
  resolverLegacyBucket: LegacyBucket;
}): void {
  if (!USE_RESOLVER_AS_AUTHORITY) return;
  if (process.env.NODE_ENV !== "development") return;
  console.warn(
    "[Hostly operational Fase 2.1] resolución resolver inválida; fallback a legacy para station/preparationArea.",
    args,
  );
}

function legacyBucketFromOperationStationId(
  operationStationId: string | undefined,
  operationStations: readonly OperationStationDocument[] | undefined,
): LegacyBucket | null {
  const id = operationStationId?.trim();
  if (!id || !operationStations?.length) return null;
  const found = operationStations.find((s) => s.id === id);
  if (!found) return null;
  const legacyStation = deriveLegacyStationFromOperationStation(found);
  if (legacyStation === "kitchen" || legacyStation === "bar" || legacyStation === "cocktail") {
    return legacyStation;
  }
  if (legacyStation === "none") return "none";
  return null;
}

/** Fase 2.3a — solo development: bucket legacy vs estación operativa legacy. */
function warnDevOperationStationBucketMismatch(args: {
  context: "product" | "cart_line";
  productId: string;
  stationFields: OrderLineStationFields;
  opFields: OrderLineOperationStationFields;
  operationStations: readonly OperationStationDocument[] | undefined;
}): void {
  if (process.env.NODE_ENV !== "development") return;

  const stationBucket = legacyBucketFromStationFields(args.stationFields);
  if (stationBucket === "none") return;

  const opId = args.opFields.operationStationId?.trim();
  if (!opId) return;

  const opBucket = legacyBucketFromOperationStationId(
    opId,
    args.operationStations,
  );
  if (!opBucket || opBucket === "none") return;
  if (stationBucket === opBucket) return;

  console.warn(
    "[Hostly operational Fase 2.3a] bucket(station/preparationArea) ≠ bucket(operationStationId); opFields siguen legacy.",
    {
      context: args.context,
      productId: args.productId,
      station: args.stationFields.station ?? null,
      preparationArea: args.stationFields.preparationArea ?? null,
      stationBucket,
      operationStationId: opId,
      operationStationName: args.opFields.operationStationName ?? null,
      operationStationBucket: opBucket,
    },
  );
}

function pickAuthoritativeStationFields(args: {
  context: "product" | "cart_line";
  productId: string;
  legacyStationFields: OrderLineStationFields;
  resolved: ResolvedProductionStation;
}): OrderLineStationFields {
  if (!USE_RESOLVER_AS_AUTHORITY) {
    return args.legacyStationFields;
  }

  const resolverStationFields = stationFieldsFromLegacyBucket(
    args.resolved.legacyBucket,
  );
  if (!isValidResolverStationResolution(args.resolved, resolverStationFields)) {
    warnResolverAuthorityFallback({
      context: args.context,
      productId: args.productId,
      resolverSource: args.resolved.source,
      resolverLegacyBucket: args.resolved.legacyBucket,
    });
    return args.legacyStationFields;
  }

  return resolverStationFields;
}

/**
 * Campos operativos para serialización TPV / `orders.items[]`.
 * Fase 2.1: `stationFields` pueden salir del resolver; `opFields` siempre legacy.
 * `course` sigue en `resolveProductDefaultCourse` — fuera de alcance.
 */
function resolveOperationalLineFieldsPhase1(args: {
  context: "product" | "cart_line";
  productId: string;
  stationFields: OrderLineStationFields;
  opFields: OrderLineOperationStationFields;
  resolverProduct: NonNullable<
    Parameters<typeof resolveEffectiveProductionStation>[0]["product"]
  >;
  resolverLine?: NonNullable<
    Parameters<typeof resolveEffectiveProductionStation>[0]["line"]
  >;
  /** Catálogos reales (Fase 2.0+); necesarios para resolución resolver con familia menú. */
  shadowCatalog?: OperationalParityCatalogContext;
}): OperationalLineFieldsPhase1Result {
  const legacyBucket = legacyBucketFromStationFields(args.stationFields);
  const shadow = args.shadowCatalog;

  const resolved = resolveEffectiveProductionStation({
    product: args.resolverProduct,
    line: args.resolverLine ?? null,
    family: shadow?.family ?? null,
    productionStations: shadow?.productionStations ?? [],
    operationStations: shadow?.operationStations ?? [],
  });

  const authoritativeStationFields = pickAuthoritativeStationFields({
    context: args.context,
    productId: args.productId,
    legacyStationFields: args.stationFields,
    resolved,
  });

  const phase1Trace: OperationalLineFieldsPhase1Trace = {
    resolverSource: resolved.source,
    resolverLegacyBucket: resolved.legacyBucket,
    divergedFromLegacy: legacyBucket !== resolved.legacyBucket,
  };

  warnPhase1ResolverDivergence({
    context: args.context,
    productId: args.productId,
    legacyBucket,
    trace: phase1Trace,
  });

  warnDevOperationStationBucketMismatch({
    context: args.context,
    productId: args.productId,
    stationFields: authoritativeStationFields,
    opFields: args.opFields,
    operationStations: shadow?.operationStations,
  });

  return {
    stationFields: authoritativeStationFields,
    opFields: args.opFields,
    phase1Trace,
  };
}

export function resolveOperationalLineFieldsFromProduct(
  product: Product,
  shadowCatalog?: OperationalParityCatalogContext,
): OperationalLineFieldsPhase1Result {
  const stationFields = resolveStationFieldsFromProduct(product);
  const opFields = resolveOperationStationFieldsFromProduct(product);
  return resolveOperationalLineFieldsPhase1({
    context: "product",
    productId: product.id,
    stationFields,
    opFields,
    resolverProduct: buildResolverProductInput(product),
    shadowCatalog,
  });
}

export function resolveOperationalLineFieldsForCartLine(
  line: CartLineOperationalInput,
  shadowCatalog?: OperationalParityCatalogContext,
): OperationalLineFieldsPhase1Result {
  const stationFields = resolveStationFieldsForCartLine(line);
  const opFields = resolveOperationStationFieldsForCartLine(line);
  return resolveOperationalLineFieldsPhase1({
    context: "cart_line",
    productId: line.product.id,
    stationFields,
    opFields,
    resolverProduct: buildResolverProductInput(line.product),
    resolverLine: buildResolverLineInput(line),
    shadowCatalog,
  });
}
