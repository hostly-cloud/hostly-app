import type { Reservation } from "@/lib/firestore/reservations";

function toMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  if (!m) return 0;
  const hh = Number.parseInt(m[1] ?? "0", 10);
  const mm = Number.parseInt(m[2] ?? "0", 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

/**
 * Agrupa reservas por ficha visible del mapa (mesa principal del grupo) y elige
 * una representativa por mesa, misma heurística que el TPV (`>= nowMin` o la primera).
 *
 * Para el plano vivo de Reservas (overlays con seated / completed / no_show), ver
 * `buildDisplayReservationByTableIdForMap` en `reservation-map-live.ts`.
 */
export function buildReservedByTableIdForMap(
  reservations: Reservation[],
  resolveMainTableId: (id: string) => string,
  opts: {
    excludeReservationIds?: Iterable<string>;
    /** Minutos desde medianoche; p.ej. para días futuros usar `0`. */
    referenceMinutesFromMidnight: number;
  },
): Record<string, Reservation> {
  const exclude = new Set<string>();
  if (opts.excludeReservationIds) {
    for (const raw of opts.excludeReservationIds) {
      const id = String(raw ?? "").trim();
      if (id) exclude.add(id);
    }
  }

  const filtered = reservations.filter(
    (r) =>
      !exclude.has(r.id) &&
      (r.status === "booked" || r.status === "seated") &&
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
  const nowMin = opts.referenceMinutesFromMidnight;

  for (const tableId of Object.keys(groups)) {
    const list = groups[tableId] ?? [];
    list.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    let chosen: Reservation | null = null;
    for (const r of list) {
      if (toMinutes(r.time) >= nowMin) {
        chosen = r;
        break;
      }
    }
    chosen = chosen ?? list[0] ?? null;
    if (chosen) by[tableId] = chosen;
  }
  return by;
}
