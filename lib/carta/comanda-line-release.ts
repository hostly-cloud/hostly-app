import { mapStationToPreparationArea } from "@/lib/carta/map-station-to-preparation-area";
import {
  resolveKdsDestination,
  type KdsDestination,
  type KdsRoutableItem,
} from "@/lib/kds/kds-destination";
import {
  resolveStationFieldsForCartLine,
  type OrderLinePreparationArea,
  type OrderLineStation,
} from "@/lib/kds/order-line-station";
import { deriveLegacyStationFromOperationStation } from "@/lib/operacion/product-operation-station";
import { resolveEffectiveComandaLineCourse } from "@/lib/carta/comanda-line-course";
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
  | "march_primeros"
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

function isPendingReleaseLine(line: ComandaReleaseLine): boolean {
  return (line.status ?? "").trim().toLowerCase() === "pending";
}

function isPendingKitchenReleaseLine(line: ComandaReleaseLine): boolean {
  if (!isPendingReleaseLine(line)) return false;
  return resolveComandaLineKdsDestination(line) === "kitchen";
}

function isPendingDrinkReleaseLine(line: ComandaReleaseLine): boolean {
  if (!isPendingReleaseLine(line)) return false;
  const dest = resolveComandaLineKdsDestination(line);
  return dest === "bar" || dest === "cocktail";
}

function isKitchenReleaseLine(line: ComandaReleaseLine): boolean {
  return resolveComandaLineKdsDestination(line) === "kitchen";
}

function normalizeReleaseLineStatus(status: string | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

/** Cocina ya liberada a producción (Comanda o Marchar). */
const KITCHEN_RELEASED_STATUSES = new Set([
  "sent",
  "preparing",
  "prepared",
  "ready",
  "served",
]);

/**
 * La mesa ya inició servicio de cocina: alguna línea cocina está enviada/marchada.
 */
export function hasKitchenPassAlreadyReleased(
  lines: ReadonlyArray<ComandaReleaseLine>,
): boolean {
  for (const line of lines) {
    if (!isKitchenReleaseLine(line)) continue;
    const st = normalizeReleaseLineStatus(line.status);
    if (st === "cancelled") continue;
    if (KITCHEN_RELEASED_STATUSES.has(st)) return true;
  }
  return false;
}

/** Pase de cocina pending más bajo (1–4) en la mesa; null si no hay cocina pending. */
export function resolveLowestPendingKitchenCourse(
  lines: ReadonlyArray<ComandaReleaseLine>,
): number | null {
  let min: number | null = null;
  for (const line of lines) {
    if (!isPendingKitchenReleaseLine(line)) continue;
    const course = resolveEffectiveComandaLineCourse(line) ?? 1;
    if (min == null || course < min) min = course;
  }
  return min;
}

function resolveComandaReleaseLineId(
  line: ComandaReleaseLine & { id?: string },
): string {
  return typeof line.id === "string" ? line.id.trim() : "";
}

/**
 * Al pulsar Comanda:
 * - Bebidas/cóctel pending: siempre.
 * - Cocina sin servicio iniciado: primer pase pending más bajo (puede ser 1–4).
 * - Cocina con servicio iniciado: solo entrantes (pase 1) pending; 2–4 → Marchar.
 */
export function selectLinesToReleaseOnComanda(
  lines: ReadonlyArray<ComandaReleaseLine & { id?: string }>,
): Array<ComandaReleaseLine & { id?: string }> {
  const pending = lines.filter(isPendingReleaseLine);
  if (pending.length === 0) return [];

  const kitchenServiceStarted = hasKitchenPassAlreadyReleased(lines);
  const lowestKitchenCourse = resolveLowestPendingKitchenCourse(pending);
  const selected: Array<ComandaReleaseLine & { id?: string }> = [];

  for (const line of pending) {
    if (isPendingDrinkReleaseLine(line)) {
      selected.push(line);
      continue;
    }
    if (!isPendingKitchenReleaseLine(line)) continue;

    const course = resolveEffectiveComandaLineCourse(line) ?? 1;

    if (kitchenServiceStarted) {
      if (course === 1) selected.push(line);
      continue;
    }

    if (lowestKitchenCourse != null && course === lowestKitchenCourse) {
      selected.push(line);
    }
  }

  return selected;
}

export function hasLinesToReleaseOnComanda(
  lines: ReadonlyArray<ComandaReleaseLine & { id?: string }>,
): boolean {
  return selectLinesToReleaseOnComanda(lines).length > 0;
}

/**
 * @deprecated Preferir `selectLinesToReleaseOnComanda(allLines)` con el pedido completo.
 * Con una sola línea en `allLines` equivale a “¿esta línea iría en Comanda?”.
 */
export function shouldAutoReleaseLineOnComanda(
  line: ComandaReleaseLine & { id?: string },
  allLines?: ReadonlyArray<ComandaReleaseLine & { id?: string }>,
): boolean {
  const pool = allLines ?? [line];
  const lineId = resolveComandaReleaseLineId(line);
  const selected = selectLinesToReleaseOnComanda(pool);
  if (lineId) {
    return selected.some((row) => resolveComandaReleaseLineId(row) === lineId);
  }
  return selected.includes(line);
}

/** Marchar primeros: course 2 (Primeros) pending. */
export function isPendingMarchPrimeroLine(line: ComandaReleaseLine): boolean {
  if (line.status !== "pending") return false;
  return resolveEffectiveComandaLineCourse(line) === 2;
}

/** Marchar segundos: course 3 (Segundos) pending. */
export function isPendingMarchSegundosLine(line: ComandaReleaseLine): boolean {
  if (line.status !== "pending") return false;
  return resolveEffectiveComandaLineCourse(line) === 3;
}

/** Marchar postres: course 4 pending. */
export function isPendingMarchPostresLine(line: ComandaReleaseLine): boolean {
  if (line.status !== "pending") return false;
  return resolveEffectiveComandaLineCourse(line) === 4;
}

/** Pedido en borrador TPV (`orders.status === "open"`): pending no va a Cocina. */
export function isComandaOrderStatusOpen(
  orderStatus: string | undefined,
): boolean {
  return (orderStatus?.trim().toLowerCase() ?? "") === "open";
}

/**
 * Cocina KDS: pending retenido tras Comanda (curso 2–4), solo lectura UI.
 * No modifica Firestore ni políticas de liberación.
 */
export function isKitchenLineWaitingMarch(
  item: KdsRoutableItem & { status?: string; course?: unknown },
  orderStatus: string | undefined,
): boolean {
  const status = (item.status ?? "").trim().toLowerCase();
  if (status !== "pending") return false;
  if (isComandaOrderStatusOpen(orderStatus)) return false;
  if (resolveKdsDestination(item) !== "kitchen") return false;
  const course = normalizeComandaCourseValue(item.course) ?? 1;
  return course >= 2 && course <= 4;
}

/**
 * TPV: pending cocina curso 2–4 tras al menos un envío (Comanda/Marchar).
 * Solo presentación; no altera estados ni liberación.
 */
export function isTpvComandaLineHeldForMarch(
  line: ComandaReleaseLine,
  comandaAlreadyIssued: boolean,
): boolean {
  if (!comandaAlreadyIssued) return false;
  if (line.status !== "pending") return false;
  if (resolveComandaLineKdsDestination(line) !== "kitchen") return false;
  const course = resolveEffectiveComandaLineCourse(line) ?? 1;
  return course >= 2 && course <= 4;
}
