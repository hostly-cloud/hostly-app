"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { HostlyButton } from "@/components/ui/hostly";
import {
  HostlyStatusBadge,
  type HostlyStatusBadgeTone,
} from "@/components/ui/hostly/data-table/HostlyStatusBadge";
import { ReservationDayToolbar } from "@/components/reservas/reservation-day-toolbar";
import {
  ReservationFloorMapPicker,
  type ReservationFloorMapPickerConfirm,
} from "@/components/reservas/reservation-floor-map-picker";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { getFloorPlans, type FloorPlan } from "@/lib/firestore/floorPlans";
import {
  createReservation,
  listenReservationsForDate,
  updateReservation,
  type Reservation,
  type ReservationStatus,
} from "@/lib/firestore/reservations";
import { getTables, type Table } from "@/lib/firestore/tables";
import {
  DEFAULT_RESERVATION_DURATION_MINUTES,
  DEFAULT_RESERVATION_TURNOVER_MINUTES,
  findReservationTableConflict,
  reservationAssignmentLabel,
  tableCanSeatParty,
} from "@/lib/reservas/reservation-availability";
import { shiftReservationDay } from "@/lib/reservas/reservation-day";
import { computeReservationDayMetrics } from "@/lib/reservas/reservation-metrics";
import {
  activeReservationTables,
  reservationTableDisplayLabels,
  reservationTableOptionsForReference,
} from "@/lib/reservas/reservation-table-options";

type ReservationDraft = {
  customerName: string;
  customerPhone: string;
  date: string;
  time: string;
  partySize: string;
  durationMinutes: string;
  tableId: string;
  notes: string;
};

type EditorState =
  | { mode: "create"; reservationId?: undefined }
  | { mode: "edit"; reservationId: string }
  | null;

type MapPickerState =
  | { mode: "create" }
  | { mode: "edit"; reservationId: string }
  | null;

const labelClass =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--hostly-navy-mid)]";

function todayYmd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function blankDraft(date = todayYmd()): ReservationDraft {
  return {
    customerName: "",
    customerPhone: "",
    date,
    time: "20:00",
    partySize: "2",
    durationMinutes: String(DEFAULT_RESERVATION_DURATION_MINUTES),
    tableId: "",
    notes: "",
  };
}

function draftFromReservation(reservation: Reservation): ReservationDraft {
  return {
    customerName: reservation.customerName,
    customerPhone: reservation.customerPhone,
    date: reservation.date,
    time: reservation.time,
    partySize: String(Math.max(1, reservation.partySize || 1)),
    durationMinutes: String(
      reservation.durationMinutes ?? DEFAULT_RESERVATION_DURATION_MINUTES,
    ),
    tableId: reservation.tableId ?? "",
    notes: reservation.notes ?? "",
  };
}

function formatDayLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

function statusLabel(status: ReservationStatus): string {
  switch (status) {
    case "seated":
      return "En sala";
    case "completed":
      return "Completada";
    case "no_show":
      return "No presentado";
    case "cancelled":
      return "Cancelada";
    default:
      return "Reservada";
  }
}

function statusTone(status: ReservationStatus): HostlyStatusBadgeTone {
  if (status === "seated") return "info";
  if (status === "completed") return "success";
  if (status === "no_show") return "danger";
  if (status === "cancelled") return "muted";
  return "warning";
}

function normalizePartySize(value: string): number | null {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

function normalizeDuration(value: string): number | null {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= 30 && parsed <= 12 * 60
    ? parsed
    : null;
}

function tableContext(
  reservation: Reservation,
  displayLabels: Map<string, string>,
): string {
  const id = reservation.tableId?.trim() ?? "";
  if (!id) return "Pendiente de mesa";
  return (
    displayLabels.get(id) ||
    [reservation.tableLabel, reservation.floorName, reservation.zoneName]
      .filter(Boolean)
      .join(" · ") ||
    "Mesa asignada"
  );
}

export default function ReservasOperationalView() {
  const router = useRouter();
  const { restaurantId: profileRestaurantId, ready: authReady, user } = useAuth();
  const restaurantId = profileRestaurantId ?? null;

  const [viewDate, setViewDate] = useState(todayYmd);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [editor, setEditor] = useState<EditorState>(null);
  const [mapPicker, setMapPicker] = useState<MapPickerState>(null);
  const [draft, setDraft] = useState<ReservationDraft>(() => blankDraft());
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
      () => setListError("No se pudieron cargar las reservas de este día."),
    );
  }, [authReady, restaurantId, user?.uid, viewDate]);

  useEffect(() => {
    if (!authReady || !restaurantId || !isFirebaseConfigured) {
      setTables([]);
      setFloorPlans([]);
      return;
    }
    let cancelled = false;
    void Promise.all([getTables(restaurantId), getFloorPlans(restaurantId)])
      .then(([nextTables, nextPlans]) => {
        if (cancelled) return;
        setTables(nextTables);
        setFloorPlans(nextPlans);
      })
      .catch(() => {
        if (cancelled) return;
        setTables([]);
        setFloorPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, restaurantId]);

  const activeTables = useMemo(
    () => activeReservationTables(tables, restaurantId ?? ""),
    [restaurantId, tables],
  );
  const displayLabels = useMemo(
    () => reservationTableDisplayLabels(activeTables, floorPlans),
    [activeTables, floorPlans],
  );
  const metrics = useMemo(
    () => computeReservationDayMetrics(reservations, viewDate),
    [reservations, viewDate],
  );
  const unassignedCount = useMemo(
    () =>
      reservations.filter(
        (reservation) => reservationAssignmentLabel(reservation) !== null,
      ).length,
    [reservations],
  );

  const editingReservation = useMemo(() => {
    if (editor?.mode !== "edit") return null;
    return reservations.find((r) => r.id === editor.reservationId) ?? null;
  }, [editor, reservations]);

  const tableAvailability = useCallback(
    (table: Table, candidate: ReservationDraft, excludeReservationId?: string) => {
      const partySize = normalizePartySize(candidate.partySize);
      const durationMinutes = normalizeDuration(candidate.durationMinutes);
      if (!partySize || !durationMinutes) {
        return { available: false, reason: "Revisa personas y duración." };
      }
      if (!tableCanSeatParty(table, partySize)) {
        return {
          available: false,
          reason: `Capacidad insuficiente (${table.seats || 0} plazas).`,
        };
      }
      const conflict = findReservationTableConflict({
        reservations,
        tableId: table.id,
        date: candidate.date,
        time: candidate.time,
        durationMinutes,
        turnoverMinutes: DEFAULT_RESERVATION_TURNOVER_MINUTES,
        excludeReservationId,
      });
      if (conflict) {
        return {
          available: false,
          reason: `Se solapa con ${conflict.reservation.customerName} a las ${conflict.reservation.time}.`,
        };
      }
      return { available: true, reason: null as string | null };
    },
    [reservations],
  );

  const openCreate = useCallback(() => {
    setSaveError(null);
    setDraft(blankDraft(viewDate));
    setEditor({ mode: "create" });
  }, [viewDate]);

  const openEdit = useCallback((reservation: Reservation) => {
    setSaveError(null);
    setDraft(draftFromReservation(reservation));
    setEditor({ mode: "edit", reservationId: reservation.id });
  }, []);

  async function saveReservation() {
    if (!restaurantId || !isFirebaseConfigured || !editor) return;
    setSaveError(null);
    const customerName = draft.customerName.trim();
    const date = draft.date.trim();
    const time = draft.time.trim();
    const partySize = normalizePartySize(draft.partySize);
    const durationMinutes = normalizeDuration(draft.durationMinutes);
    if (!customerName) return setSaveError("El nombre del cliente es obligatorio.");
    if (!date) return setSaveError("La fecha es obligatoria.");
    if (!time) return setSaveError("La hora es obligatoria.");
    if (!partySize) return setSaveError("Indica al menos 1 comensal.");
    if (!durationMinutes) {
      return setSaveError("La duración debe estar entre 30 minutos y 12 horas.");
    }

    const selectedTable = draft.tableId
      ? activeTables.find((table) => table.id === draft.tableId)
      : undefined;
    if (draft.tableId && !selectedTable) {
      return setSaveError("La mesa seleccionada ya no está disponible.");
    }
    if (selectedTable) {
      const availability = tableAvailability(
        selectedTable,
        draft,
        editor.mode === "edit" ? editor.reservationId : undefined,
      );
      if (!availability.available) {
        return setSaveError(availability.reason ?? "La mesa no está disponible.");
      }
    }

    const floorPlanId = selectedTable?.floorPlanId?.trim() ?? "";
    const floorName = floorPlanId
      ? floorPlans.find((plan) => plan.id === floorPlanId)?.name?.trim() ?? ""
      : "";
    const payload = {
      customerName,
      customerPhone: draft.customerPhone.trim(),
      date,
      time,
      partySize,
      durationMinutes,
      tableId: selectedTable?.id ?? "",
      tableLabel: selectedTable?.name ?? "",
      floorPlanId,
      floorName,
      zoneId: selectedTable?.zoneId ?? "",
      zoneName: selectedTable?.zoneName ?? selectedTable?.zone ?? "",
      notes: draft.notes.trim(),
    };

    setBusy(true);
    try {
      if (editor.mode === "create") {
        await createReservation(restaurantId, { ...payload, status: "booked" });
      } else {
        await updateReservation(editor.reservationId, payload);
      }
      setViewDate(date);
      setEditor(null);
      setDraft(blankDraft(date));
    } catch (error) {
      console.error("saveReservation", error);
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar la reserva.");
    } finally {
      setBusy(false);
    }
  }

  const assignTable = useCallback(
    async (reservation: Reservation, tableId: string) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      setActionError(null);
      const id = tableId.trim();
      if (!id) {
        setBusy(true);
        try {
          await updateReservation(reservation.id, {
            tableId: "",
            tableLabel: "",
            floorPlanId: "",
            floorName: "",
            zoneId: "",
            zoneName: "",
          });
        } catch (error) {
          setActionError(error instanceof Error ? error.message : "No se pudo quitar la mesa.");
        } finally {
          setBusy(false);
        }
        return;
      }
      const table = activeTables.find((candidate) => candidate.id === id);
      if (!table) return setActionError("La mesa seleccionada no está disponible.");
      const candidateDraft: ReservationDraft = {
        ...draftFromReservation(reservation),
        tableId: table.id,
      };
      const availability = tableAvailability(table, candidateDraft, reservation.id);
      if (!availability.available) {
        return setActionError(availability.reason ?? "La mesa no está disponible.");
      }
      const floorPlanId = table.floorPlanId?.trim() ?? "";
      const floorName = floorPlanId
        ? floorPlans.find((plan) => plan.id === floorPlanId)?.name?.trim() ?? ""
        : "";
      setBusy(true);
      try {
        await updateReservation(reservation.id, {
          tableId: table.id,
          tableLabel: table.name,
          floorPlanId,
          floorName,
          zoneId: table.zoneId ?? "",
          zoneName: table.zoneName ?? table.zone ?? "",
        });
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "No se pudo asignar la mesa.");
      } finally {
        setBusy(false);
      }
    },
    [activeTables, draft, floorPlans, restaurantId, tableAvailability],
  );

  async function changeStatus(reservation: Reservation, nextStatus: ReservationStatus) {
    if (!restaurantId || !isFirebaseConfigured) return;
    setActionError(null);
    if (nextStatus === "seated" && !reservation.tableId?.trim()) {
      setActionError("Asigna una mesa antes de marcar la llegada.");
      return;
    }
    if (nextStatus === "cancelled" && !window.confirm("¿Cancelar esta reserva?")) return;
    if (nextStatus === "no_show" && !window.confirm("¿Marcar como no presentado?")) return;
    if (nextStatus === "completed" && !window.confirm("¿Completar esta reserva?")) return;
    setBusy(true);
    try {
      await updateReservation(reservation.id, { status: nextStatus });
      if (nextStatus === "seated" && reservation.tableId) {
        router.push(
          `/dashboard/operacion?tab=tpv&tpvView=comanda&tableId=${encodeURIComponent(
            reservation.tableId,
          )}`,
        );
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudo actualizar la reserva.");
    } finally {
      setBusy(false);
    }
  }

  const mapPickerContext = useMemo(() => {
    if (!mapPicker) return null;
    if (mapPicker.mode === "create") {
      return {
        date: draft.date,
        initialTableId: draft.tableId || null,
        initialFloorPlanId: null as string | null,
        excludeReservationId: null as string | null,
        confirm: (payload: ReservationFloorMapPickerConfirm) => {
          const table = activeTables.find((candidate) => candidate.id === payload.tableId);
          if (!table) return setActionError("La mesa seleccionada ya no está disponible.");
          const availability = tableAvailability(table, draft);
          if (!availability.available) {
            setActionError(availability.reason ?? "La mesa no está disponible.");
            return;
          }
          setDraft((current) => ({ ...current, tableId: payload.tableId }));
          setMapPicker(null);
        },
      };
    }
    const reservation = reservations.find((row) => row.id === mapPicker.reservationId);
    if (!reservation) return null;
    return {
      date: reservation.date,
      initialTableId: reservation.tableId ?? null,
      initialFloorPlanId: reservation.floorPlanId ?? null,
      excludeReservationId: reservation.id,
      confirm: (payload: ReservationFloorMapPickerConfirm) => {
        setMapPicker(null);
        void assignTable(reservation, payload.tableId);
      },
    };
  }, [activeTables, assignTable, draft, mapPicker, reservations, tableAvailability]);

  const editorReservationOptions = useMemo(() => {
    if (editor?.mode !== "edit" || !editingReservation) return activeTables;
    return reservationTableOptionsForReference({
      activeTables,
      allTables: tables,
      restaurantId: restaurantId ?? "",
      reference: editingReservation,
    }).map((option) => activeTables.find((table) => table.id === option.id)).filter(Boolean) as Table[];
  }, [activeTables, editingReservation, editor, restaurantId, tables]);

  return (
    <div className="hostly-mobile-content min-h-0 flex-1 overflow-x-hidden">
      <div className="hostly-mobile-stack pb-[max(24px,env(safe-area-inset-bottom,0px))]">
        <header className="hostly-mobile-header md:hidden">
          <div className="hostly-mobile-header-row">
            <Link href="/dashboard/operacion" className="hostly-mobile-back" aria-label="Volver a Operación">
              <span className="text-lg font-bold leading-none" aria-hidden>‹</span>
            </Link>
            <div className="hostly-mobile-title-block">
              <h1 className="hostly-mobile-title">Reservas</h1>
              <p className="hostly-mobile-subtitle">Llegadas, mesas y disponibilidad sin solapamientos</p>
            </div>
          </div>
        </header>

        <section className="hostly-mobile-section !pb-0 !pt-2">
          <ReservationDayToolbar
            dayLabel={formatDayLabel(viewDate)}
            isToday={viewDate === todayYmd()}
            value={viewDate}
            onChange={setViewDate}
            onPrevious={() => setViewDate((current) => shiftReservationDay(current, -1))}
            onToday={() => setViewDate(todayYmd())}
            onNext={() => setViewDate((current) => shiftReservationDay(current, 1))}
            onCreate={openCreate}
          />
        </section>

        <section className="hostly-mobile-section !py-2">
          <div className="hostly-mobile-kpi-grid hostly-mobile-kpi-grid--cols-4 hostly-reservations-kpi-rail" aria-label="Resumen de reservas">
            <div className="hostly-mobile-kpi hostly-mobile-kpi--warning"><div className="hostly-mobile-kpi__label">Previstas</div><div className="hostly-mobile-kpi__value">{metrics.booked}</div></div>
            <div className="hostly-mobile-kpi hostly-mobile-kpi--info"><div className="hostly-mobile-kpi__label">En sala</div><div className="hostly-mobile-kpi__value">{metrics.seated}</div></div>
            <div className="hostly-mobile-kpi hostly-mobile-kpi--success"><div className="hostly-mobile-kpi__label">Completadas</div><div className="hostly-mobile-kpi__value">{metrics.completed}</div></div>
            <div className="hostly-mobile-kpi hostly-mobile-kpi--danger"><div className="hostly-mobile-kpi__label">Sin mesa</div><div className="hostly-mobile-kpi__value">{unassignedCount}</div></div>
          </div>
        </section>

        {listError || actionError ? (
          <section className="hostly-mobile-section !py-1">
            <div className="hostly-mobile-card-soft border-red-200 text-sm font-semibold text-red-800" role="alert">
              {listError || actionError}
            </div>
          </section>
        ) : null}

        {editor ? (
          <section className="hostly-mobile-section !py-2">
            <div className="hostly-mobile-card">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="m-0 text-lg font-bold text-[var(--hostly-navy-deep)]">{editor.mode === "create" ? "Nueva reserva" : "Editar reserva"}</h2>
                  <p className="hostly-mobile-subtitle !mt-1">La mesa es opcional al reservar, pero obligatoria al sentar al cliente.</p>
                </div>
                <HostlyButton variant="secondary" size="compact" onClick={() => setEditor(null)} disabled={busy}>Cerrar</HostlyButton>
              </div>
              {saveError ? <div className="hostly-mobile-card-soft mb-3 border-red-200 text-sm font-semibold text-red-800" role="alert">{saveError}</div> : null}
              <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void saveReservation(); }}>
                <div className="md:col-span-2"><label className={labelClass}>Nombre</label><input className="hostly-input" value={draft.customerName} onChange={(e) => setDraft((d) => ({ ...d, customerName: e.target.value }))} required disabled={busy} /></div>
                <div><label className={labelClass}>Teléfono</label><input className="hostly-input" value={draft.customerPhone} onChange={(e) => setDraft((d) => ({ ...d, customerPhone: e.target.value }))} autoComplete="tel" disabled={busy} /></div>
                <div><label className={labelClass}>Personas</label><input className="hostly-input" type="number" min={1} value={draft.partySize} onChange={(e) => setDraft((d) => ({ ...d, partySize: e.target.value }))} required disabled={busy} /></div>
                <div><label className={labelClass}>Fecha</label><input className="hostly-input" type="date" lang="es-ES" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} required disabled={busy} /></div>
                <div><label className={labelClass}>Hora</label><input className="hostly-input" type="time" value={draft.time} onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))} required disabled={busy} /></div>
                <div><label className={labelClass}>Duración prevista</label><select className="hostly-select" value={draft.durationMinutes} onChange={(e) => setDraft((d) => ({ ...d, durationMinutes: e.target.value }))} disabled={busy}><option value="60">1 h</option><option value="90">1 h 30</option><option value="120">2 h</option><option value="150">2 h 30</option><option value="180">3 h</option><option value="240">4 h</option></select></div>
                <div><label className={labelClass}>Mesa</label><select className="hostly-select" value={draft.tableId} onChange={(e) => setDraft((d) => ({ ...d, tableId: e.target.value }))} disabled={busy}><option value="">Pendiente de asignar</option>{editorReservationOptions.map((table) => { const availability = tableAvailability(table, draft, editor.mode === "edit" ? editor.reservationId : undefined); const selected = draft.tableId === table.id; return <option key={table.id} value={table.id} disabled={!availability.available && !selected}>{displayLabels.get(table.id) ?? table.name}{!availability.available && !selected ? ` · ${availability.reason}` : ""}</option>; })}</select></div>
                <div className="md:col-span-2 flex justify-end"><HostlyButton type="button" variant="secondary" size="compact" onClick={() => setMapPicker(editor.mode === "create" ? { mode: "create" } : { mode: "edit", reservationId: editor.reservationId })} disabled={busy || !draft.date}>Elegir en mapa</HostlyButton></div>
                <div className="md:col-span-2"><label className={labelClass}>Notas</label><textarea className="hostly-input min-h-20 resize-y" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} disabled={busy} /></div>
                <div className="md:col-span-2 flex flex-wrap justify-end gap-2 border-t border-[var(--hostly-line)] pt-3"><HostlyButton type="button" variant="secondary" size="touch" onClick={() => setEditor(null)} disabled={busy}>Cancelar</HostlyButton><HostlyButton type="submit" variant="primary" size="touch" disabled={busy}>{busy ? "Guardando…" : editor.mode === "create" ? "Guardar reserva" : "Guardar cambios"}</HostlyButton></div>
              </form>
            </div>
          </section>
        ) : null}

        {reservations.length === 0 ? (
          <section className="hostly-mobile-section !py-6"><div className="hostly-mobile-empty-state hostly-mobile-card hostly-mobile-card--compact"><h3 className="hostly-mobile-empty-state__title">No hay reservas para este día</h3><p className="hostly-mobile-empty-state__desc">Crea una reserva o cambia la fecha.</p></div></section>
        ) : (
          <section className="hostly-mobile-section !py-2">
            <div className="flex flex-col gap-2.5">
              {reservations.map((reservation) => {
                const assignment = reservationAssignmentLabel(reservation);
                const options = reservationTableOptionsForReference({ activeTables, allTables: tables, restaurantId: restaurantId ?? "", reference: reservation });
                return (
                  <article key={reservation.id} className="hostly-mobile-card hostly-mobile-card--compact flex flex-col gap-3 border-l-[3px] border-l-[var(--hostly-ice-200)]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="text-lg font-bold tabular-nums text-[var(--hostly-navy-deep)]">{reservation.time}</span><span className="font-semibold text-[var(--hostly-ink)]">{reservation.customerName}</span><span className="text-sm text-[var(--hostly-ink-muted)]">{reservation.partySize} comensales · {reservation.durationMinutes ?? DEFAULT_RESERVATION_DURATION_MINUTES} min</span></div><div className={`mt-1 text-sm font-semibold ${assignment ? "text-amber-700" : "text-[var(--hostly-accent)]"}`}>{tableContext(reservation, displayLabels)}</div></div>
                      <HostlyStatusBadge tone={statusTone(reservation.status)}>{statusLabel(reservation.status)}</HostlyStatusBadge>
                    </div>
                    {reservation.customerPhone ? <div className="text-sm text-[var(--hostly-ink-muted)]">{reservation.customerPhone}</div> : null}
                    {reservation.notes ? <div className="rounded-lg bg-[var(--hostly-surface-muted)] px-3 py-2 text-sm text-[var(--hostly-ink-muted)]">{reservation.notes}</div> : null}
                    {reservation.status === "booked" ? (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                        <select className="hostly-select min-w-0" value={reservation.tableId ?? ""} onChange={(e) => void assignTable(reservation, e.target.value)} disabled={busy}><option value="">Pendiente de mesa</option>{options.map((option) => { const table = activeTables.find((candidate) => candidate.id === option.id); const availability = table ? tableAvailability(table, draftFromReservation(reservation), reservation.id) : { available: false, reason: "Mesa inactiva" }; const isCurrent = reservation.tableId === option.id; return <option key={option.id} value={option.id} disabled={option.disabled || (!availability.available && !isCurrent)}>{displayLabels.get(option.id) ?? option.label}{!availability.available && !isCurrent ? ` · ${availability.reason}` : ""}</option>; })}</select>
                        <HostlyButton variant="secondary" size="compact" onClick={() => setMapPicker({ mode: "edit", reservationId: reservation.id })} disabled={busy}>Mapa</HostlyButton>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap justify-end gap-2">
                      {reservation.status === "booked" ? <><HostlyButton variant="secondary" size="compact" onClick={() => openEdit(reservation)} disabled={busy}>Editar</HostlyButton><HostlyButton variant="primary" size="compact" onClick={() => void changeStatus(reservation, "seated")} disabled={busy || !reservation.tableId}>Ha llegado</HostlyButton><HostlyButton variant="destructive" size="compact" onClick={() => void changeStatus(reservation, "no_show")} disabled={busy}>No presentado</HostlyButton><HostlyButton variant="destructive" size="compact" onClick={() => void changeStatus(reservation, "cancelled")} disabled={busy}>Cancelar</HostlyButton></> : null}
                      {reservation.status === "seated" ? <><HostlyButton variant="secondary" size="compact" onClick={() => reservation.tableId && router.push(`/dashboard/operacion?tab=tpv&tpvView=comanda&tableId=${encodeURIComponent(reservation.tableId)}`)} disabled={busy || !reservation.tableId}>Abrir mesa</HostlyButton><HostlyButton variant="secondary" size="compact" onClick={() => void changeStatus(reservation, "completed")} disabled={busy}>Completar</HostlyButton></> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {mapPicker && mapPickerContext && restaurantId ? (
        <ReservationFloorMapPicker open restaurantId={restaurantId} reservationDateYmd={mapPickerContext.date} tables={tables} initialTableId={mapPickerContext.initialTableId} initialFloorPlanId={mapPickerContext.initialFloorPlanId} excludeReservationId={mapPickerContext.excludeReservationId} onClose={() => setMapPicker(null)} onConfirm={mapPickerContext.confirm} />
      ) : null}
    </div>
  );
}
