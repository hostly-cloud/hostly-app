import type { BoardItem } from "@/components/kds/order-items-board";
import {
  isKdsBarBoardDestination,
  isKdsCocktailBoardDestination,
  isKdsKitchenDestination,
  resolveKdsDestination,
} from "@/lib/kds/kds-destination";

/** Valor del selector: todas las estaciones del tipo de la vista. */
export const KDS_OPERATION_STATION_FILTER_ALL = "all";

export type KdsOperationStationFilterScope = "kitchen" | "bar" | "cocktail";

export type KdsOperationStationFilterableItem = Pick<
  BoardItem,
  "operationStationId" | "station" | "preparationArea" | "categoria" | "category" | "categoryName" | "name"
>;

export function kdsOperationStationAllLabel(
  scope: KdsOperationStationFilterScope,
): string {
  if (scope === "kitchen") return "Todas las cocinas";
  if (scope === "bar") return "Todas las barras";
  return "Todas las coctelerías";
}

export function matchesKdsLegacyDestination(
  item: KdsOperationStationFilterableItem,
  scope: KdsOperationStationFilterScope,
): boolean {
  const dest = resolveKdsDestination(item);
  if (scope === "kitchen") return isKdsKitchenDestination(dest);
  if (scope === "cocktail") return isKdsCocktailBoardDestination(dest);
  return isKdsBarBoardDestination(dest);
}

/**
 * Filtra por estación operativa concreta.
 * Líneas sin `operationStationId` solo pasan cuando selectedId === "all".
 */
export function matchesKdsOperationStationSelection(
  item: Pick<BoardItem, "operationStationId">,
  selectedOperationStationId: string,
): boolean {
  if (selectedOperationStationId === KDS_OPERATION_STATION_FILTER_ALL) {
    return true;
  }
  const itemStationId = item.operationStationId?.trim();
  if (!itemStationId) return false;
  return itemStationId === selectedOperationStationId.trim();
}

export function matchesKdsBoardItemFilter(
  item: KdsOperationStationFilterableItem,
  scope: KdsOperationStationFilterScope,
  selectedOperationStationId: string,
): boolean {
  if (!matchesKdsLegacyDestination(item, scope)) return false;
  return matchesKdsOperationStationSelection(item, selectedOperationStationId);
}
