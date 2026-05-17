import type { Reservation } from "@/lib/firestore/reservations";

function toMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  if (!m) return 0;
  const hh = Number.parseInt(m[1] ?? "0", 10);
  const mm = Number.parseInt(m[2] ?? "0", 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

export type ReservationPressureForMap = {
  type: "upcoming" | "late";
  time: string;
  customerName?: string;
};

/**
 * Misma heurística que el TPV (`reservationPressureByTableId` en Carta):
 * retrasadas primero; si no, próximas en ventana [ahora, ahora+90].
 */
export function buildReservationPressureByTableIdForMap(
  reservations: Reservation[],
  resolveMainTableId: (id: string) => string,
  opts: {
    /** Si false (p. ej. día distinto a “hoy servicio”), mapa vacío. */
    applyPressure: boolean;
    referenceMinutesFromMidnight: number;
  },
): Record<string, ReservationPressureForMap> {
  if (!opts.applyPressure) return {};
  const by: Record<string, ReservationPressureForMap> = {};
  const nowMin = opts.referenceMinutesFromMidnight;

  type Row = Reservation & {
    _min: number;
    _type: "upcoming" | "late" | null;
  };
  const rows: Row[] = reservations
    .filter((r) => r.status === "booked")
    .map((r) => {
      const m = toMinutes(r.time);
      let t: Row["_type"] = null;
      if (m <= nowMin - 15) t = "late";
      else if (m >= nowMin && m <= nowMin + 90) t = "upcoming";
      return Object.assign({}, r, { _min: m, _type: t });
    })
    .filter((r) => r._type !== null) as Row[];

  const groups: Record<string, Row[]> = {};
  for (const r of rows) {
    const tid = typeof r.tableId === "string" ? r.tableId.trim() : "";
    if (!tid) continue;
    const mapKey = String(resolveMainTableId(tid) ?? tid).trim();
    if (!mapKey) continue;
    (groups[mapKey] ||= []).push(r);
  }

  for (const tableId of Object.keys(groups)) {
    const list = groups[tableId] ?? [];
    const late = list.filter((r) => r._type === "late");
    if (late.length > 0) {
      late.sort((a, b) => a._min - b._min);
      const chosen = late[0]!;
      by[tableId] = {
        type: "late",
        time: chosen.time,
        customerName: chosen.customerName,
      };
      continue;
    }
    const upcoming = list.filter((r) => r._type === "upcoming");
    if (upcoming.length > 0) {
      upcoming.sort((a, b) => a._min - b._min);
      const chosen = upcoming[0]!;
      by[tableId] = {
        type: "upcoming",
        time: chosen.time,
        customerName: chosen.customerName,
      };
    }
  }
  return by;
}

/**
 * Reserva “principal” a mostrar en overlay del plano (hostess): prioridad operativa.
 */
function pickDisplayReservationForTable(
  list: Reservation[],
  referenceMinutesFromMidnight: number,
): Reservation | null {
  if (list.length === 0) return null;
  const nowMin = referenceMinutesFromMidnight;

  const seated = list.filter((r) => r.status === "seated");
  if (seated.length > 0) {
    seated.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    return seated[0] ?? null;
  }

  const booked = list.filter((r) => r.status === "booked");
  if (booked.length > 0) {
    booked.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    let chosen: Reservation | null = null;
    for (const r of booked) {
      if (toMinutes(r.time) >= nowMin) {
        chosen = r;
        break;
      }
    }
    chosen = chosen ?? booked[0] ?? null;
    return chosen;
  }

  const noShow = list.filter((r) => r.status === "no_show");
  if (noShow.length > 0) {
    noShow.sort((a, b) => toMinutes(b.time) - toMinutes(a.time));
    return noShow[0] ?? null;
  }

  const completed = list.filter((r) => r.status === "completed");
  if (completed.length > 0) {
    completed.sort((a, b) => toMinutes(b.time) - toMinutes(a.time));
    return completed[0] ?? null;
  }

  return null;
}

/**
 * Mapa mesa principal (ficha visible) → reserva representativa para overlays del plano vivo.
 * Incluye booked / seated / no_show / completed. Omite canceladas.
 */
export function buildDisplayReservationByTableIdForMap(
  reservations: Reservation[],
  resolveMainTableId: (id: string) => string,
  opts: { referenceMinutesFromMidnight: number },
): Record<string, Reservation> {
  const filtered = reservations.filter(
    (r) =>
      r.status !== "cancelled" &&
      typeof r.tableId === "string" &&
      r.tableId.trim() !== "",
  );

  const groups: Record<string, Reservation[]> = {};
  for (const r of filtered) {
    const tid = r.tableId!.trim();
    const mapKey = String(resolveMainTableId(tid) ?? tid).trim();
    if (!mapKey) continue;
    (groups[mapKey] ||= []).push(r);
  }

  const by: Record<string, Reservation> = {};
  for (const tableId of Object.keys(groups)) {
    const list = groups[tableId] ?? [];
    const chosen = pickDisplayReservationForTable(
      list,
      opts.referenceMinutesFromMidnight,
    );
    if (chosen) by[tableId] = chosen;
  }
  return by;
}

/** Siguiente reserva booked en la mesa (para chip bajo ocupación real). */
export function nextBookedReservationForMainTable(
  reservations: Reservation[],
  mainTableId: string,
  resolveMainTableId: (id: string) => string,
  opts: { referenceMinutesFromMidnight: number },
): Reservation | null {
  const main = String(mainTableId ?? "").trim();
  if (!main) return null;
  const nowMin = opts.referenceMinutesFromMidnight;
  const list = reservations.filter((r) => {
    if (r.status !== "booked") return false;
    const tid = typeof r.tableId === "string" ? r.tableId.trim() : "";
    if (!tid) return false;
    const k = String(resolveMainTableId(tid) ?? tid).trim();
    return k === main;
  });
  if (list.length === 0) return null;
  list.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  for (const r of list) {
    if (toMinutes(r.time) >= nowMin) return r;
  }
  return list[0] ?? null;
}
