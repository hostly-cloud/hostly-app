"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { getTables, type Table } from "@/lib/firestore/tables";
import { getFloorPlans, type FloorPlan } from "@/lib/firestore/floorPlans";
import {
  listenReservationsForDate,
  type Reservation,
  type ReservationStatus,
} from "@/lib/firestore/reservations";
import {
  getReservationTableEligibility,
  reservationAttention,
  suggestReservationTables,
  type OperationalReservationStatus,
} from "@/lib/reservas/reservation-operations";
import {
  requestReservationCreate,
  requestReservationTransition,
  requestReservationUpdate,
} from "@/lib/reservas/request-reservation-operations";
import {
  activeReservationTables,
  reservationTableDisplayLabels,
  reservationTableOptionsForReference,
} from "@/lib/reservas/reservation-table-options";
import {
  ReservationFloorMapPicker,
  type ReservationFloorMapPickerConfirm,
} from "@/components/reservas/reservation-floor-map-picker";
import { ReservationDayToolbar } from "@/components/reservas/reservation-day-toolbar";
import { HostlyButton } from "@/components/ui/hostly";
import {
  HostlyStatusBadge,
  type HostlyStatusBadgeTone,
} from "@/components/ui/hostly/data-table/HostlyStatusBadge";
import { shiftReservationDay } from "@/lib/reservas/reservation-day";

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function statusLabel(status: ReservationStatus): string {
  if (status === "pending") return "Pendiente";
  if (status === "booked") return "Confirmada";
  if (status === "seated") return "Sentada";
  if (status === "completed") return "Completada";
  if (status === "no_show") return "No-show";
  return "Cancelada";
}

function statusTone(status: ReservationStatus): HostlyStatusBadgeTone {
  if (status === "pending") return "warning";
  if (status === "booked") return "info";
  if (status === "seated") return "info";
  if (status === "completed") return "success";
  if (status === "no_show") return "danger";
  return "muted";
}

function operationalErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error ?? "");
  const messages: Record<string, string> = {
    TABLE_TIME_CONFLICT: "Esa mesa ya tiene otra reserva que se solapa en ese horario.",
    TABLE_CAPACITY_EXCEEDED: "La mesa no tiene capacidad suficiente para ese número de personas.",
    TABLE_NOT_AVAILABLE: "La mesa ya no está disponible.",
    TABLE_REQUIRED_TO_SEAT: "Asigna una mesa antes de marcar la reserva como sentada.",
    INVALID_STATUS_TRANSITION: "Ese cambio de estado no es válido para la reserva actual.",
    CUSTOMER_NAME_REQUIRED: "El nombre del cliente es obligatorio.",
    INVALID_DATE: "La fecha no es válida.",
    INVALID_TIME: "La hora no es válida.",
    INVALID_PARTY_SIZE: "El número de personas no es válido.",
    UNAUTHORIZED: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
  };
  return messages[code] ?? "No se pudo completar la operación. Vuelve a intentarlo.";
}

function newDraft(date = todayYmd()) {
  return {
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    date,
    time: "20:00",
    partySize: "2",
    durationMinutes: "120",
    tableId: "",
    status: "pending" as "pending" | "booked",
    occasion: "",
    allergies: "",
    preferences: "",
    notes: "",
  };
}

type Draft = ReturnType<typeof newDraft>;

function reservationToDraft(reservation: Reservation): Draft {
  return {
    customerName: reservation.customerName ?? "",
    customerPhone: reservation.customerPhone ?? "",
    customerEmail: reservation.customerEmail ?? "",
    date: reservation.date,
    time: reservation.time,
    partySize: String(reservation.partySize || 1),
    durationMinutes: String(reservation.durationMinutes ?? 120),
    tableId: reservation.tableId ?? "",
    status: reservation.status === "booked" ? "booked" : "pending",
    occasion: reservation.occasion ?? "",
    allergies: reservation.allergies ?? "",
    preferences: reservation.preferences ?? "",
    notes: reservation.notes ?? "",
  };
}

export default function ReservasView() {
  const router = useRouter();
  const { restaurantId: profileRestaurantId, ready: authReady, user } = useAuth();
  const restaurantId = profileRestaurantId ?? null;
  const [viewDate, setViewDate] = useState(todayYmd);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => newDraft());
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [floorMapPicker, setFloorMapPicker] = useState<
    | null
    | { mode: "create" }
    | { mode: "edit"; reservationId: string }
  >(null);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    if (!authReady || !user?.uid || !restaurantId || !isFirebaseConfigured) {
      setReservations([]);
      return;
    }
    setListError(null);
    return listenReservationsForDate(
      restaurantId,
      viewDate,
      setReservations,
      () => setListError("No se pudieron cargar las reservas."),
    );
  }, [authReady, user?.uid, restaurantId, viewDate]);

  useEffect(() => {
    if (!authReady || !restaurantId || !isFirebaseConfigured) return;
    let cancelled = false;
    void Promise.all([getTables(restaurantId), getFloorPlans(restaurantId)])
      .then(([nextTables, nextPlans]) => {
        if (cancelled) return;
        setTables(nextTables);
        setFloorPlans(nextPlans);
      })
      .catch(() => {
        if (!cancelled) {
          setTables([]);
          setFloorPlans([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, restaurantId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    }, 30000);
    return () => window.clearInterval(id);
  }, []);

  const activeTables = useMemo(
    () => activeReservationTables(tables, restaurantId ?? ""),
    [tables, restaurantId],
  );
  const tableLabels = useMemo(
    () => reservationTableDisplayLabels(activeTables, floorPlans),
    [activeTables, floorPlans],
  );

  const metrics = useMemo(() => ({
    pending: reservations.filter((item) => item.status === "pending").length,
    booked: reservations.filter((item) => item.status === "booked").length,
    seated: reservations.filter((item) => item.status === "seated").length,
    completed: reservations.filter((item) => item.status === "completed").length,
    noShow: reservations.filter((item) => item.status === "no_show").length,
    pax: reservations
      .filter((item) => item.status !== "cancelled" && item.status !== "no_show")
      .reduce((sum, item) => sum + Math.max(0, item.partySize || 0), 0),
  }), [reservations]);

  const attention = useMemo(() => {
    const today = todayYmd();
    return {
      upcoming: reservations.filter((item) => reservationAttention({ reservation: item, todayYmd: today, nowMinutes }) === "upcoming"),
      delayed: reservations.filter((item) => reservationAttention({ reservation: item, todayYmd: today, nowMinutes }) === "delayed"),
      releaseSoon: reservations.filter((item) => reservationAttention({ reservation: item, todayYmd: today, nowMinutes }) === "release_soon"),
    };
  }, [reservations, nowMinutes]);

  const draftSuggestions = useMemo(() => suggestReservationTables({
    tables: activeTables,
    reservations,
    partySize: Number(draft.partySize),
    date: draft.date,
    time: draft.time,
    durationMinutes: Number(draft.durationMinutes),
  }).slice(0, 3), [activeTables, reservations, draft]);

  const assignTable = useCallback(async (reservation: Reservation, tableId: string) => {
    setError(null);
    setBusy(true);
    try {
      await requestReservationUpdate(reservation.id, { tableId });
    } catch (nextError) {
      setError(operationalErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }, []);

  async function createReservation() {
    setError(null);
    setBusy(true);
    try {
      await requestReservationCreate({
        ...draft,
        partySize: Number(draft.partySize),
        durationMinutes: Number(draft.durationMinutes),
      });
      setViewDate(draft.date);
      setCreating(false);
      setDraft(newDraft(draft.date));
    } catch (nextError) {
      setError(operationalErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editId || !editDraft) return;
    setError(null);
    setBusy(true);
    try {
      await requestReservationUpdate(editId, {
        ...editDraft,
        partySize: Number(editDraft.partySize),
        durationMinutes: Number(editDraft.durationMinutes),
      });
      setEditId(null);
      setEditDraft(null);
    } catch (nextError) {
      setError(operationalErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function transition(reservation: Reservation, nextStatus: OperationalReservationStatus) {
    if (nextStatus === "cancelled" && !window.confirm("¿Cancelar esta reserva?")) return;
    if (nextStatus === "no_show" && !window.confirm("¿Marcar como no-show?")) return;
    setError(null);
    setBusy(true);
    try {
      await requestReservationTransition(reservation.id, nextStatus);
      if (nextStatus === "seated" && reservation.tableId) {
        router.push(`/dashboard/operacion?tab=tpv&tpvView=comanda&tableId=${encodeURIComponent(reservation.tableId)}`);
      }
    } catch (nextError) {
      setError(operationalErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  const floorMapPickerContext = useMemo(() => {
    if (!floorMapPicker || !restaurantId) return null;
    if (floorMapPicker.mode === "create") {
      return {
        reservationDateYmd: draft.date,
        initialTableId: draft.tableId || null,
        initialFloorPlanId: null as string | null,
        excludeReservationId: null as string | null,
        onConfirm: (payload: ReservationFloorMapPickerConfirm) => {
          const table = activeTables.find((item) => item.id === payload.tableId);
          if (!table) return;
          const eligibility = getReservationTableEligibility({
            table,
            reservations,
            partySize: Number(draft.partySize),
            date: draft.date,
            time: draft.time,
            durationMinutes: Number(draft.durationMinutes),
          });
          if (!eligibility.eligible) {
            setError(eligibility.reason === "capacity" ? "La mesa no tiene capacidad suficiente." : "La mesa se solapa con otra reserva.");
            return;
          }
          setDraft((current) => ({ ...current, tableId: payload.tableId }));
          setFloorMapPicker(null);
        },
      };
    }
    const reservation = reservations.find((item) => item.id === floorMapPicker.reservationId);
    if (!reservation) return null;
    return {
      reservationDateYmd: reservation.date,
      initialTableId: reservation.tableId ?? null,
      initialFloorPlanId: reservation.floorPlanId ?? null,
      excludeReservationId: reservation.id,
      onConfirm: (payload: ReservationFloorMapPickerConfirm) => {
        void assignTable(reservation, payload.tableId).then(() => setFloorMapPicker(null));
      },
    };
  }, [floorMapPicker, restaurantId, draft, activeTables, reservations, assignTable]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="hostly-mobile-content min-h-0 flex-1">
        <div className="hostly-mobile-stack pb-[max(20px,env(safe-area-inset-bottom,0px))]">
          <header className="hostly-mobile-header md:hidden">
            <div className="hostly-mobile-header-row">
              <Link href="/dashboard/operacion" className="hostly-mobile-back" aria-label="Volver a Operación">‹</Link>
              <div className="hostly-mobile-title-block">
                <h1 className="hostly-mobile-title">Reservas</h1>
                <p className="hostly-mobile-subtitle">Disponibilidad, mesas y llegadas en un solo flujo</p>
              </div>
            </div>
          </header>

          <section className="hostly-mobile-section !pt-2 !pb-0">
            <ReservationDayToolbar
              dayLabel={formatDayLabel(viewDate)}
              isToday={viewDate === todayYmd()}
              value={viewDate}
              onChange={setViewDate}
              onPrevious={() => setViewDate((value) => shiftReservationDay(value, -1))}
              onToday={() => setViewDate(todayYmd())}
              onNext={() => setViewDate((value) => shiftReservationDay(value, 1))}
              onCreate={() => {
                setError(null);
                setDraft(newDraft(viewDate));
                setCreating(true);
              }}
            />
          </section>

          <section className="hostly-mobile-section !py-2">
            <div className="hostly-mobile-kpi-grid hostly-mobile-kpi-grid--cols-4 hostly-reservations-kpi-rail">
              <div className="hostly-mobile-kpi hostly-mobile-kpi--warning"><div className="hostly-mobile-kpi__label">Pendientes</div><div className="hostly-mobile-kpi__value">{metrics.pending}</div></div>
              <div className="hostly-mobile-kpi hostly-mobile-kpi--info"><div className="hostly-mobile-kpi__label">Confirmadas</div><div className="hostly-mobile-kpi__value">{metrics.booked}</div></div>
              <div className="hostly-mobile-kpi hostly-mobile-kpi--info"><div className="hostly-mobile-kpi__label">Sentadas</div><div className="hostly-mobile-kpi__value">{metrics.seated}</div></div>
              <div className="hostly-mobile-kpi hostly-mobile-kpi--success"><div className="hostly-mobile-kpi__label">Completadas</div><div className="hostly-mobile-kpi__value">{metrics.completed}</div></div>
              <div className="hostly-mobile-kpi hostly-mobile-kpi--danger"><div className="hostly-mobile-kpi__label">No-show</div><div className="hostly-mobile-kpi__value">{metrics.noShow}</div></div>
              <div className="hostly-mobile-kpi hostly-mobile-kpi--neutral"><div className="hostly-mobile-kpi__label">Comensales</div><div className="hostly-mobile-kpi__value">{metrics.pax}</div></div>
            </div>
          </section>

          {error || listError ? (
            <section className="hostly-mobile-section !py-1">
              <div className="hostly-mobile-card-soft border-red-200 text-sm font-semibold text-red-800" role="alert">{error ?? listError}</div>
            </section>
          ) : null}

          {(attention.upcoming.length || attention.delayed.length || attention.releaseSoon.length) ? (
            <section className="hostly-mobile-section !py-2">
              <div className="hostly-mobile-card flex flex-wrap gap-2 text-sm font-semibold">
                {attention.upcoming.length ? <span className="hostly-mobile-pill">{attention.upcoming.length} próximas en 90 min</span> : null}
                {attention.delayed.length ? <span className="hostly-mobile-pill text-red-800">{attention.delayed.length} retrasadas +15 min</span> : null}
                {attention.releaseSoon.length ? <span className="hostly-mobile-pill">{attention.releaseSoon.length} mesas a liberar pronto</span> : null}
              </div>
            </section>
          ) : null}

          {creating ? (
            <section className="hostly-mobile-section !py-2">
              <div className="hostly-mobile-card flex flex-col gap-4">
                <div><h3 className="hostly-mobile-title !text-[19px]">Nueva reserva</h3><p className="hostly-mobile-subtitle">Puedes guardarla pendiente y asignar mesa después.</p></div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input className="hostly-input md:col-span-2" placeholder="Nombre del cliente" value={draft.customerName} onChange={(e) => setDraft((d) => ({ ...d, customerName: e.target.value }))} />
                  <input className="hostly-input" placeholder="Teléfono" value={draft.customerPhone} onChange={(e) => setDraft((d) => ({ ...d, customerPhone: e.target.value }))} />
                  <input className="hostly-input" placeholder="Email" type="email" value={draft.customerEmail} onChange={(e) => setDraft((d) => ({ ...d, customerEmail: e.target.value }))} />
                  <input className="hostly-input" type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
                  <input className="hostly-input" type="time" value={draft.time} onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))} />
                  <input className="hostly-input" type="number" min={1} max={100} value={draft.partySize} onChange={(e) => setDraft((d) => ({ ...d, partySize: e.target.value }))} />
                  <select className="hostly-select" value={draft.durationMinutes} onChange={(e) => setDraft((d) => ({ ...d, durationMinutes: e.target.value }))}><option value="90">1 h 30</option><option value="120">2 h</option><option value="150">2 h 30</option><option value="180">3 h</option></select>
                  <select className="hostly-select" value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as Draft["status"] }))}><option value="pending">Pendiente de confirmar</option><option value="booked">Confirmada</option></select>
                  <select className="hostly-select" value={draft.tableId} onChange={(e) => setDraft((d) => ({ ...d, tableId: e.target.value }))}><option value="">Sin mesa asignada</option>{activeTables.map((table) => <option key={table.id} value={table.id}>{tableLabels.get(table.id) ?? table.name} · {table.seats} plazas</option>)}</select>
                  <HostlyButton variant="secondary" size="compact" onClick={() => setFloorMapPicker({ mode: "create" })}>Elegir en mapa</HostlyButton>
                  {draftSuggestions.length ? <div className="md:col-span-2 flex flex-wrap gap-2"><span className="text-sm font-semibold text-[var(--hostly-ink-muted)]">Sugeridas:</span>{draftSuggestions.map((item) => <HostlyButton key={item.tableId} variant="secondary" size="compact" onClick={() => setDraft((d) => ({ ...d, tableId: item.tableId }))}>{tableLabels.get(item.tableId) ?? item.tableName} · {item.seats}</HostlyButton>)}</div> : null}
                  <input className="hostly-input" placeholder="Ocasión especial" value={draft.occasion} onChange={(e) => setDraft((d) => ({ ...d, occasion: e.target.value }))} />
                  <input className="hostly-input" placeholder="Alergias" value={draft.allergies} onChange={(e) => setDraft((d) => ({ ...d, allergies: e.target.value }))} />
                  <input className="hostly-input" placeholder="Preferencias" value={draft.preferences} onChange={(e) => setDraft((d) => ({ ...d, preferences: e.target.value }))} />
                  <input className="hostly-input" placeholder="Notas" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
                </div>
                <div className="flex flex-wrap justify-end gap-2"><HostlyButton variant="secondary" size="touch" disabled={busy} onClick={() => setCreating(false)}>Cancelar</HostlyButton><HostlyButton variant="primary" size="touch" disabled={busy} onClick={() => void createReservation()}>{busy ? "Guardando…" : "Guardar reserva"}</HostlyButton></div>
              </div>
            </section>
          ) : null}

          {reservations.length === 0 ? (
            <section className="hostly-mobile-section !py-6"><div className="hostly-mobile-empty-state hostly-mobile-card hostly-mobile-card--compact"><h3 className="hostly-mobile-empty-state__title">No hay reservas para este día</h3><p className="hostly-mobile-empty-state__desc">Crea una reserva o cambia la fecha.</p></div></section>
          ) : (
            <section className="hostly-mobile-section !py-2">
              <div className="flex flex-col gap-2.5">
                {reservations.map((reservation) => {
                  const isEditing = editId === reservation.id && editDraft;
                  const options = reservationTableOptionsForReference({ activeTables, allTables: tables, restaurantId: restaurantId ?? "", reference: reservation });
                  const suggestions = suggestReservationTables({ tables: activeTables, reservations, partySize: reservation.partySize, date: reservation.date, time: reservation.time, durationMinutes: reservation.durationMinutes, excludeReservationId: reservation.id }).slice(0, 3);
                  return (
                    <div key={reservation.id} className="hostly-mobile-card hostly-mobile-card--compact flex flex-col gap-3 border-l-[3px] border-l-[var(--hostly-ice-200)]">
                      <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"><span className="text-lg font-bold tabular-nums text-[var(--hostly-navy-deep)]">{reservation.time}</span><span className="font-semibold">{reservation.customerName}</span><span className="text-sm text-[var(--hostly-ink-muted)]">{reservation.partySize} personas · {reservation.durationMinutes ?? 120} min</span>{reservation.tableLabel ? <span className="text-sm font-semibold text-[var(--hostly-accent)]">{reservation.tableLabel}</span> : <span className="text-sm font-semibold text-amber-700">Sin mesa</span>}</div><HostlyStatusBadge tone={statusTone(reservation.status)}>{statusLabel(reservation.status)}</HostlyStatusBadge></div>

                      {isEditing ? (
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          <input className="hostly-input md:col-span-2" value={editDraft.customerName} onChange={(e) => setEditDraft({ ...editDraft, customerName: e.target.value })} />
                          <input className="hostly-input" value={editDraft.customerPhone} onChange={(e) => setEditDraft({ ...editDraft, customerPhone: e.target.value })} />
                          <input className="hostly-input" type="email" value={editDraft.customerEmail} onChange={(e) => setEditDraft({ ...editDraft, customerEmail: e.target.value })} />
                          <input className="hostly-input" type="date" value={editDraft.date} onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })} />
                          <input className="hostly-input" type="time" value={editDraft.time} onChange={(e) => setEditDraft({ ...editDraft, time: e.target.value })} />
                          <input className="hostly-input" type="number" min={1} value={editDraft.partySize} onChange={(e) => setEditDraft({ ...editDraft, partySize: e.target.value })} />
                          <select className="hostly-select" value={editDraft.durationMinutes} onChange={(e) => setEditDraft({ ...editDraft, durationMinutes: e.target.value })}><option value="90">1 h 30</option><option value="120">2 h</option><option value="150">2 h 30</option><option value="180">3 h</option></select>
                          <input className="hostly-input" placeholder="Ocasión" value={editDraft.occasion} onChange={(e) => setEditDraft({ ...editDraft, occasion: e.target.value })} />
                          <input className="hostly-input" placeholder="Alergias" value={editDraft.allergies} onChange={(e) => setEditDraft({ ...editDraft, allergies: e.target.value })} />
                          <input className="hostly-input" placeholder="Preferencias" value={editDraft.preferences} onChange={(e) => setEditDraft({ ...editDraft, preferences: e.target.value })} />
                          <input className="hostly-input" placeholder="Notas" value={editDraft.notes} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} />
                          <div className="md:col-span-2 flex justify-end gap-2"><HostlyButton variant="secondary" size="compact" onClick={() => { setEditId(null); setEditDraft(null); }}>Cancelar edición</HostlyButton><HostlyButton variant="primary" size="compact" disabled={busy} onClick={() => void saveEdit()}>Guardar cambios</HostlyButton></div>
                        </div>
                      ) : null}

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        <select className="hostly-select min-w-0 flex-1" value={reservation.tableId ?? ""} disabled={busy || reservation.status === "completed" || reservation.status === "cancelled" || reservation.status === "no_show"} onChange={(e) => void assignTable(reservation, e.target.value)}><option value="">Sin mesa</option>{options.map((option) => <option key={option.id} value={option.id} disabled={option.disabled}>{tableLabels.get(option.id) ?? option.label}</option>)}</select>
                        <HostlyButton variant="secondary" size="compact" disabled={busy} onClick={() => setFloorMapPicker({ mode: "edit", reservationId: reservation.id })}>Mapa</HostlyButton>
                        <HostlyButton variant="secondary" size="compact" disabled={busy} onClick={() => { setEditId(reservation.id); setEditDraft(reservationToDraft(reservation)); }}>Editar</HostlyButton>
                      </div>
                      {suggestions.length && (reservation.status === "pending" || reservation.status === "booked") ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-[var(--hostly-ink-muted)]">Mesas recomendadas</span>{suggestions.map((item) => <HostlyButton key={item.tableId} variant="secondary" size="compact" disabled={busy} onClick={() => void assignTable(reservation, item.tableId)}>{tableLabels.get(item.tableId) ?? item.tableName} · {item.seats}</HostlyButton>)}</div> : null}

                      {(reservation.customerPhone || reservation.customerEmail || reservation.occasion || reservation.allergies || reservation.preferences || reservation.notes) ? <div className="grid gap-1 text-sm text-[var(--hostly-ink-muted)]">{reservation.customerPhone ? <span>Tel. {reservation.customerPhone}</span> : null}{reservation.customerEmail ? <span>{reservation.customerEmail}</span> : null}{reservation.occasion ? <span>Ocasión: {reservation.occasion}</span> : null}{reservation.allergies ? <span className="font-semibold text-amber-800">Alergias: {reservation.allergies}</span> : null}{reservation.preferences ? <span>Preferencias: {reservation.preferences}</span> : null}{reservation.notes ? <span>Notas: {reservation.notes}</span> : null}</div> : null}

                      <div className="flex flex-wrap justify-end gap-2">
                        {reservation.status === "pending" ? <><HostlyButton variant="primary" size="compact" disabled={busy} onClick={() => void transition(reservation, "booked")}>Confirmar</HostlyButton><HostlyButton variant="destructive" size="compact" disabled={busy} onClick={() => void transition(reservation, "cancelled")}>Cancelar</HostlyButton></> : null}
                        {reservation.status === "booked" ? <><HostlyButton variant="primary" size="compact" disabled={busy} onClick={() => void transition(reservation, "seated")}>Ha llegado</HostlyButton><HostlyButton variant="destructive" size="compact" disabled={busy} onClick={() => void transition(reservation, "no_show")}>No-show</HostlyButton><HostlyButton variant="destructive" size="compact" disabled={busy} onClick={() => void transition(reservation, "cancelled")}>Cancelar</HostlyButton></> : null}
                        {reservation.status === "seated" ? <><HostlyButton variant="secondary" size="compact" disabled={busy || !reservation.tableId} onClick={() => reservation.tableId && router.push(`/dashboard/operacion?tab=tpv&tpvView=comanda&tableId=${encodeURIComponent(reservation.tableId)}`)}>Abrir mesa</HostlyButton><HostlyButton variant="primary" size="compact" disabled={busy} onClick={() => void transition(reservation, "completed")}>Completar</HostlyButton></> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {floorMapPicker && floorMapPickerContext ? <ReservationFloorMapPicker open restaurantId={restaurantId} reservationDateYmd={floorMapPickerContext.reservationDateYmd} tables={tables} initialTableId={floorMapPickerContext.initialTableId} initialFloorPlanId={floorMapPickerContext.initialFloorPlanId} excludeReservationId={floorMapPickerContext.excludeReservationId} onClose={() => setFloorMapPicker(null)} onConfirm={floorMapPickerContext.onConfirm} /> : null}
    </div>
  );
}
