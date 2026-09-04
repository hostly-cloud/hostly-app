import type { Reservation } from "@/lib/firestore/reservations";
import type { Table } from "@/lib/firestore/tables";

export const DEFAULT_RESERVATION_DURATION_MINUTES = 120;
export const DEFAULT_RESERVATION_TURNOVER_MINUTES = 15;

export type ReservationConflict = {
  reservation: Reservation;
  overlapStartMinutes: number;
  overlapEndMinutes: number;
};

export function reservationTimeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  if (!match) return null;
  const hours = Number.parseInt(match[1] ?? "", 10);
  const minutes = Number.parseInt(match[2] ?? "", 10);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

export function reservationBlocksTable(reservation: Reservation): boolean {
  return reservation.status === "booked" || reservation.status === "seated";
}

function normalizedDuration(value: unknown): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 15) {
    return DEFAULT_RESERVATION_DURATION_MINUTES;
  }
  return Math.min(parsed, 24 * 60);
}

export function findReservationTableConflict(params: {
  reservations: readonly Reservation[];
  tableId: string;
  date: string;
  time: string;
  durationMinutes?: number;
  turnoverMinutes?: number;
  excludeReservationId?: string | null;
}): ReservationConflict | null {
  const tableId = String(params.tableId ?? "").trim();
  const date = String(params.date ?? "").trim();
  const start = reservationTimeToMinutes(params.time);
  if (!tableId || !date || start == null) return null;

  const duration = normalizedDuration(params.durationMinutes);
  const turnover = Math.max(0, Math.round(Number(params.turnoverMinutes) || 0));
  const candidateStart = start;
  const candidateEnd = start + duration + turnover;
  const excludedId = String(params.excludeReservationId ?? "").trim();

  for (const reservation of params.reservations) {
    if (excludedId && reservation.id === excludedId) continue;
    if (!reservationBlocksTable(reservation)) continue;
    if (reservation.date !== date) continue;
    if (String(reservation.tableId ?? "").trim() !== tableId) continue;

    const existingStart = reservationTimeToMinutes(reservation.time);
    if (existingStart == null) continue;
    const existingDuration = normalizedDuration(reservation.durationMinutes);
    const existingEnd = existingStart + existingDuration + turnover;

    const overlapStart = Math.max(candidateStart, existingStart);
    const overlapEnd = Math.min(candidateEnd, existingEnd);
    if (overlapStart < overlapEnd) {
      return {
        reservation,
        overlapStartMinutes: overlapStart,
        overlapEndMinutes: overlapEnd,
      };
    }
  }

  return null;
}

export function tableCapacityForReservation(table: Pick<Table, "seats">): number {
  const seats = Math.round(Number(table.seats));
  return Number.isFinite(seats) && seats > 0 ? seats : 0;
}

export function tableCanSeatParty(
  table: Pick<Table, "seats">,
  partySize: number,
): boolean {
  const requested = Math.max(1, Math.round(Number(partySize) || 0));
  const capacity = tableCapacityForReservation(table);
  return capacity <= 0 || capacity >= requested;
}

export function reservationAssignmentLabel(
  reservation: Pick<Reservation, "status" | "tableId">,
): "Pendiente de mesa" | null {
  if (reservation.status !== "booked") return null;
  return String(reservation.tableId ?? "").trim() ? null : "Pendiente de mesa";
}
