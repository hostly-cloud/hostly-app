import {
  isCocktailItemHeuristic,
  resolveKdsDestination,
  type KdsDestination,
} from "@/lib/kds/kds-destination";
import { isBarItem } from "@/lib/kds/bar-classification";
import {
  readStationFieldsFromFirestoreRecord,
  type OrderLineStation,
} from "@/lib/kds/order-line-station";
import {
  computeLegacyOperationalSnapshot,
  computeResolverOperationalSnapshot,
  type OperationalParityCatalogContext,
  type OperationalRoutingSnapshot,
} from "@/lib/carta/operational-line-fields-phase1";
import { platoCartaToOperationalProduct } from "@/lib/carta/operational-catalog-mappers";
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";
import { deriveLegacyStationFromOperationStation } from "@/lib/operacion/product-operation-station";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import type { ProductionStationDocument } from "@/lib/produccion/production-station-types";
import type { ResolveEffectiveProductionStationFamilyInput } from "@/lib/produccion/resolve-effective-production-station";
import type { PlatoCarta } from "@/lib/platos-local";
import type { Product } from "@/types/product";

/** Estado de coherencia operativa del catálogo (solo lectura; no altera routing runtime). */
export type ProductOperationalRoutingAuditStatus =
  | "ok"
  | "no_destination"
  | "legacy_station_only"
  | "incomplete_operation_station"
  | "conflict"
  | "heuristic";

export type ProductOperationalRoutingAudit = {
  status: ProductOperationalRoutingAuditStatus;
  /** Destino que usaría el KDS hoy (misma regla que resolveKdsDestination). */
  kdsDestination: KdsDestination;
  stationBucket: KdsDestination | null;
  operationStationBucket: KdsDestination | null;
};

type PlatoRoutingSource = Pick<
  PlatoCarta,
  | "nombre"
  | "categoria"
  | "preparationArea"
  | "operationStationId"
  | "operationStationName"
  | "operationStationType"
>;

function readTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stationToBucket(station: OrderLineStation | undefined): KdsDestination | null {
  if (!station || station === "none") return station === "none" ? "none" : null;
  if (station === "kitchen" || station === "bar" || station === "cocktail") {
    return station;
  }
  return null;
}

function catalogStationFieldsFromPlato(p: PlatoRoutingSource) {
  const stationRaw = (p as PlatoRoutingSource & { station?: unknown }).station;
  return readStationFieldsFromFirestoreRecord({
    station: stationRaw,
    preparationArea: p.preparationArea,
  });
}

function hasDeterministicStationFields(
  fields: ReturnType<typeof catalogStationFieldsFromPlato>,
): boolean {
  return Boolean(fields.station || fields.preparationArea);
}

function kdsRoutableFromPlato(p: PlatoRoutingSource) {
  const fields = catalogStationFieldsFromPlato(p);
  return {
    station: fields.station,
    preparationArea: fields.preparationArea,
    categoria: p.categoria,
    categoryName: p.categoria,
    name: p.nombre,
    nombre: p.nombre,
  };
}

/** ¿Routing dependería de heurística (cóctel/bar) y no del default silencioso? */
export function productWouldUseRoutingHeuristic(p: PlatoRoutingSource): boolean {
  const item = kdsRoutableFromPlato(p);
  if (isCocktailItemHeuristic(item)) return true;
  if (isBarItem(item)) return true;
  return false;
}

function resolveOperationStationBucket(
  p: PlatoRoutingSource,
  operationStations?: readonly OperationStationDocument[],
): KdsDestination | null {
  if (p.operationStationType) {
    const legacy = deriveLegacyStationFromOperationStation({
      type: p.operationStationType,
    });
    return stationToBucket(legacy as OrderLineStation) ?? (legacy === "none" ? "none" : null);
  }

  const operationStationId = readTrimmed(p.operationStationId);
  if (!operationStationId || !operationStations?.length) return null;

  const found = operationStations.find((s) => s.id === operationStationId);
  if (!found) return null;

  const legacy = deriveLegacyStationFromOperationStation(found);
  return stationToBucket(legacy as OrderLineStation) ?? (legacy === "none" ? "none" : null);
}

function bucketsConflict(
  stationBucket: KdsDestination | null,
  operationBucket: KdsDestination | null,
): boolean {
  if (!stationBucket || !operationBucket) return false;
  if (stationBucket === "none" || operationBucket === "none") return false;
  return stationBucket !== operationBucket;
}

/**
 * Auditoría de coherencia operativa de un producto de catálogo.
 * Analiza datos actuales; no escribe ni recalcula destinos en runtime.
 */
export function auditProductOperationalRouting(
  p: PlatoRoutingSource,
  operationStations?: readonly OperationStationDocument[],
): ProductOperationalRoutingAudit {
  const stationFields = catalogStationFieldsFromPlato(p);
  const hasStation = hasDeterministicStationFields(stationFields);
  const hasOperationStationId = Boolean(readTrimmed(p.operationStationId));
  const stationBucket = stationToBucket(stationFields.station);
  const operationStationBucket = resolveOperationStationBucket(p, operationStations);
  const kdsDestination = resolveKdsDestination(kdsRoutableFromPlato(p));

  if (bucketsConflict(stationBucket, operationStationBucket)) {
    return {
      status: "conflict",
      kdsDestination,
      stationBucket,
      operationStationBucket,
    };
  }

  if (hasOperationStationId && !hasStation) {
    return {
      status: "incomplete_operation_station",
      kdsDestination,
      stationBucket,
      operationStationBucket,
    };
  }

  if (!hasStation && !hasOperationStationId) {
    if (productWouldUseRoutingHeuristic(p)) {
      return {
        status: "heuristic",
        kdsDestination,
        stationBucket,
        operationStationBucket,
      };
    }
    return {
      status: "no_destination",
      kdsDestination,
      stationBucket,
      operationStationBucket,
    };
  }

  if (hasStation && !hasOperationStationId) {
    return {
      status: "legacy_station_only",
      kdsDestination,
      stationBucket,
      operationStationBucket,
    };
  }

  return {
    status: "ok",
    kdsDestination,
    stationBucket,
    operationStationBucket,
  };
}

/** Resultado de paridad legacy vs resolveEffectiveProductionStation (solo lectura). */
export type ProductResolverParityIssue =
  | "OK"
  | "DIVERGENCIA_BUCKET"
  | "DIVERGENCIA_STATION"
  | "DIVERGENCIA_PREPARATION_AREA"
  | "FALTA_STATION"
  | "FALLBACK_HEURISTICO"
  | "SIN_OPERATION_STATION";

export type ProductResolverParityAudit = {
  productId: string;
  productName: string;
  /** Problemas detectados (puede incluir flags informativos + divergencias). */
  issues: ProductResolverParityIssue[];
  /** Primer issue de divergencia; OK si no hay divergencia estructural. */
  primaryIssue: ProductResolverParityIssue;
  legacy: OperationalRoutingSnapshot;
  resolver: OperationalRoutingSnapshot;
};

export type ProductResolverParityCatalogContext = OperationalParityCatalogContext;

export type ProductResolverParityCatalogSources = {
  operationStations?: readonly OperationStationDocument[];
  productionStations?: readonly ProductionStationDocument[];
  cartaCategorias?: readonly CartaCategoria[];
  cartaFamilias?: readonly CartaFamilia[];
};

/**
 * Resuelve familia de menú (`cartaFamilias`) para paridad resolver.
 * Prioridad: `plato.cartaFamiliaId` → categoría → `cartaFamiliaId`.
 */
export function resolveCartaFamiliaParityInputForPlato(
  p: Pick<PlatoCarta, "cartaFamiliaId" | "categoriaCartaId">,
  cartaCategorias: readonly CartaCategoria[],
  cartaFamilias: readonly CartaFamilia[],
): ResolveEffectiveProductionStationFamilyInput | null {
  const fromProduct = p.cartaFamiliaId?.trim();
  const categoryId = p.categoriaCartaId?.trim();
  const fromCategory =
    categoryId != null
      ? cartaCategorias.find((c) => c.id === categoryId)?.cartaFamiliaId?.trim()
      : undefined;
  const familiaId = fromProduct || fromCategory || "";
  if (!familiaId) return null;

  const family = cartaFamilias.find((f) => f.id === familiaId);
  if (!family) return null;

  return {
    productionStationId: family.productionStationId ?? null,
    productionStationName: family.productionStationName ?? null,
    productionStationType: family.productionStationType ?? null,
  };
}

/** Contexto de catálogos reales para auditProductResolverParity (solo lectura). */
export function buildProductResolverParityContextForPlato(
  p: Pick<PlatoCarta, "cartaFamiliaId" | "categoriaCartaId">,
  sources: ProductResolverParityCatalogSources = {},
): ProductResolverParityCatalogContext {
  return {
    operationStations: sources.operationStations ?? [],
    productionStations: sources.productionStations ?? [],
    family: resolveCartaFamiliaParityInputForPlato(
      p,
      sources.cartaCategorias ?? [],
      sources.cartaFamilias ?? [],
    ),
  };
}

/**
 * Misma resolución de familia menú que la auditoría visual, para productos TPV (`Product`).
 * Prioridad: `categoryId` → categoría → `cartaFamiliaId`.
 */
export function buildProductResolverParityContextFromProduct(
  product: Pick<Product, "categoryId">,
  sources: ProductResolverParityCatalogSources = {},
): ProductResolverParityCatalogContext {
  return buildProductResolverParityContextForPlato(
    { categoriaCartaId: product.categoryId },
    sources,
  );
}

export type ProductResolverParitySummary = {
  total: number;
  ok: number;
  withDivergence: number;
  byIssue: Record<ProductResolverParityIssue, number>;
};

function normField(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function hasLegacyStationFields(snapshot: OperationalRoutingSnapshot): boolean {
  const bucket = snapshot.legacyBucket;
  if (bucket !== "none") return true;
  return Boolean(snapshot.station || snapshot.preparationArea);
}

function classifyProductResolverParityIssues(args: {
  p: PlatoRoutingSource;
  legacy: OperationalRoutingSnapshot;
  resolver: OperationalRoutingSnapshot;
}): ProductResolverParityIssue[] {
  const issues: ProductResolverParityIssue[] = [];
  const { p, legacy, resolver } = args;

  if (!hasLegacyStationFields(legacy)) {
    issues.push("FALTA_STATION");
  }
  if (
    !hasLegacyStationFields(legacy) &&
    productWouldUseRoutingHeuristic(p)
  ) {
    issues.push("FALLBACK_HEURISTICO");
  }
  if (!readTrimmed(p.operationStationId)) {
    issues.push("SIN_OPERATION_STATION");
  }

  if (normField(legacy.station) !== normField(resolver.station)) {
    issues.push("DIVERGENCIA_STATION");
  }
  if (normField(legacy.preparationArea) !== normField(resolver.preparationArea)) {
    issues.push("DIVERGENCIA_PREPARATION_AREA");
  }
  if (
    legacy.kdsDestination !== resolver.kdsDestination ||
    legacy.legacyBucket !== resolver.legacyBucket
  ) {
    issues.push("DIVERGENCIA_BUCKET");
  }

  const hasStructuralDivergence = issues.some((i) =>
    i.startsWith("DIVERGENCIA_"),
  );
  if (!hasStructuralDivergence) {
    return ["OK", ...issues];
  }
  return issues;
}

function resolvePrimaryParityIssue(
  issues: ProductResolverParityIssue[],
): ProductResolverParityIssue {
  const structural = issues.find((i) => i.startsWith("DIVERGENCIA_"));
  if (structural) return structural;
  return "OK";
}

/**
 * Compara legacy autoritario vs resolveEffectiveProductionStation para un producto.
 * Solo lectura; no escribe Firestore ni altera runtime TPV/KDS.
 */
export function auditProductResolverParity(
  p: PlatoRoutingSource & { id: string },
  context: ProductResolverParityCatalogContext = {},
): ProductResolverParityAudit {
  const product = platoCartaToOperationalProduct(p as PlatoCarta);
  const legacy = computeLegacyOperationalSnapshot(product);
  const resolver = computeResolverOperationalSnapshot(product, context);
  const issues = classifyProductResolverParityIssues({ p, legacy, resolver });
  return {
    productId: p.id,
    productName: readTrimmed(p.nombre) || p.id,
    issues,
    primaryIssue: resolvePrimaryParityIssue(issues),
    legacy,
    resolver,
  };
}

/** Auditoría batch del catálogo (p. ej. Config → Carta → Productos). */
export function auditCatalogResolverParity(
  products: readonly (PlatoRoutingSource & { id: string })[],
  context: ProductResolverParityCatalogContext = {},
): ProductResolverParityAudit[] {
  return products.map((p) => auditProductResolverParity(p, context));
}

/**
 * Auditoría batch con catálogos reales por producto (familia menú resuelta por plato).
 * Usar en Config → Carta → Productos con los mismos sources que el chip Routing.
 */
export function auditCatalogResolverParityFromSources(
  products: readonly (PlatoRoutingSource & {
    id: string;
    cartaFamiliaId?: string;
    categoriaCartaId?: string;
  })[],
  sources: ProductResolverParityCatalogSources = {},
): ProductResolverParityAudit[] {
  return products.map((p) =>
    auditProductResolverParity(p, buildProductResolverParityContextForPlato(p, sources)),
  );
}

export function summarizeResolverParityAudits(
  audits: readonly ProductResolverParityAudit[],
): ProductResolverParitySummary {
  const byIssue: Record<ProductResolverParityIssue, number> = {
    OK: 0,
    DIVERGENCIA_BUCKET: 0,
    DIVERGENCIA_STATION: 0,
    DIVERGENCIA_PREPARATION_AREA: 0,
    FALTA_STATION: 0,
    FALLBACK_HEURISTICO: 0,
    SIN_OPERATION_STATION: 0,
  };

  let ok = 0;
  let withDivergence = 0;

  for (const audit of audits) {
    if (audit.primaryIssue === "OK") ok += 1;
    else withDivergence += 1;

    const counted = new Set<ProductResolverParityIssue>();
    for (const issue of audit.issues) {
      if (counted.has(issue)) continue;
      counted.add(issue);
      byIssue[issue] += 1;
    }
    if (audit.primaryIssue !== "OK" && !counted.has(audit.primaryIssue)) {
      byIssue[audit.primaryIssue] += 1;
    }
  }

  return {
    total: audits.length,
    ok,
    withDivergence,
    byIssue,
  };
}

/** Filtro rápido del resumen de paridad (Config → Carta → Productos). */
export type ResolverParityFilterId =
  | "all"
  | "ok"
  | "divergences"
  | "missingStation"
  | "heuristic"
  | "missingOperationStation";

export function auditMatchesResolverParityFilter(
  audit: ProductResolverParityAudit,
  filter: ResolverParityFilterId,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "ok":
      return audit.primaryIssue === "OK";
    case "divergences":
      return audit.primaryIssue !== "OK";
    case "missingStation":
      return audit.issues.includes("FALTA_STATION");
    case "heuristic":
      return audit.issues.includes("FALLBACK_HEURISTICO");
    case "missingOperationStation":
      return audit.issues.includes("SIN_OPERATION_STATION");
    default:
      return true;
  }
}

/** Filtra productos según issue de paridad (solo lectura). */
export function filterProductsByResolverParityFilter<T extends { id: string }>(
  products: readonly T[],
  audits: readonly ProductResolverParityAudit[],
  filter: ResolverParityFilterId,
): T[] {
  if (filter === "all") return [...products];
  const auditById = new Map(audits.map((audit) => [audit.productId, audit]));
  return products.filter((product) => {
    const audit = auditById.get(product.id);
    return audit != null && auditMatchesResolverParityFilter(audit, filter);
  });
}
