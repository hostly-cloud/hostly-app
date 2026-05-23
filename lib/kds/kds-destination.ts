import { isBarItem, type BarClassifiable } from "@/lib/kds/bar-classification";
import {
  readStationFieldsFromFirestoreRecord,
  type OrderLineStation,
} from "@/lib/kds/order-line-station";

export type KdsDestination = "kitchen" | "bar" | "cocktail" | "none";

const COCKTAIL_HEURISTIC_TERMS = [
  "cocktail",
  "cocktails",
  "coctel",
  "cocteles",
  "cocteleria",
  "mojito",
  "margarita",
  "daiquiri",
  "spritz",
  "negroni",
  "martini",
] as const;

function normalizeHeuristicText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Fallback legacy: categoría/nombre con señales claras de cóctel (conservador). */
export function isCocktailItemHeuristic(
  item: KdsRoutableItem | null | undefined,
): boolean {
  if (!item) return false;
  const parts: string[] = [];
  for (const key of [
    "categoria",
    "category",
    "categoryName",
    "name",
    "nombre",
  ] as const) {
    const v = item[key];
    if (typeof v === "string" && v.trim()) parts.push(v);
  }
  if (parts.length === 0) return false;
  const blob = normalizeHeuristicText(parts.join(" "));
  if (!blob) return false;

  for (const term of COCKTAIL_HEURISTIC_TERMS) {
    if (blob.includes(term)) return true;
  }
  if (/\bsour\b/.test(blob) && (blob.includes("whiskey") || blob.includes("pisco"))) {
    return true;
  }
  return false;
}

/** Ítem enriquecido desde `orders.items[]` / `orderItems` (fase 1+2). */
export type KdsRoutableItem = BarClassifiable & {
  station?: unknown;
  preparationArea?: unknown;
  operationStationId?: unknown;
  operationStationName?: unknown;
  name?: unknown;
  nombre?: unknown;
};

function stationToDestination(
  station: OrderLineStation | undefined,
): KdsDestination | null {
  if (!station) return null;
  if (station === "none") return "none";
  if (station === "kitchen") return "kitchen";
  if (station === "bar") return "bar";
  if (station === "cocktail") return "cocktail";
  return null;
}

function readStationFieldsFromKdsItem(
  item: KdsRoutableItem,
): ReturnType<typeof readStationFieldsFromFirestoreRecord> {
  return readStationFieldsFromFirestoreRecord({
    station: item.station,
    preparationArea: item.preparationArea,
  });
}

/**
 * Destino KDS: station/preparationArea primero; si faltan, heurística cóctel → bar → cocina.
 */
export function resolveKdsDestination(
  item: KdsRoutableItem | null | undefined,
): KdsDestination {
  if (!item) return "kitchen";

  const fields = readStationFieldsFromKdsItem(item);
  const fromStation = stationToDestination(fields.station);
  if (fromStation) return fromStation;

  if (isCocktailItemHeuristic(item)) return "cocktail";
  if (isBarItem(item)) return "bar";
  return "kitchen";
}

export function isKdsKitchenDestination(
  destination: KdsDestination,
): boolean {
  return destination === "kitchen";
}

export function isKdsBarBoardDestination(
  destination: KdsDestination,
): boolean {
  return destination === "bar";
}

export function isKdsCocktailBoardDestination(
  destination: KdsDestination,
): boolean {
  return destination === "cocktail";
}
