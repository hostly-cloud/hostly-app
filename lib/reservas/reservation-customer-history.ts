import type { Reservation } from "@/lib/firestore/reservations";

export type ReservationCustomerHistory = {
  key: string;
  displayName: string;
  phone: string;
  email: string;
  reservations: number;
  completed: number;
  noShows: number;
  cancelled: number;
  future: number;
  totalPax: number;
  lastReservation: Reservation | null;
  nextReservation: Reservation | null;
  allergies: string;
  preferences: string;
  occasion: string;
  notes: string;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizePhone(value: unknown): string {
  return normalizeText(value).replace(/[^\d+]/g, "").replace(/^00/, "+");
}

function normalizeName(value: unknown): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-ES")
    .replace(/\s+/g, " ");
}

export function reservationCustomerKey(
  reservation: Pick<Reservation, "customerPhone" | "customerEmail" | "customerName">,
): string {
  const phone = normalizePhone(reservation.customerPhone);
  if (phone) return `phone:${phone}`;
  const email = normalizeText(reservation.customerEmail).toLocaleLowerCase("es-ES");
  if (email) return `email:${email}`;
  return `name:${normalizeName(reservation.customerName)}`;
}

function compareReservationMoment(a: Reservation, b: Reservation): number {
  return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
}

export function buildReservationCustomerHistory(
  reservations: readonly Reservation[],
  todayYmd: string,
): ReservationCustomerHistory[] {
  const groups = new Map<string, Reservation[]>();
  for (const reservation of reservations) {
    const key = reservationCustomerKey(reservation);
    if (key === "name:") continue;
    const current = groups.get(key) ?? [];
    current.push(reservation);
    groups.set(key, current);
  }

  const result: ReservationCustomerHistory[] = [];
  for (const [key, rows] of groups) {
    const ordered = [...rows].sort(compareReservationMoment);
    const pastOrToday = ordered.filter((row) => row.date <= todayYmd);
    const futureRows = ordered.filter(
      (row) => row.date > todayYmd && row.status !== "cancelled" && row.status !== "no_show",
    );
    const latest = [...ordered].reverse().find(Boolean) ?? null;
    const latestWithAllergies = [...ordered].reverse().find((row) => row.allergies?.trim());
    const latestWithPreferences = [...ordered].reverse().find((row) => row.preferences?.trim());
    const latestWithOccasion = [...ordered].reverse().find((row) => row.occasion?.trim());
    const latestWithNotes = [...ordered].reverse().find((row) => row.notes?.trim());

    result.push({
      key,
      displayName: latest?.customerName?.trim() || "Cliente",
      phone: latest?.customerPhone?.trim() || "",
      email: latest?.customerEmail?.trim() || "",
      reservations: ordered.length,
      completed: ordered.filter((row) => row.status === "completed").length,
      noShows: ordered.filter((row) => row.status === "no_show").length,
      cancelled: ordered.filter((row) => row.status === "cancelled").length,
      future: futureRows.length,
      totalPax: ordered.reduce((sum, row) => sum + Math.max(0, row.partySize || 0), 0),
      lastReservation: pastOrToday.length ? pastOrToday[pastOrToday.length - 1] ?? null : null,
      nextReservation: futureRows[0] ?? null,
      allergies: latestWithAllergies?.allergies?.trim() || "",
      preferences: latestWithPreferences?.preferences?.trim() || "",
      occasion: latestWithOccasion?.occasion?.trim() || "",
      notes: latestWithNotes?.notes?.trim() || "",
    });
  }

  return result.sort((a, b) => {
    if (a.noShows !== b.noShows) return b.noShows - a.noShows;
    const aNext = a.nextReservation ? `${a.nextReservation.date}T${a.nextReservation.time}` : "9999";
    const bNext = b.nextReservation ? `${b.nextReservation.date}T${b.nextReservation.time}` : "9999";
    if (aNext !== bNext) return aNext.localeCompare(bNext);
    return b.reservations - a.reservations;
  });
}
