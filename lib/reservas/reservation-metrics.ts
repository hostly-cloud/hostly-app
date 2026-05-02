import type { Reservation, ReservationStatus } from "@/lib/firestore/reservations";

export type ReservationDayMetrics = {
  booked: number;
  seated: number;
  completed: number;
  noShow: number;
  cancelled: number;
  paxPlanned: number;
  paxSeated: number;
  paxCompleted: number;
};

function safePartySize(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function computeReservationDayMetrics(
  reservations: Reservation[],
  dateYmd: string,
): ReservationDayMetrics {
  const d = String(dateYmd ?? "").trim();
  const out: ReservationDayMetrics = {
    booked: 0,
    seated: 0,
    completed: 0,
    noShow: 0,
    cancelled: 0,
    paxPlanned: 0,
    paxSeated: 0,
    paxCompleted: 0,
  };

  for (const r of reservations) {
    if (!r || r.date !== d) continue;
    const s: ReservationStatus = r.status;
    const pax = safePartySize(r.partySize);
    if (s === "booked") {
      out.booked++;
      out.paxPlanned += pax;
    } else if (s === "seated") {
      out.seated++;
      out.paxPlanned += pax;
      out.paxSeated += pax;
    } else if (s === "completed") {
      out.completed++;
      out.paxCompleted += pax;
    } else if (s === "no_show") {
      out.noShow++;
    } else if (s === "cancelled") {
      out.cancelled++;
    }
  }

  return out;
}

export function computeReservationRangeMetrics(
  reservations: Reservation[],
  dateFrom: string,
  dateTo: string,
): ReservationDayMetrics {
  const from = String(dateFrom ?? "").trim();
  const to = String(dateTo ?? "").trim();
  const out: ReservationDayMetrics = {
    booked: 0,
    seated: 0,
    completed: 0,
    noShow: 0,
    cancelled: 0,
    paxPlanned: 0,
    paxSeated: 0,
    paxCompleted: 0,
  };

  if (!from || !to) return out;
  const lo = from <= to ? from : to;
  const hi = from <= to ? to : from;

  for (const r of reservations) {
    if (!r) continue;
    const d = r.date;
    if (typeof d !== "string" || d < lo || d > hi) continue;
    const s: ReservationStatus = r.status;
    const pax = safePartySize(r.partySize);
    if (s === "booked") {
      out.booked++;
      out.paxPlanned += pax;
    } else if (s === "seated") {
      out.seated++;
      out.paxPlanned += pax;
      out.paxSeated += pax;
    } else if (s === "completed") {
      out.completed++;
      out.paxCompleted += pax;
    } else if (s === "no_show") {
      out.noShow++;
    } else if (s === "cancelled") {
      out.cancelled++;
    }
  }

  return out;
}

