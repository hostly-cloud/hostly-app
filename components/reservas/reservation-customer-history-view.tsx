"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  listenReservationsForRange,
  type Reservation,
} from "@/lib/firestore/reservations";
import { buildReservationCustomerHistory } from "@/lib/reservas/reservation-customer-history";

const EMPTY_RESERVATIONS: Reservation[] = [];

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function historyRange() {
  const now = new Date();
  const from = new Date(now);
  from.setFullYear(from.getFullYear() - 2);
  const to = new Date(now);
  to.setFullYear(to.getFullYear() + 1);
  return { from: ymd(from), to: ymd(to), today: ymd(now) };
}

function formatMoment(reservation: Reservation | null): string {
  if (!reservation) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reservation.date);
  const date = match ? `${match[3]}/${match[2]}/${match[1]}` : reservation.date;
  return `${date} · ${reservation.time}`;
}

export default function ReservationCustomerHistoryView() {
  const { restaurantId, ready, user } = useAuth();
  const range = useMemo(() => historyRange(), []);
  const sourceKey =
    ready && user?.uid && restaurantId && isFirebaseConfigured
      ? `${user.uid}:${restaurantId}`
      : "";
  const [reservationSnapshot, setReservationSnapshot] = useState<{
    sourceKey: string;
    reservations: Reservation[];
    error: string | null;
  } | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!sourceKey || !restaurantId) return;
    return listenReservationsForRange(
      restaurantId,
      range.from,
      range.to,
      (items) => {
        setReservationSnapshot({ sourceKey, reservations: items, error: null });
      },
      () => {
        setReservationSnapshot({
          sourceKey,
          reservations: [],
          error: "No se pudo cargar el historial de clientes.",
        });
      },
    );
  }, [range.from, range.to, restaurantId, sourceKey]);

  const sourceMatches = reservationSnapshot?.sourceKey === sourceKey;
  const reservations = sourceMatches
    ? reservationSnapshot.reservations
    : EMPTY_RESERVATIONS;
  const error = sourceMatches ? reservationSnapshot.error : null;
  const loading = !ready || Boolean(sourceKey && !sourceMatches);

  const history = useMemo(
    () => buildReservationCustomerHistory(reservations, range.today),
    [range.today, reservations],
  );
  const query = search.trim().toLocaleLowerCase("es-ES");
  const filtered = useMemo(() => {
    if (!query) return history;
    return history.filter((customer) =>
      [customer.displayName, customer.phone, customer.email]
        .join(" ")
        .toLocaleLowerCase("es-ES")
        .includes(query),
    );
  }, [history, query]);
  const recurrent = history.filter((item) => item.reservations >= 2).length;
  const withNoShows = history.filter((item) => item.noShows > 0).length;
  const upcoming = history.filter((item) => item.future > 0).length;

  return (
    <div className="hostly-mobile-content min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <div className="hostly-mobile-stack pb-[max(24px,env(safe-area-inset-bottom,0px))]">
        <header className="hostly-mobile-header">
          <div className="hostly-mobile-title-block">
            <h1 className="hostly-mobile-title">Clientes de reservas</h1>
            <p className="hostly-mobile-subtitle">
              Historial reciente, próximas visitas y no-shows para reconocer al cliente antes del servicio.
            </p>
          </div>
        </header>

        <section className="hostly-mobile-section !py-2">
          <div className="hostly-mobile-kpi-grid hostly-mobile-kpi-grid--cols-4">
            <div className="hostly-mobile-kpi hostly-mobile-kpi--neutral">
              <div className="hostly-mobile-kpi__label">Clientes</div>
              <div className="hostly-mobile-kpi__value">{history.length}</div>
            </div>
            <div className="hostly-mobile-kpi hostly-mobile-kpi--success">
              <div className="hostly-mobile-kpi__label">Recurrentes</div>
              <div className="hostly-mobile-kpi__value">{recurrent}</div>
            </div>
            <div className="hostly-mobile-kpi hostly-mobile-kpi--info">
              <div className="hostly-mobile-kpi__label">Próximas</div>
              <div className="hostly-mobile-kpi__value">{upcoming}</div>
            </div>
            <div className="hostly-mobile-kpi hostly-mobile-kpi--danger">
              <div className="hostly-mobile-kpi__label">Con no-show</div>
              <div className="hostly-mobile-kpi__value">{withNoShows}</div>
            </div>
          </div>
        </section>

        <section className="hostly-mobile-section !py-2">
          <label className="sr-only" htmlFor="reservation-customer-search">
            Buscar cliente
          </label>
          <input
            id="reservation-customer-search"
            className="hostly-input w-full"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, teléfono o email"
            type="search"
            autoComplete="off"
          />
        </section>

        {error ? (
          <section className="hostly-mobile-section !py-2">
            <div className="hostly-mobile-card-soft border-red-200 text-sm font-semibold text-red-800" role="alert">
              {error}
            </div>
          </section>
        ) : null}

        {loading ? (
          <section className="hostly-mobile-section !py-6">
            <div className="hostly-mobile-card-soft text-sm text-[var(--hostly-ink-muted)]" role="status">
              Cargando historial…
            </div>
          </section>
        ) : filtered.length === 0 ? (
          <section className="hostly-mobile-section !py-6">
            <div className="hostly-mobile-empty-state hostly-mobile-card hostly-mobile-card--compact">
              <h3 className="hostly-mobile-empty-state__title">
                {query ? "No hay clientes que coincidan" : "Todavía no hay historial"}
              </h3>
              <p className="hostly-mobile-empty-state__desc">
                {query ? "Prueba con otro nombre, teléfono o email." : "Aparecerá aquí cuando existan reservas registradas."}
              </p>
            </div>
          </section>
        ) : (
          <section className="hostly-mobile-section !py-2">
            <div className="flex flex-col gap-2.5">
              {filtered.map((customer) => (
                <article key={customer.key} className="hostly-mobile-card hostly-mobile-card--compact flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="m-0 truncate text-base font-bold text-[var(--hostly-navy-deep)]">
                        {customer.displayName}
                      </h2>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--hostly-ink-muted)]">
                        {customer.phone ? <span>{customer.phone}</span> : null}
                        {customer.email ? <span>{customer.email}</span> : null}
                      </div>
                    </div>
                    {customer.noShows > 0 ? (
                      <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                        {customer.noShows} no-show{customer.noShows === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        Sin no-shows
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                    <div className="hostly-mobile-card-soft !p-2.5"><div className="text-xs text-[var(--hostly-ink-muted)]">Reservas</div><div className="font-bold tabular-nums">{customer.reservations}</div></div>
                    <div className="hostly-mobile-card-soft !p-2.5"><div className="text-xs text-[var(--hostly-ink-muted)]">Completadas</div><div className="font-bold tabular-nums">{customer.completed}</div></div>
                    <div className="hostly-mobile-card-soft !p-2.5"><div className="text-xs text-[var(--hostly-ink-muted)]">Última</div><div className="font-semibold">{formatMoment(customer.lastReservation)}</div></div>
                    <div className="hostly-mobile-card-soft !p-2.5"><div className="text-xs text-[var(--hostly-ink-muted)]">Próxima</div><div className="font-semibold">{formatMoment(customer.nextReservation)}</div></div>
                  </div>

                  {(customer.allergies || customer.preferences || customer.occasion || customer.notes) ? (
                    <div className="grid gap-1 text-sm text-[var(--hostly-ink-muted)]">
                      {customer.allergies ? <div className="font-semibold text-amber-800">Alergias: {customer.allergies}</div> : null}
                      {customer.preferences ? <div>Preferencias: {customer.preferences}</div> : null}
                      {customer.occasion ? <div>Última ocasión registrada: {customer.occasion}</div> : null}
                      {customer.notes ? <div>Notas: {customer.notes}</div> : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
