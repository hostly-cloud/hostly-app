export const RESERVATION_DEFAULT_DURATION_MINUTES = 120;
export const RESERVATION_MIN_DURATION_MINUTES = 45;
export const RESERVATION_MAX_DURATION_MINUTES = 360;

export type OperationalReservationStatus =
  | "pending"
  | "booked"
  | "seated"
  | "completed"
  | "no_show"
  | "cancelled";

export type OperationalReservation = {
  id: string;
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  date: string;
  time: string;
  partySize: number;
  status: OperationalReservationStatus;
  durationMinutes?: number;
  tableId?: string;
  tableLabel?: string;
  floorPlanId?: string;
  floorName?: string;
  zoneId?: string;
  zoneName?: string;
  notes?: string;
  allergies?: string;
  preferences?: string;
  occasion?: string;
  createdAt?: number;
  updatedAt?: number;
  confirmedAt?: number;
  seatedAt?: number;
  completedAt?: number;
  cancelledAt?: number;
  noShowAt?: number;
};

export type ReservationTableCandidate = {
  id: string;
  name: string;
  seats: number;
  type?: string;
  isActive?: boolean;
  restaurantId?: string;
  floorPlanId?: string;
  zoneName?: string;
  zone?: string;
};

export type ReservationTableEligibility = {
  eligible: boolean;
  reason: "available" | "inactive" | "not_table" | "capacity" | "conflict";
  conflictReservationId?: string;
};

export type ReservationTableSuggestion = {
  tableId: string;
  tableName: string;
  seats: number;
  spareSeats: number;
  floorPlanId?: string;
  zoneName?: string;
};

export type ReservationAttention = "upcoming" | "delayed" | "release_soon" | null;

export function normalizeOperationalReservationStatus(
  value: unknown,
): OperationalReservationStatus {
  if (
    value === "pending" ||
    value === "booked" ||
    value === "seated" ||
    value === "completed" ||
    value === "no_show" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "booked";
}

export function normalizeReservationDuration(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return RESERVATION_DEFAULT_DURATION_MINUTES;
  return Math.min(
    RESERVATION_MAX_DURATION_MINUTES,
    Math.max(RESERVATION_MIN_DURATION_MINUTES, Math.round(parsed)),
  );
}

export function reservationTimeToMinutes(value: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
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

export function reservationBlocksTable(status: OperationalReservationStatus): boolean {
  return status === "pending" || status === "booked" || status === "seated";
}

export function reservationWindowsOverlap(args: {
  firstStartMinutes: number;
  firstDurationMinutes: number;
  secondStartMinutes: number;
  secondDurationMinutes: number;
}): boolean {
  const firstEnd = args.firstStartMinutes + normalizeReservationDuration(args.firstDurationMinutes);
  const secondEnd = args.secondStartMinutes + normalizeReservationDuration(args.secondDurationMinutes);
  return args.firstStartMinutes < secondEnd && args.secondStartMinutes < firstEnd;
}

export function findReservationTableConflict(args: {
  reservations: readonly OperationalReservation[];
  tableId: string;
  date: string;
  time: string;
  durationMinutes?: number;
  excludeReservationId?: string | null;
}): OperationalReservation | null {
  const tableId = args.tableId.trim();
  const date = args.date.trim();
  const start = reservationTimeToMinutes(args.time);
  if (!tableId || !date || start == null) return null;
  const duration = normalizeReservationDuration(args.durationMinutes);
  const excludeId = args.excludeReservationId?.trim() ?? "";

  for (const reservation of args.reservations) {
    if (excludeId && reservation.id === excludeId) continue;
    if (!reservationBlocksTable(reservation.status)) continue;
    if (reservation.date !== date) continue;
    if ((reservation.tableId ?? "").trim() !== tableId) continue;
    const otherStart = reservationTimeToMinutes(reservation.time);
    if (otherStart == null) continue;
    if (
      reservationWindowsOverlap({
        firstStartMinutes: start,
        firstDurationMinutes: duration,
        secondStartMinutes: otherStart,
        secondDurationMinutes: normalizeReservationDuration(reservation.durationMinutes),
      })
    ) {
      return reservation;
    }
  }

  return null;
}

export function getReservationTableEligibility(args: {
  table: ReservationTableCandidate;
  reservations: readonly OperationalReservation[];
  partySize: number;
  date: string;
  time: string;
  durationMinutes?: number;
  excludeReservationId?: string | null;
}): ReservationTableEligibility {
  if (args.table.isActive === false) return { eligible: false, reason: "inactive" };
  if (args.table.type && args.table.type !== "table") {
    return { eligible: false, reason: "not_table" };
  }
  const partySize = Math.max(1, Math.round(Number(args.partySize) || 0));
  const seats = Math.max(0, Math.round(Number(args.table.seats) || 0));
  if (seats < partySize) return { eligible: false, reason: "capacity" };

  const conflict = findReservationTableConflict({
    reservations: args.reservations,
    tableId: args.table.id,
    date: args.date,
    time: args.time,
    durationMinutes: args.durationMinutes,
    excludeReservationId: args.excludeReservationId,
  });
  if (conflict) {
    return {
      eligible: false,
      reason: "conflict",
      conflictReservationId: conflict.id,
    };
  }
  return { eligible: true, reason: "available" };
}

export function suggestReservationTables(args: {
  tables: readonly ReservationTableCandidate[];
  reservations: readonly OperationalReservation[];
  partySize: number;
  date: string;
  time: string;
  durationMinutes?: number;
  excludeReservationId?: string | null;
}): ReservationTableSuggestion[] {
  const partySize = Math.max(1, Math.round(Number(args.partySize) || 0));
  return args.tables
    .filter((table) =>
      getReservationTableEligibility({
        table,
        reservations: args.reservations,
        partySize,
        date: args.date,
        time: args.time,
        durationMinutes: args.durationMinutes,
        excludeReservationId: args.excludeReservationId,
      }).eligible,
    )
    .map((table) => ({
      tableId: table.id,
      tableName: table.name,
      seats: Math.max(0, Math.round(Number(table.seats) || 0)),
      spareSeats: Math.max(0, Math.round(Number(table.seats) || 0) - partySize),
      ...(table.floorPlanId ? { floorPlanId: table.floorPlanId } : {}),
      ...((table.zoneName ?? table.zone) ? { zoneName: table.zoneName ?? table.zone } : {}),
    }))
    .sort((a, b) => {
      if (a.spareSeats !== b.spareSeats) return a.spareSeats - b.spareSeats;
      if (a.seats !== b.seats) return a.seats - b.seats;
      return a.tableName.localeCompare(b.tableName, "es", { numeric: true });
    });
}

export function canTransitionReservationStatus(
  from: OperationalReservationStatus,
  to: OperationalReservationStatus,
): boolean {
  if (from === to) return true;
  if (from === "pending") return to === "booked" || to === "cancelled";
  if (from === "booked") {
    return to === "seated" || to === "no_show" || to === "cancelled";
  }
  if (from === "seated") return to === "completed";
  return false;
}

export function reservationAttention(args: {
  reservation: OperationalReservation;
  todayYmd: string;
  nowMinutes: number;
}): ReservationAttention {
  const reservation = args.reservation;
  if (reservation.date !== args.todayYmd) return null;
  const start = reservationTimeToMinutes(reservation.time);
  if (start == null) return null;

  if (reservation.status === "pending" || reservation.status === "booked") {
    if (start <= args.nowMinutes - 15) return "delayed";
    if (start >= args.nowMinutes && start <= args.nowMinutes + 90) return "upcoming";
    return null;
  }

  if (reservation.status === "seated") {
    const end = start + normalizeReservationDuration(reservation.durationMinutes);
    if (end <= args.nowMinutes + 30) return "release_soon";
  }

  return null;
}
