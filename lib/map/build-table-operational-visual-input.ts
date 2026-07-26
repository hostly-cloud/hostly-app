import type {
  ResolveTableOperationalVisualStateInput,
  TableOperationalReservationPressure,
} from "@/lib/map/table-operational-state";

export type TableOperationalLineLike = {
  status?: unknown;
};

/** Prioridad visual en mapa (0–3); solo render, no Firestore. */
export function computeMapVisualPriorityLevel(
  openedAtMs: number | undefined,
  mapNow: number,
  orderTotal: number | undefined,
): number {
  const minutes =
    openedAtMs != null && Number.isFinite(openedAtMs)
      ? Math.max(0, Math.floor((mapNow - openedAtMs) / 60000))
      : 0;
  const total =
    typeof orderTotal === "number" && Number.isFinite(orderTotal)
      ? orderTotal
      : 0;
  if (minutes >= 60) return 3;
  if (minutes >= 30) return 2;
  if (total > 50) return 1;
  return 0;
}

function normalizeLineStatus(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

export function countActiveOperationalLines(
  lines: readonly TableOperationalLineLike[],
): number {
  return lines.filter((line) => normalizeLineStatus(line.status) !== "cancelled")
    .length;
}

/** Solo líneas activas en estado pending (borrador sin enviar a cocina). */
export function tableHasOnlyPendingUnsentLines(
  lines: readonly TableOperationalLineLike[],
): boolean {
  const active = lines.filter(
    (line) => normalizeLineStatus(line.status) !== "cancelled",
  );
  if (active.length === 0) return false;
  return active.every((line) => normalizeLineStatus(line.status) === "pending");
}

export type BuildTableOperationalVisualInputParams = {
  busy: boolean;
  reserved: boolean;
  lines: readonly TableOperationalLineLike[];
  occupancyStartMs: number | null | undefined;
  orderOpenedAtMs: number | undefined;
  orderTotal: number | undefined;
  mapNow: number;
  readyToClose: boolean;
  reservationPressure: TableOperationalReservationPressure | undefined;
};

/**
 * Señales compartidas para el resolutor canónico del mapa TPV.
 * Borrador solo pending nunca eleva urgencia (crítica/atención/retraso).
 */
export function buildTableOperationalVisualInput(
  params: BuildTableOperationalVisualInputParams,
): ResolveTableOperationalVisualStateInput {
  const activeLineCount = countActiveOperationalLines(params.lines);
  const occupancyStartMs = params.occupancyStartMs;
  const minutesOccupied =
    occupancyStartMs != null && Number.isFinite(occupancyStartMs)
      ? Math.max(0, (params.mapNow - occupancyStartMs) / 60000)
      : 0;
  const priorityLevel = computeMapVisualPriorityLevel(
    params.orderOpenedAtMs,
    params.mapNow,
    params.orderTotal,
  );

  if (params.busy && tableHasOnlyPendingUnsentLines(params.lines)) {
    return {
      busy: true,
      reserved: params.reserved,
      isCriticalTable: false,
      priorityLevel: 0,
      readyToClose: false,
      reservationPressure: undefined,
    };
  }

  return {
    busy: params.busy,
    reserved: params.reserved,
    isCriticalTable:
      params.busy &&
      occupancyStartMs != null &&
      minutesOccupied >= 45 &&
      activeLineCount >= 8,
    priorityLevel,
    readyToClose: params.readyToClose,
    reservationPressure: params.reservationPressure,
  };
}
