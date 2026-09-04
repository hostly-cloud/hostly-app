"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { getTables, type Table } from "@/lib/firestore/tables";
import { getFloorPlans, type FloorPlan } from "@/lib/firestore/floorPlans";
import {
  createReservation,
  listenReservationsForDate,
  updateReservation,
  type Reservation,
  type ReservationStatus,
} from "@/lib/firestore/reservations";
import { computeReservationDayMetrics } from "@/lib/reservas/reservation-metrics";
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

const upcomingRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(251, 191, 36, 0.28)",
  background: "var(--hostly-warning-soft)",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--hostly-navy-mid)",
  marginBottom: 6,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const delayedRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(220, 100, 100, 0.22)",
  background: "var(--hostly-danger-soft)",
};

function todayYmd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDayLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").trim());
  if (!m) return ymd;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(dt);
}

function toMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  if (!m) return 0;
  const hh = Number.parseInt(m[1] ?? "0", 10);
  const mm = Number.parseInt(m[2] ?? "0", 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

function statusLabel(s: ReservationStatus): string {
  switch (s) {
    case "seated":
      return "Llegada";
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

function statusBadgeTone(s: ReservationStatus): HostlyStatusBadgeTone {
  if (s === "seated") {
    return "info";
  }
  if (s === "completed") {
    return "success";
  }
  if (s === "no_show") {
    return "danger";
  }
  if (s === "cancelled") {
    return "muted";
  }
  return "warning";
}

export default function ReservasView() {
  const router = useRouter();
  const {
    restaurantId: profileRestaurantId,
    ready: authReady,
    user,
  } = useAuth();
  const restaurantId = profileRestaurantId ?? null;

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Día cuya lista se escucha en Firestore (debe coincidir con la fecha de la reserva creada). */
  const [viewDate, setViewDate] = useState(() => todayYmd());
  const [listError, setListError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingReservation, setSavingReservation] = useState(false);

  const [tables, setTables] = useState<Table[]>([]);
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);

  const [floorMapPicker, setFloorMapPicker] = useState<
    | null
    | { mode: "create" }
    | { mode: "edit"; reservationId: string }
  >(null);

  const [draft, setDraft] = useState({
    customerName: "",
    customerPhone: "",
    date: todayYmd(),
    time: "20:00",
    partySize: "2",
    tableId: "",
    notes: "",
  });

  useEffect(() => {
    if (!authReady || !user?.uid || !restaurantId || !isFirebaseConfigured) {
      setReservations([]);
      setListError(null);
      return;
    }
    setListError(null);
    const unsub = listenReservationsForDate(
      restaurantId,
      viewDate,
      setReservations,
      () => {
        setListError("No se pudieron cargar las reservas. Vuelve a intentarlo en unos instantes.");
      },
    );
    return () => unsub();
  }, [authReady, user?.uid, restaurantId, viewDate]);

  useEffect(() => {
    if (!authReady || !restaurantId || !isFirebaseConfigured) {
      setTables([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const t = await getTables(restaurantId);
        if (cancelled) return;
        setTables(t);
      } catch {
        if (!cancelled) setTables([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (!authReady || !restaurantId || !isFirebaseConfigured) {
      setFloorPlans([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const fp = await getFloorPlans(restaurantId);
        if (cancelled) return;
        setFloorPlans(fp);
      } catch {
        if (!cancelled) setFloorPlans([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, restaurantId]);

  const tablesOptions = useMemo(() => {
    return activeReservationTables(tables, restaurantId ?? "");
  }, [tables, restaurantId]);
  const tableDisplayLabels = useMemo(
    () => reservationTableDisplayLabels(tablesOptions, floorPlans),
    [tablesOptions, floorPlans],
  );

  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 30000);
    return () => window.clearInterval(id);
  }, []);

  const upcoming = useMemo(() => {
    const max = nowMin + 90;
    const isViewingToday = viewDate === todayYmd();
    if (!isViewingToday) return [];
    return reservations.filter(
      (r) =>
        r.status === "booked" &&
        r.date === viewDate &&
        toMinutes(r.time) >= nowMin &&
        toMinutes(r.time) <= max,
    );
  }, [reservations, nowMin, viewDate]);

  const delayed = useMemo(() => {
    const isViewingToday = viewDate === todayYmd();
    if (!isViewingToday) return [];
    return reservations.filter(
      (r) =>
        r.status === "booked" &&
        r.date === viewDate &&
        toMinutes(r.time) <= nowMin - 15,
    );
  }, [reservations, nowMin, viewDate]);

  const day = viewDate;
  const metrics = useMemo(() => computeReservationDayMetrics(reservations, day), [reservations, day]);

  async function handleCreateReservation() {
    if (!restaurantId || !isFirebaseConfigured) return;
    setSaveError(null);

    const name = String(draft.customerName ?? "").trim();
    if (!name) {
      setSaveError("El nombre del cliente es obligatorio.");
      return;
    }
    const dateStr = String(draft.date ?? "").trim();
    if (!dateStr) {
      setSaveError("La fecha es obligatoria.");
      return;
    }
    const timeStr = String(draft.time ?? "").trim();
    if (!timeStr) {
      setSaveError("La hora es obligatoria.");
      return;
    }
    const pax = Math.round(Number(draft.partySize));
    if (!Number.isFinite(pax) || pax < 1) {
      setSaveError("Indica al menos 1 comensal.");
      return;
    }

    const partySize = Math.max(1, pax);
    const table = draft.tableId ? tablesOptions.find((t) => t.id === draft.tableId) : undefined;
    const fpId = table?.floorPlanId?.trim() ?? "";
    const fpName = fpId
      ? floorPlans.find((p) => p.id === fpId)?.name?.trim() ?? ""
      : "";
    const payload = {
      customerName: draft.customerName,
      customerPhone: draft.customerPhone,
      date: draft.date,
      time: draft.time,
      partySize,
      status: "booked" as const,
      ...(table ? { tableId: table.id, tableLabel: table.name } : {}),
      ...(fpId ? { floorPlanId: fpId, ...(fpName ? { floorName: fpName } : {}) } : {}),
      notes: draft.notes,
    };
    setSavingReservation(true);
    setBusy(true);
    try {
      await createReservation(restaurantId, payload);
      setViewDate(draft.date);
      setCreating(false);
      setDraft((d) => ({
        ...d,
        customerName: "",
        customerPhone: "",
        date: d.date,
        time: d.time,
        partySize: d.partySize,
        tableId: "",
        notes: "",
      }));
    } catch (e) {
      console.error("handleCreateReservation", e);
      const msg =
        e instanceof Error ? e.message : typeof e === "string" ? e : "Error al guardar la reserva";
      setSaveError(msg);
    } finally {
      setSavingReservation(false);
      setBusy(false);
    }
  }

  async function handleSeatReservation(r: Reservation) {
    if (!restaurantId || !isFirebaseConfigured) return;
    setBusy(true);
    try {
      await updateReservation(r.id, { status: "seated" });
      const tableId = typeof r.tableId === "string" ? r.tableId.trim() : "";
      if (tableId) {
        router.push(
          `/dashboard/operacion?tab=tpv&tpvView=comanda&tableId=${encodeURIComponent(
            tableId,
          )}`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateReservationStatus(
    reservationId: string,
    nextStatus: ReservationStatus,
  ) {
    if (!restaurantId || !isFirebaseConfigured) return;
    if (nextStatus === "no_show") {
      if (!window.confirm("¿Marcar como no presentado?")) return;
    }
    if (nextStatus === "cancelled") {
      if (!window.confirm("¿Cancelar esta reserva?")) return;
    }
    if (nextStatus === "completed") {
      if (!window.confirm("¿Completar esta reserva?")) return;
    }
    setBusy(true);
    try {
      await updateReservation(reservationId, { status: nextStatus });
    } finally {
      setBusy(false);
    }
  }

  function handleOpenTable(r: Reservation) {
    const tableId = typeof r.tableId === "string" ? r.tableId.trim() : "";
    if (!tableId) return;
    router.push(
      `/dashboard/operacion?tab=tpv&tpvView=comanda&tableId=${encodeURIComponent(
        tableId,
      )}`,
    );
  }

  const handleAssignReservationTable = useCallback(
    async (reservationId: string, tableId: string) => {
      if (!restaurantId || !isFirebaseConfigured) return;
      const tid = String(tableId ?? "").trim();
      const table = tid ? tablesOptions.find((t) => t.id === tid) : undefined;
      setBusy(true);
      try {
        if (!table) {
          await updateReservation(reservationId, {
            tableId: "",
            tableLabel: "",
            floorPlanId: "",
            floorName: "",
            zoneId: "",
            zoneName: "",
          });
          return;
        }
        const fpId = table.floorPlanId?.trim() ?? "";
        const fpName = fpId
          ? floorPlans.find((p) => p.id === fpId)?.name?.trim() ?? ""
          : "";
        await updateReservation(reservationId, {
          tableId: table.id,
          tableLabel: table.name,
          ...(fpId
            ? { floorPlanId: fpId, ...(fpName ? { floorName: fpName } : {}) }
            : { floorPlanId: "", floorName: "" }),
          zoneId: table.zoneId ?? "",
          zoneName: table.zoneName ?? table.zone ?? "",
        });
      } finally {
        setBusy(false);
      }
    },
    [restaurantId, tablesOptions, floorPlans],
  );

  const floorMapPickerContext = useMemo(() => {
    if (!floorMapPicker || !restaurantId) return null;
    if (floorMapPicker.mode === "create") {
      return {
        reservationDateYmd: String(draft.date ?? "").trim(),
        initialTableId: draft.tableId.trim() || null,
        initialFloorPlanId: null as string | null,
        excludeReservationId: null as string | null,
        onConfirm: (payload: ReservationFloorMapPickerConfirm) => {
          setDraft((d) => ({ ...d, tableId: payload.tableId }));
          setFloorMapPicker(null);
        },
      };
    }
    const r = reservations.find((x) => x.id === floorMapPicker.reservationId);
    if (!r) return null;
    return {
      reservationDateYmd: String(r.date ?? "").trim(),
      initialTableId:
        typeof r.tableId === "string" && r.tableId.trim()
          ? r.tableId.trim()
          : null,
      initialFloorPlanId:
        typeof r.floorPlanId === "string" && r.floorPlanId.trim()
          ? r.floorPlanId.trim()
          : null,
      excludeReservationId: r.id,
      onConfirm: (payload: ReservationFloorMapPickerConfirm) => {
        void (async () => {
          try {
            await updateReservation(floorMapPicker.reservationId, {
              tableId: payload.tableId,
              tableLabel: payload.tableLabel,
              floorPlanId: payload.floorPlanId.trim()
                ? payload.floorPlanId.trim()
                : "",
              floorName: payload.floorName.trim()
                ? payload.floorName.trim()
                : "",
              zoneId: payload.zoneId ?? "",
              zoneName: payload.zoneName ?? "",
            });
            setFloorMapPicker(null);
          } catch (e) {
            console.error(e);
          }
        })();
      },
    };
  }, [
    floorMapPicker,
    restaurantId,
    draft.date,
    draft.tableId,
    reservations,
  ]);

  useEffect(() => {
    if (floorMapPicker?.mode !== "edit") return;
    const exists = reservations.some((r) => r.id === floorMapPicker.reservationId);
    if (!exists) setFloorMapPicker(null);
  }, [floorMapPicker, reservations]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div className="hostly-mobile-content" style={{ flex: 1, minHeight: 0, boxSizing: "border-box" }}>
        <div
          className="hostly-mobile-stack"
          style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))" }}
        >
          <header className="hostly-mobile-header md:hidden">
            <div className="hostly-mobile-header-row">
              <Link href="/dashboard/operacion" className="hostly-mobile-back" aria-label="Volver a Operación">
                <span className="text-lg font-bold leading-none" aria-hidden>
                  ‹
                </span>
              </Link>
              <div className="hostly-mobile-title-block">
                <h1 className="hostly-mobile-title">Reservas</h1>
                <p className="hostly-mobile-subtitle">Gestiona llegadas, ausencias y ocupación</p>
              </div>
            </div>
          </header>

          <section className="hostly-mobile-section hostly-reservations-day-section !pt-2 !pb-0">
            <ReservationDayToolbar
              dayLabel={formatDayLabel(viewDate)}
              isToday={viewDate === todayYmd()}
              value={viewDate}
              onChange={setViewDate}
              onPrevious={() => setViewDate((current) => shiftReservationDay(current, -1))}
              onToday={() => setViewDate(todayYmd())}
              onNext={() => setViewDate((current) => shiftReservationDay(current, 1))}
              onCreate={() => {
                setSaveError(null);
                setDraft((current) => ({ ...current, date: viewDate }));
                setCreating(true);
              }}
            />
          </section>

          <section className="hostly-mobile-section !py-2">
            <div
              className="hostly-mobile-kpi-grid hostly-mobile-kpi-grid--cols-4 hostly-reservations-kpi-rail"
              aria-label="Métricas de reservas del día"
              tabIndex={0}
            >
              <div className="hostly-mobile-kpi hostly-mobile-kpi--warning">
                <div className="hostly-mobile-kpi__label">Previstas</div>
                <div className="hostly-mobile-kpi__value">{metrics.booked}</div>
              </div>
              <div className="hostly-mobile-kpi hostly-mobile-kpi--info">
                <div className="hostly-mobile-kpi__label">Llegadas</div>
                <div className="hostly-mobile-kpi__value">{metrics.seated}</div>
              </div>
              <div className="hostly-mobile-kpi hostly-mobile-kpi--success">
                <div className="hostly-mobile-kpi__label">Completadas</div>
                <div className="hostly-mobile-kpi__value">{metrics.completed}</div>
              </div>
              <div className="hostly-mobile-kpi hostly-mobile-kpi--danger">
                <div className="hostly-mobile-kpi__label">No presentadas</div>
                <div className="hostly-mobile-kpi__value">{metrics.noShow}</div>
              </div>
              <div className="hostly-mobile-kpi hostly-mobile-kpi--neutral">
                <div className="hostly-mobile-kpi__label">Canceladas</div>
                <div className="hostly-mobile-kpi__value">{metrics.cancelled}</div>
              </div>
              <div className="hostly-mobile-kpi hostly-mobile-kpi--neutral">
                <div className="hostly-mobile-kpi__label">Comensales previstos</div>
                <div className="hostly-mobile-kpi__value">{metrics.paxPlanned}</div>
              </div>
              <div className="hostly-mobile-kpi hostly-mobile-kpi--neutral">
                <div className="hostly-mobile-kpi__label">Comensales llegados</div>
                <div className="hostly-mobile-kpi__value">{metrics.paxSeated}</div>
              </div>
            </div>
          </section>

          {listError ? (
            <section className="hostly-mobile-section !py-0">
              <div
                className="hostly-mobile-card-soft"
                style={{
                  borderColor: "rgba(180, 70, 70, 0.28)",
                  color: "#7f1d1d",
                }}
                role="alert"
              >
                <p className="m-0 text-sm font-semibold">{listError}</p>
              </div>
            </section>
          ) : null}

          {upcoming.length > 0 || delayed.length > 0 ? (
            <section className="hostly-mobile-section !py-2">
              <div className="hostly-mobile-card flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <span className="hostly-mobile-pill pointer-events-none text-[12px] font-bold text-[var(--hostly-navy-deep)]">
                    {upcoming.length} próximas
                  </span>
                  <span
                    className="hostly-mobile-pill pointer-events-none text-[12px] font-bold"
                    style={{ color: "#7f1d1d", borderColor: "rgba(180, 70, 70, 0.22)" }}
                  >
                    {delayed.length} retrasadas
                  </span>
                </div>

                {upcoming.length > 0 ? (
                  <div>
                    <div className="hostly-mobile-text-caption mb-2">Próximas</div>
                    <div className="flex flex-col gap-2">
                      {upcoming.map((r) => {
                        const tableZone = [r.tableLabel, r.floorName, r.zoneName].filter(Boolean).join(" · ");
                        return (
                          <div key={`up-${r.id}`} style={upcomingRowStyle}>
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-[var(--hostly-ink)]">
                              <span className="text-base font-bold tabular-nums text-[var(--hostly-navy-deep)]">
                                {r.time || "—"}
                              </span>
                              <span className="font-semibold">{r.customerName || "—"}</span>
                              <span className="text-sm text-[var(--hostly-ink-muted)]">
                                {r.partySize ? `${r.partySize} comensales` : "—"}
                              </span>
                              {tableZone ? (
                                <span className="text-sm font-medium text-[var(--hostly-accent)]">{tableZone}</span>
                              ) : null}
                            </div>
                            {r.status === "booked" ? (
                              <HostlyButton
                                variant="primary"
                                size="compact"
                                className="shrink-0"
                                onClick={() => void handleSeatReservation(r)}
                                disabled={busy}
                              >
                                Ha llegado
                              </HostlyButton>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {delayed.length > 0 ? (
                  <div>
                    <div className="hostly-mobile-text-caption mb-2 !text-red-800">Retrasadas</div>
                    <div className="flex flex-col gap-2">
                      {delayed.map((r) => {
                        const tableZone = [r.tableLabel, r.floorName, r.zoneName].filter(Boolean).join(" · ");
                        return (
                          <div key={`dl-${r.id}`} style={delayedRowStyle}>
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-[var(--hostly-ink)]">
                              <span className="text-base font-bold tabular-nums text-[var(--hostly-navy-deep)]">
                                {r.time || "—"}
                              </span>
                              <span className="font-semibold">{r.customerName || "—"}</span>
                              <span className="text-sm text-[var(--hostly-ink-muted)]">
                                {r.partySize ? `${r.partySize} comensales` : "—"}
                              </span>
                              {tableZone ? (
                                <span className="text-sm font-medium text-[var(--hostly-accent)]">{tableZone}</span>
                              ) : null}
                              <span
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: 720,
                                  letterSpacing: "0.04em",
                                  textTransform: "uppercase",
                                  background: "var(--hostly-danger-soft)",
                                  border: "1px solid rgba(180, 70, 70, 0.22)",
                                  color: "#7f1d1d",
                                }}
                              >
                                Retrasada
                              </span>
                            </div>
                            {r.status === "booked" ? (
                              <HostlyButton
                                variant="primary"
                                size="compact"
                                className="shrink-0"
                                onClick={() => void handleSeatReservation(r)}
                                disabled={busy}
                              >
                                Ha llegado
                              </HostlyButton>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {creating ? (
            <section className="hostly-mobile-section !py-2">
              <div className="hostly-mobile-card flex max-h-[min(calc(100dvh-120px),calc(100vh-120px))] flex-col gap-0 overflow-hidden md:max-h-[920px]">
                <div className="mb-4 shrink-0">
                  <h4 className="hostly-mobile-title !text-[19px]">Nueva reserva</h4>
                  <p className="hostly-mobile-subtitle !mt-2">
                    Desplázate dentro del recuadro si hace falta. Los botones quedan fijos abajo; pulsa{" "}
                    <strong>Guardar reserva</strong> cuando termines.
                  </p>
                </div>

                <form
                  className="flex min-h-0 flex-1 flex-col gap-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleCreateReservation();
                  }}
                >
                  <div
                    className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
                    style={{ WebkitOverflowScrolling: "touch", paddingRight: 4 }}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                      <div className="md:col-span-2">
                        <label style={labelStyle}>Nombre</label>
                        <input
                          className="hostly-input"
                          value={draft.customerName}
                          onChange={(e) => setDraft((d) => ({ ...d, customerName: e.target.value }))}
                          autoComplete="name"
                          disabled={savingReservation}
                        />
                      </div>
                      {saveError ? (
                        <div
                          className="hostly-mobile-card-soft md:col-span-2"
                          style={{
                            borderColor: "rgba(180, 70, 70, 0.28)",
                            color: "#7f1d1d",
                          }}
                          role="alert"
                        >
                          <p className="m-0 text-sm font-semibold">{saveError}</p>
                        </div>
                      ) : null}
                      <div>
                        <label style={labelStyle}>Teléfono</label>
                        <input
                          className="hostly-input"
                          value={draft.customerPhone}
                          onChange={(e) => setDraft((d) => ({ ...d, customerPhone: e.target.value }))}
                          autoComplete="tel"
                          disabled={savingReservation}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Personas</label>
                        <input
                          className="hostly-input"
                          type="number"
                          min={1}
                          value={draft.partySize}
                          onChange={(e) => setDraft((d) => ({ ...d, partySize: e.target.value }))}
                          disabled={savingReservation}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Fecha</label>
                        <input
                          className="hostly-input"
                          type="date"
                          value={draft.date}
                          onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                          required
                          disabled={savingReservation}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Hora</label>
                        <input
                          className="hostly-input"
                          type="time"
                          value={draft.time}
                          onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                          required
                          disabled={savingReservation}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label style={labelStyle}>Mesa (opcional)</label>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                          <select
                            className="hostly-select min-w-0 flex-1"
                            value={draft.tableId}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, tableId: e.target.value }))
                            }
                            disabled={savingReservation}
                          >
                            <option value="">—</option>
                            {tablesOptions.map((t) => (
                              <option key={t.id} value={t.id}>
                                {tableDisplayLabels.get(t.id) ?? t.name}
                              </option>
                            ))}
                          </select>
                          <HostlyButton
                            variant="secondary"
                            size="compact"
                            className="shrink-0 whitespace-nowrap sm:self-stretch"
                            disabled={savingReservation || !restaurantId || !draft.date}
                            onClick={() => setFloorMapPicker({ mode: "create" })}
                          >
                            Elegir en mapa
                          </HostlyButton>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label style={labelStyle}>Notas</label>
                        <input
                          className="hostly-input"
                          value={draft.notes}
                          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                          disabled={savingReservation}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-0 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-[var(--hostly-line)] bg-[var(--hostly-surface-card-solid)] pt-4">
                    <HostlyButton
                      variant="secondary"
                      size="touch"
                      className="disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => {
                        setCreating(false);
                        setSaveError(null);
                      }}
                      disabled={savingReservation}
                    >
                      Cancelar
                    </HostlyButton>
                    <HostlyButton
                      type="submit"
                      variant="primary"
                      size="touch"
                      className="disabled:cursor-wait disabled:opacity-90"
                      disabled={savingReservation}
                    >
                      {savingReservation ? "Guardando…" : "Guardar reserva"}
                    </HostlyButton>
                  </div>
                </form>
              </div>
            </section>
          ) : null}

          {reservations.length === 0 ? (
            <section className="hostly-mobile-section !py-6">
              <div className="hostly-mobile-empty-state hostly-mobile-card hostly-mobile-card--compact">
                <div className="hostly-mobile-empty-state__icon" aria-hidden>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M8 2v3m8-3v3M4 9h16M5 5h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h3 className="hostly-mobile-empty-state__title">No hay reservas para este día</h3>
                <p className="hostly-mobile-empty-state__desc">
                  Crea una reserva o cambia la fecha seleccionada.
                </p>
              </div>
            </section>
          ) : (
            <section className="hostly-mobile-section !py-2">
              <div className="flex flex-col gap-2.5">
                {reservations.map((r) => {
                  const tableZone = [r.tableLabel, r.floorName, r.zoneName].filter(Boolean).join(" · ");
                  const reservationTableOptions = reservationTableOptionsForReference({
                    activeTables: tablesOptions,
                    allTables: tables,
                    restaurantId: restaurantId ?? "",
                    reference: r,
                  }).map((option) => ({
                    ...option,
                    label: tableDisplayLabels.get(option.id) ?? option.label,
                  }));
                  return (
                    <div
                      key={r.id}
                      className="hostly-mobile-card hostly-mobile-card--compact flex flex-col gap-3 border-l-[3px] border-l-[var(--hostly-ice-200)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="text-lg font-bold tabular-nums text-[var(--hostly-navy-deep)]">
                            {r.time || "—"}
                          </span>
                          <span className="font-semibold text-[var(--hostly-ink)]">{r.customerName || "—"}</span>
                          <span className="text-sm font-medium text-[var(--hostly-ink-muted)]">
                            {r.partySize ? `${r.partySize} comensales` : "—"}
                          </span>
                          {tableZone ? (
                            <span className="text-sm font-semibold text-[var(--hostly-accent)]">{tableZone}</span>
                          ) : null}
                        </div>
                        <HostlyStatusBadge
                          tone={statusBadgeTone(r.status)}
                          className="shrink-0"
                          aria-label={`Estado: ${statusLabel(r.status)}`}
                        >
                          {statusLabel(r.status)}
                        </HostlyStatusBadge>
                      </div>

                      <div>
                        <label style={labelStyle}>Mesa</label>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                          <select
                            className="hostly-select min-w-0 flex-1"
                            value={r.tableId ?? ""}
                            onChange={(e) =>
                              void handleAssignReservationTable(r.id, e.target.value)
                            }
                            disabled={busy}
                          >
                            <option value="">Sin mesa</option>
                            {reservationTableOptions.map((option) => (
                              <option
                                key={option.id}
                                value={option.id}
                                disabled={option.disabled}
                              >
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <HostlyButton
                            variant="secondary"
                            size="compact"
                            className="shrink-0 whitespace-nowrap sm:self-stretch"
                            disabled={busy || !restaurantId}
                            onClick={() =>
                              setFloorMapPicker({ mode: "edit", reservationId: r.id })
                            }
                          >
                            Elegir en mapa
                          </HostlyButton>
                        </div>
                      </div>

                      {r.status === "booked" ? (
                        <div className="mt-1 flex flex-wrap justify-end gap-2">
                          <HostlyButton
                            variant="primary"
                            size="compact"
                            onClick={() => void handleSeatReservation(r)}
                            disabled={busy}
                          >
                            Ha llegado
                          </HostlyButton>
                          <HostlyButton
                            variant="destructive"
                            size="compact"
                            className="font-semibold text-red-800"
                            style={{ background: "var(--hostly-danger-soft)", borderColor: "rgba(180, 70, 70, 0.22)" }}
                            onClick={() => void handleUpdateReservationStatus(r.id, "no_show")}
                            disabled={busy}
                          >
                            No presentado
                          </HostlyButton>
                          <HostlyButton
                            variant="destructive"
                            size="compact"
                            className="font-semibold"
                            onClick={() => void handleUpdateReservationStatus(r.id, "cancelled")}
                            disabled={busy}
                          >
                            Cancelar
                          </HostlyButton>
                        </div>
                      ) : r.status === "seated" ? (
                        <div className="mt-1 flex flex-wrap justify-end gap-2">
                          {r.tableId ? (
                            <HostlyButton
                              variant="secondary"
                              size="compact"
                              onClick={() => handleOpenTable(r)}
                              disabled={busy}
                            >
                              Abrir mesa
                            </HostlyButton>
                          ) : null}
                          <HostlyButton
                            variant="secondary"
                            size="compact"
                            className="font-semibold"
                            style={{
                              background: "var(--hostly-success-soft)",
                              borderColor: "rgba(46, 125, 80, 0.22)",
                              color: "var(--hostly-navy-deep)",
                            }}
                            onClick={() => void handleUpdateReservationStatus(r.id, "completed")}
                            disabled={busy}
                          >
                            Completar
                          </HostlyButton>
                        </div>
                      ) : null}
                      {r.notes && r.notes.length <= 80 ? (
                        <div className="text-sm font-medium text-[var(--hostly-ink-muted)]">{r.notes}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {floorMapPicker != null && floorMapPickerContext ? (
        <ReservationFloorMapPicker
          open
          restaurantId={restaurantId}
          reservationDateYmd={floorMapPickerContext.reservationDateYmd}
          tables={tables}
          initialTableId={floorMapPickerContext.initialTableId}
          initialFloorPlanId={floorMapPickerContext.initialFloorPlanId}
          excludeReservationId={floorMapPickerContext.excludeReservationId}
          onClose={() => setFloorMapPicker(null)}
          onConfirm={floorMapPickerContext.onConfirm}
        />
      ) : null}
    </div>
  );
}
