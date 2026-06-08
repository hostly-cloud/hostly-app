/**
 * Auditoría read-only de integridad del catálogo central
 * (`restaurants/{restaurantId}/products`).
 *
 * No modifica datos ni comportamiento operativo.
 */

import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import { isMenuCourse } from "@/lib/carta/menu-course";
import { mapPreparationAreaToStation } from "@/lib/carta/map-station-to-preparation-area";
import { resolveKdsDestination } from "@/lib/kds/kds-destination";
import {
  deriveLegacyStationFromOperationStation,
} from "@/lib/operacion/product-operation-station";
import {
  isOperationStationType,
  type OperationStationType,
} from "@/lib/operacion/operation-station-types";
import {
  readStationFieldsFromFirestoreRecord,
  type OrderLineStation,
} from "@/lib/kds/order-line-station";

export type CatalogAuditLevel = "warning" | "error";

export type CatalogAuditRuleCode =
  | "FOOD_STATION_BAR"
  | "FOOD_STATION_COCKTAIL"
  | "DRINK_STATION_KITCHEN"
  | "MISSING_STATION"
  | "MISSING_OPERATION_STATION_ID"
  | "ACTIVE_NO_CATEGORY"
  | "ACTIVE_NO_FAMILY"
  | "INVALID_COURSE"
  | "STATION_OP_TYPE_MISMATCH"
  | "ORPHAN_OPERATION_STATION_ID"
  | "STATION_PREP_AREA_MISMATCH"
  | "METADATA_TIPO_FAMILY_CONFLICT"
  | "DUPLICATE_NAME"
  | "DRINK_HEURISTIC_KITCHEN";

export type CatalogAuditProduct = {
  id: string;
  name: string;
  active: boolean;
  visibleOnMenu?: boolean;
  categoryId: string | null;
  categoryName: string | null;
  station: string | null;
  preparationArea: string | null;
  resolvedStation: OrderLineStation | null;
  operationStationId: string | null;
  operationStationName: string | null;
  operationStationType: OperationStationType | null;
  tipoVenta: string | null;
  productFamilyType: "food" | "drink" | "other" | null;
  productFamilyId: string | null;
  productFamilyName: string | null;
  course: number | null | undefined;
  courseInvalid: boolean;
  kind: "food" | "drink" | "unknown";
};

export type CatalogAuditOperationStation = {
  id: string;
  name: string;
  type: OperationStationType;
  active: boolean;
};

export type CatalogAuditFinding = {
  level: CatalogAuditLevel;
  rule: CatalogAuditRuleCode;
  productId: string;
  productName: string;
  active: boolean;
  message: string;
  details?: Record<string, unknown>;
};

export type CatalogAuditReport = {
  ok: boolean;
  restaurantId: string;
  restaurantLabel?: string;
  generatedAt: string;
  summary: {
    productsAnalyzed: number;
    activeProducts: number;
    productsOnMenu: number;
    cleanProducts: number;
    warningsCount: number;
    errorsCount: number;
    countsByRule: Partial<Record<CatalogAuditRuleCode, number>>;
  };
  /** Productos activos sin warnings ni errors. */
  OK: Array<{ productId: string; productName: string }>;
  WARNINGS: CatalogAuditFinding[];
  ERRORS: CatalogAuditFinding[];
};

function readTrimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function classifyFoodDrink(product: CatalogAuditProduct): "food" | "drink" | "unknown" {
  if (product.productFamilyType === "drink") return "drink";
  if (product.productFamilyType === "food") return "food";
  const tv = (product.tipoVenta ?? "").trim().toLowerCase();
  if (tv === "bebida") return "drink";
  if (tv === "plato" || tv === "comida") return "food";
  return "unknown";
}

function readResolvedStation(
  station: string | null,
  preparationArea: string | null,
): OrderLineStation | null {
  const fields = readStationFieldsFromFirestoreRecord({
    station,
    preparationArea,
  });
  return fields.station ?? null;
}

function readCourseFromRecord(rec: Record<string, unknown>): {
  course: number | null | undefined;
  courseInvalid: boolean;
} {
  if (!Object.prototype.hasOwnProperty.call(rec, "course")) {
    return { course: undefined, courseInvalid: false };
  }
  const raw = rec.course;
  if (raw == null || raw === "") {
    return { course: null, courseInvalid: false };
  }
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) {
    return { course: null, courseInvalid: true };
  }
  if (n === 0) {
    return { course: null, courseInvalid: false };
  }
  if (!isMenuCourse(n)) {
    return { course: n, courseInvalid: true };
  }
  return { course: n, courseInvalid: false };
}

/** Normaliza un documento Firestore central a vista de auditoría. */
export function parseCatalogAuditProduct(
  productId: string,
  raw: Record<string, unknown>,
): CatalogAuditProduct {
  const name =
    readTrimmed(raw.name) ?? readTrimmed(raw.nombre) ?? productId;
  const station = readTrimmed(raw.station);
  const preparationArea = readTrimmed(raw.preparationArea);
  const categoryId = readTrimmed(raw.categoryId);
  const categoryName =
    readTrimmed(raw.categoryName) ?? readTrimmed(raw.categoria);
  const productFamilyTypeRaw = raw.productFamilyType;
  const productFamilyType =
    productFamilyTypeRaw === "food" ||
    productFamilyTypeRaw === "drink" ||
    productFamilyTypeRaw === "other"
      ? productFamilyTypeRaw
      : null;
  const operationStationType = isOperationStationType(raw.operationStationType)
    ? raw.operationStationType
    : null;
  const { course, courseInvalid } = readCourseFromRecord(raw);
  const active = raw.active !== false;
  const visibleOnMenu =
    typeof raw.visibleOnMenu === "boolean" ? raw.visibleOnMenu : undefined;

  const base: CatalogAuditProduct = {
    id: productId,
    name,
    active,
    visibleOnMenu,
    categoryId,
    categoryName,
    station,
    preparationArea,
    resolvedStation: readResolvedStation(station, preparationArea),
    operationStationId: readTrimmed(raw.operationStationId),
    operationStationName: readTrimmed(raw.operationStationName),
    operationStationType,
    tipoVenta: readTrimmed(raw.tipoVenta),
    productFamilyType,
    productFamilyId: readTrimmed(raw.productFamilyId),
    productFamilyName: readTrimmed(raw.productFamilyName),
    course,
    courseInvalid,
    kind: "unknown",
  };
  base.kind = classifyFoodDrink(base);
  return base;
}

function expectedStationFromOpType(
  type: OperationStationType,
): OrderLineStation | "none" {
  return deriveLegacyStationFromOperationStation({ type });
}

function pushFinding(
  findings: CatalogAuditFinding[],
  counts: Partial<Record<CatalogAuditRuleCode, number>>,
  finding: CatalogAuditFinding,
): void {
  findings.push(finding);
  counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
}

function auditSingleProduct(
  product: CatalogAuditProduct,
  operationStationsById: ReadonlyMap<string, CatalogAuditOperationStation>,
): { warnings: CatalogAuditFinding[]; errors: CatalogAuditFinding[] } {
  const warnings: CatalogAuditFinding[] = [];
  const errors: CatalogAuditFinding[] = [];
  const counts: Partial<Record<CatalogAuditRuleCode, number>> = {};

  const st = product.resolvedStation;

  if (product.kind === "food" && st === "bar") {
    pushFinding(errors, counts, {
      level: "error",
      rule: "FOOD_STATION_BAR",
      productId: product.id,
      productName: product.name,
      active: product.active,
      message: "Producto comida con station bar",
      details: { station: product.station, preparationArea: product.preparationArea },
    });
  }

  if (product.kind === "food" && st === "cocktail") {
    pushFinding(errors, counts, {
      level: "error",
      rule: "FOOD_STATION_COCKTAIL",
      productId: product.id,
      productName: product.name,
      active: product.active,
      message: "Producto comida con station cocktail",
      details: { station: product.station, preparationArea: product.preparationArea },
    });
  }

  if (product.kind === "drink" && st === "kitchen") {
    pushFinding(errors, counts, {
      level: "error",
      rule: "DRINK_STATION_KITCHEN",
      productId: product.id,
      productName: product.name,
      active: product.active,
      message: "Producto bebida con station kitchen",
      details: { station: product.station, preparationArea: product.preparationArea },
    });
  }

  if (!st) {
    pushFinding(warnings, counts, {
      level: "warning",
      rule: "MISSING_STATION",
      productId: product.id,
      productName: product.name,
      active: product.active,
      message: "Producto sin station/preparationArea válida",
    });
  }

  if (product.active && !product.operationStationId) {
    pushFinding(warnings, counts, {
      level: "warning",
      rule: "MISSING_OPERATION_STATION_ID",
      productId: product.id,
      productName: product.name,
      active: product.active,
      message: "Producto activo sin operationStationId",
      details: { station: st },
    });
  }

  if (product.active && !product.categoryId && !product.categoryName) {
    pushFinding(errors, counts, {
      level: "error",
      rule: "ACTIVE_NO_CATEGORY",
      productId: product.id,
      productName: product.name,
      active: product.active,
      message: "Producto activo sin categoría",
    });
  }

  if (
    product.active &&
    !product.productFamilyType &&
    !product.productFamilyId
  ) {
    pushFinding(warnings, counts, {
      level: "warning",
      rule: "ACTIVE_NO_FAMILY",
      productId: product.id,
      productName: product.name,
      active: product.active,
      message: "Producto activo sin familia de producto",
    });
  }

  if (product.courseInvalid) {
    pushFinding(errors, counts, {
      level: "error",
      rule: "INVALID_COURSE",
      productId: product.id,
      productName: product.name,
      active: product.active,
      message: "Producto con course inválido (debe ser 1–4 o null)",
      details: { course: product.course },
    });
  }

  if (product.operationStationId && !operationStationsById.has(product.operationStationId)) {
    pushFinding(errors, counts, {
      level: "error",
      rule: "ORPHAN_OPERATION_STATION_ID",
      productId: product.id,
      productName: product.name,
      active: product.active,
      message: "operationStationId no existe en operationStations",
      details: { operationStationId: product.operationStationId },
    });
  }

  if (st) {
    const opType =
      (product.operationStationId
        ? operationStationsById.get(product.operationStationId)?.type
        : null) ?? product.operationStationType;
    if (opType) {
      const expected = expectedStationFromOpType(opType);
      if (expected !== "none" && st !== expected) {
        pushFinding(errors, counts, {
          level: "error",
          rule: "STATION_OP_TYPE_MISMATCH",
          productId: product.id,
          productName: product.name,
          active: product.active,
          message: "station incompatible con operationStationType",
          details: {
            station: st,
            operationStationType: opType,
            expectedStation: expected,
          },
        });
      }
    }
  }

  if (product.station && product.preparationArea) {
    const stationNorm = product.station.trim().toLowerCase();
    const fromPrep = mapPreparationAreaToStation(product.preparationArea);
    const canonicalFromStation =
      stationNorm === "kitchen" || stationNorm === "cocina"
        ? "kitchen"
        : stationNorm === "bar" || stationNorm === "barra"
          ? "bar"
          : stationNorm === "cocktail" || stationNorm === "cocteleria"
            ? "cocktail"
            : stationNorm;
    if (fromPrep && canonicalFromStation !== fromPrep) {
      pushFinding(errors, counts, {
        level: "error",
        rule: "STATION_PREP_AREA_MISMATCH",
        productId: product.id,
        productName: product.name,
        active: product.active,
        message: "station y preparationArea incoherentes",
        details: {
          station: product.station,
          preparationArea: product.preparationArea,
        },
      });
    }
  }

  const tv = (product.tipoVenta ?? "").trim().toLowerCase();
  if (
    (tv === "bebida" && product.productFamilyType === "food") ||
    (tv === "plato" && product.productFamilyType === "drink")
  ) {
    pushFinding(errors, counts, {
      level: "error",
      rule: "METADATA_TIPO_FAMILY_CONFLICT",
      productId: product.id,
      productName: product.name,
      active: product.active,
      message: "tipoVenta y productFamilyType incoherentes",
      details: {
        tipoVenta: product.tipoVenta,
        productFamilyType: product.productFamilyType,
      },
    });
  }

  if (product.active && product.kind === "drink" && !st) {
    const dest = resolveKdsDestination({
      categoria: product.categoryName,
      categoryName: product.categoryName,
      name: product.name,
    });
    if (dest === "kitchen") {
      pushFinding(warnings, counts, {
        level: "warning",
        rule: "DRINK_HEURISTIC_KITCHEN",
        productId: product.id,
        productName: product.name,
        active: product.active,
        message:
          "Bebida activa sin station; heurística KDS enviaría a Cocina",
        details: { categoryName: product.categoryName, kdsDestination: dest },
      });
    }
  }

  return { warnings, errors };
}

function auditDuplicateNames(
  products: readonly CatalogAuditProduct[],
): CatalogAuditFinding[] {
  const byName = new Map<string, CatalogAuditProduct[]>();
  for (const p of products) {
    if (!p.active) continue;
    const key = normalizeProductName(p.name);
    if (!key) continue;
    const bucket = byName.get(key) ?? [];
    bucket.push(p);
    byName.set(key, bucket);
  }

  const findings: CatalogAuditFinding[] = [];
  for (const [, group] of byName) {
    if (group.length < 2) continue;
    for (const p of group) {
      findings.push({
        level: "warning",
        rule: "DUPLICATE_NAME",
        productId: p.id,
        productName: p.name,
        active: p.active,
        message: `Nombre duplicado (${group.length} productos activos con el mismo nombre normalizado)`,
        details: {
          normalizedName: normalizeProductName(p.name),
          duplicateIds: group.map((x) => x.id),
        },
      });
    }
  }
  return findings;
}

/**
 * Ejecuta la auditoría sobre productos ya normalizados (sin I/O).
 */
export function runCatalogIntegrityAudit(input: {
  restaurantId: string;
  restaurantLabel?: string;
  products: readonly CatalogAuditProduct[];
  operationStations?: readonly CatalogAuditOperationStation[];
}): CatalogAuditReport {
  const operationStationsById = new Map(
    (input.operationStations ?? []).map((s) => [s.id, s] as const),
  );

  const warnings: CatalogAuditFinding[] = [];
  const errors: CatalogAuditFinding[] = [];
  const countsByRule: Partial<Record<CatalogAuditRuleCode, number>> = {};
  const flaggedIds = new Set<string>();

  for (const product of input.products) {
    const result = auditSingleProduct(product, operationStationsById);
    warnings.push(...result.warnings);
    errors.push(...result.errors);
    if (result.warnings.length > 0 || result.errors.length > 0) {
      flaggedIds.add(product.id);
    }
  }

  const duplicateFindings = auditDuplicateNames(input.products);
  for (const f of duplicateFindings) {
    warnings.push(f);
    flaggedIds.add(f.productId);
  }

  for (const f of [...warnings, ...errors]) {
    countsByRule[f.rule] = (countsByRule[f.rule] ?? 0) + 1;
  }

  const activeProducts = input.products.filter((p) => p.active);
  const OK = activeProducts
    .filter((p) => !flaggedIds.has(p.id))
    .map((p) => ({ productId: p.id, productName: p.name }));

  return {
    ok: warnings.length === 0 && errors.length === 0,
    restaurantId: input.restaurantId,
    restaurantLabel: input.restaurantLabel,
    generatedAt: new Date().toISOString(),
    summary: {
      productsAnalyzed: input.products.length,
      activeProducts: activeProducts.length,
      productsOnMenu: input.products.filter(
        (p) => p.active && p.visibleOnMenu !== false,
      ).length,
      cleanProducts: OK.length,
      warningsCount: warnings.length,
      errorsCount: errors.length,
      countsByRule,
    },
    OK,
    WARNINGS: warnings,
    ERRORS: errors,
  };
}

function loadEnvFromDotLocal(): void {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const envPath = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch {
    // CLI opcional sin .env.local
  }
}

/**
 * Carga catálogo desde Firestore Admin y ejecuta la auditoría (read-only).
 */
export async function runCatalogIntegrityAuditFromFirestoreAdmin(
  restaurantId: string,
): Promise<CatalogAuditReport> {
  loadEnvFromDotLocal();
  const { getHostlyFirestore } = await import("@/lib/firebase/admin");
  const db = getHostlyFirestore();
  if (!db) {
    throw new Error("Firestore Admin no configurado");
  }

  const rid = restaurantId.trim();
  const [prodSnap, opSnap, restSnap] = await Promise.all([
    db.collection("restaurants").doc(rid).collection("products").get(),
    db.collection("restaurants").doc(rid).collection("operationStations").get(),
    db.collection("restaurants").doc(rid).get(),
  ]);

  const restData = restSnap.data() as Record<string, unknown> | undefined;
  const restaurantLabel =
    readTrimmed(restData?.name) ??
    readTrimmed(restData?.nombre) ??
    rid;

  const products = prodSnap.docs.map((d) =>
    parseCatalogAuditProduct(d.id, d.data() as Record<string, unknown>),
  );

  const operationStations: CatalogAuditOperationStation[] = opSnap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      const type = data.type;
      if (!isOperationStationType(type)) return null;
      return {
        id: d.id,
        name: readTrimmed(data.name) ?? d.id,
        type,
        active: data.active !== false,
      };
    })
    .filter((s): s is CatalogAuditOperationStation => s != null);

  return runCatalogIntegrityAudit({
    restaurantId: rid,
    restaurantLabel,
    products,
    operationStations,
  });
}

/** Descubre restaurantes con productos vía collectionGroup. */
export async function listRestaurantIdsWithCatalogAdmin(): Promise<
  Array<{ restaurantId: string; productCount: number }>
> {
  loadEnvFromDotLocal();
  const { getHostlyFirestore } = await import("@/lib/firebase/admin");
  const db = getHostlyFirestore();
  if (!db) {
    throw new Error("Firestore Admin no configurado");
  }

  const cg = await db.collectionGroup("products").get();
  const counts = new Map<string, number>();
  for (const doc of cg.docs) {
    const m = doc.ref.path.match(/^restaurants\/([^/]+)\/products\//);
    if (!m) continue;
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([restaurantId, productCount]) => ({ restaurantId, productCount }))
    .sort((a, b) => b.productCount - a.productCount);
}
