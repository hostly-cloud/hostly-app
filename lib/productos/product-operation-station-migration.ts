import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";
import type { ProductDocument } from "@/lib/firestore/products";
import {
  DEFAULT_OPERATION_STATION_SPECS,
  type OperationStationDocument,
} from "@/lib/operacion/operation-station-types";
import { resolveMenuFamilyOperationStationSelect } from "@/lib/productos/product-category-inheritance";

export type ProductOperationStationMigrationStatus =
  | "suggested"
  | "up_to_date"
  | "specific_preserved"
  | "unknown_preserved"
  | "no_rule";

export type ProductOperationStationMigrationPlanItem = {
  productId: string;
  productName: string;
  categoryId: string | null;
  currentOperationStationId: string | null;
  currentOperationStationName: string | null;
  suggestedOperationStationId: string | null;
  suggestedOperationStationName: string | null;
  status: ProductOperationStationMigrationStatus;
  reason: string;
};

export type ProductOperationStationMigrationSummary = {
  total: number;
  suggested: number;
  upToDate: number;
  specificPreserved: number;
  unknownPreserved: number;
  noRule: number;
};

const GENERIC_OPERATION_STATION_IDS = new Set(
  DEFAULT_OPERATION_STATION_SPECS.map((spec) => spec.id),
);

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function productName(product: ProductDocument): string {
  return product.name?.trim() || product.id;
}

/**
 * Plan seguro y sin I/O para completar routing fino en productos antiguos.
 *
 * Nunca propone reemplazar una estación específica ya elegida manualmente.
 * Solo propone cuando el producto está sin `operationStationId`, usa uno de los
 * defaults genéricos, o ya coincide con la estación heredada.
 */
export function buildProductOperationStationMigrationPlan(
  products: readonly ProductDocument[],
  cartaCategorias: readonly CartaCategoria[],
  cartaFamilias: readonly CartaFamilia[],
  operationStations: readonly OperationStationDocument[],
): ProductOperationStationMigrationPlanItem[] {
  const operationStationsById = new Map(operationStations.map((station) => [station.id, station]));

  return products.map((product) => {
    const currentId = trimmedOrNull(product.operationStationId);
    const currentName =
      trimmedOrNull(product.operationStationName) ??
      (currentId ? operationStationsById.get(currentId)?.name?.trim() || null : null);
    const categoryId = trimmedOrNull(product.categoryId);
    const suggestedId = resolveMenuFamilyOperationStationSelect(
      categoryId,
      cartaCategorias,
      cartaFamilias,
      operationStations,
    );
    const suggestedStation = suggestedId
      ? operationStationsById.get(suggestedId) ?? null
      : null;

    if (!suggestedStation) {
      if (currentId && !GENERIC_OPERATION_STATION_IDS.has(currentId)) {
        const currentKnown = operationStationsById.has(currentId);
        return {
          productId: product.id,
          productName: productName(product),
          categoryId,
          currentOperationStationId: currentId,
          currentOperationStationName: currentName,
          suggestedOperationStationId: null,
          suggestedOperationStationName: null,
          status: currentKnown ? "specific_preserved" : "unknown_preserved",
          reason: currentKnown
            ? "Estación específica existente; se preserva."
            : "Estación específica antigua o no disponible; requiere revisión manual.",
        };
      }
      return {
        productId: product.id,
        productName: productName(product),
        categoryId,
        currentOperationStationId: currentId,
        currentOperationStationName: currentName,
        suggestedOperationStationId: null,
        suggestedOperationStationName: null,
        status: "no_rule",
        reason: "La categoría/familia no define una estación operativa concreta.",
      };
    }

    if (currentId === suggestedStation.id) {
      return {
        productId: product.id,
        productName: productName(product),
        categoryId,
        currentOperationStationId: currentId,
        currentOperationStationName: currentName,
        suggestedOperationStationId: suggestedStation.id,
        suggestedOperationStationName: suggestedStation.name,
        status: "up_to_date",
        reason: "Ya coincide con la estación heredada de la familia.",
      };
    }

    if (currentId && !GENERIC_OPERATION_STATION_IDS.has(currentId)) {
      const currentKnown = operationStationsById.has(currentId);
      return {
        productId: product.id,
        productName: productName(product),
        categoryId,
        currentOperationStationId: currentId,
        currentOperationStationName: currentName,
        suggestedOperationStationId: suggestedStation.id,
        suggestedOperationStationName: suggestedStation.name,
        status: currentKnown ? "specific_preserved" : "unknown_preserved",
        reason: currentKnown
          ? "Tiene una estación específica manual; no se sobrescribe."
          : "Tiene un id de estación antiguo/no disponible; no se sobrescribe automáticamente.",
      };
    }

    return {
      productId: product.id,
      productName: productName(product),
      categoryId,
      currentOperationStationId: currentId,
      currentOperationStationName: currentName,
      suggestedOperationStationId: suggestedStation.id,
      suggestedOperationStationName: suggestedStation.name,
      status: "suggested",
      reason: currentId
        ? "Sustituye el destino genérico por la estación concreta heredada."
        : "Completa la estación concreta heredada por categoría/familia.",
    };
  });
}

export function summarizeProductOperationStationMigrationPlan(
  plan: readonly ProductOperationStationMigrationPlanItem[],
): ProductOperationStationMigrationSummary {
  const summary: ProductOperationStationMigrationSummary = {
    total: plan.length,
    suggested: 0,
    upToDate: 0,
    specificPreserved: 0,
    unknownPreserved: 0,
    noRule: 0,
  };

  for (const item of plan) {
    switch (item.status) {
      case "suggested":
        summary.suggested += 1;
        break;
      case "up_to_date":
        summary.upToDate += 1;
        break;
      case "specific_preserved":
        summary.specificPreserved += 1;
        break;
      case "unknown_preserved":
        summary.unknownPreserved += 1;
        break;
      case "no_rule":
        summary.noRule += 1;
        break;
    }
  }

  return summary;
}
