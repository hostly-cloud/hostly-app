"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { getTables, type Table } from "@/lib/firestore/tables";
import {
  createReservation,
  listenReservationsForDate,
  updateReservation,
  type Reservation,
  type ReservationStatus,
} from "@/lib/firestore/reservations";
import { computeReservationDayMetrics } from "@/lib/reservas/reservation-metrics";

const cardStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(15, 23, 42, 0.55)",
  padding: 14,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: "#e2e8f0",
  letterSpacing: "-0.02em",
};

const primaryBtn: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(56, 189, 248, 0.35)",
  background: "rgba(56, 189, 248, 0.18)",
  color: "#e0f2fe",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/** Botón principal del formulario “Guardar reserva”: más visible que el genérico. */
const formSaveBtn: CSSProperties = {
  padding: "12px 24px",
  borderRadius: 10,
  border: "1px solid rgba(56, 189, 248, 0.45)",
  background: "linear-gradient(180deg, rgba(56, 189, 248, 0.35) 0%, rgba(56, 189, 248, 0.22) 100%)",
  color: "#f0f9ff",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "0 2px 10px rgba(56, 189, 248, 0.12)",
  minWidth: 180,
};

const secondaryBtn: CSSProperties = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "transparent",
  color: "#e2e8f0",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.5)",
  color: "#f8fafc",
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#94a3b8",
  marginBottom: 6,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
};

const metricsBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.45)",
};

function metricChipStyle(tone: "amber" | "blue" | "green" | "red" | "gray" | "neutral"): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "baseline",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "-0.01em",
    whiteSpace: "nowrap",
  };
  if (tone === "amber") {
    return { ...base, background: "rgba(251, 191, 36, 0.14)", border: "1px solid rgba(251, 191, 36, 0.28)", color: "#fed7aa" };
  }
  if (tone === "blue") {
    return { ...base, background: "rgba(59, 130, 246, 0.16)", border: "1px solid rgba(59, 130, 246, 0.32)", color: "#dbeafe" };
  }
  if (tone === "green") {
    return { ...base, background: "rgba(34, 197, 94, 0.16)", border: "1px solid rgba(34, 197, 94, 0.32)", color: "#bbf7d0" };
  }
  if (tone === "red") {
    return { ...base, background: "rgba(248, 113, 113, 0.14)", border: "1px solid rgba(248, 113, 113, 0.32)", color: "#fecaca" };
  }
  if (tone === "gray") {
    return { ...base, background: "rgba(148, 163, 184, 0.14)", border: "1px solid rgba(148, 163, 184, 0.28)", color: "#e2e8f0" };
  }
  return { ...base, background: "rgba(148, 163, 184, 0.12)", border: "1px solid rgba(148, 163, 184, 0.22)", color: "#e2e8f0" };
}

function MetricChip({ label, value, tone }: { label: string; value: string | number; tone: "amber" | "blue" | "green" | "red" | "gray" | "neutral" }) {
  return (
    <span style={metricChipStyle(tone)}>
      <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, letterSpacing: "0.02em" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 900 }}>{value}</span>
    </span>
  );
}

function todayYmd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
      return "No show";
    case "cancelled":
      return "Cancelada";
    default:
      return "Reservada";
  }
}

function statusBadgeStyle(s: ReservationStatus): CSSProperties {
  if (s === "seated") {
    return {
      padding: "4px 8px",
      borderRadius: 999,
      background: "rgba(59, 130, 246, 0.18)",
      border: "1px solid rgba(59, 130, 246, 0.36)",
      color: "#dbeafe",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: "0.03em",
      textTransform: "uppercase",
    };
  }
  if (s === "completed") {
    return {
      padding: "4px 8px",
      borderRadius: 999,
      background: "rgba(34, 197, 94, 0.16)",
      border: "1px solid rgba(34, 197, 94, 0.32)",
      color: "#bbf7d0",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: "0.03em",
      textTransform: "uppercase",
    };
  }
  if (s === "no_show" || s === "cancelled") {
    return {
      padding: "4px 8px",
      borderRadius: 999,
      background:
        s === "no_show"
          ? "rgba(248, 113, 113, 0.14)"
          : "rgba(148, 163, 184, 0.14)",
      border:
        s === "no_show"
          ? "1px solid rgba(248, 113, 113, 0.32)"
          : "1px solid rgba(148, 163, 184, 0.28)",
      color: s === "no_show" ? "#fecaca" : "#e2e8f0",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: "0.03em",
      textTransform: "uppercase",
    };
  }
  return {
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(251, 191, 36, 0.14)",
    border: "1px solid rgba(251, 191, 36, 0.28)",
    color: "#fed7aa",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  };
}

export default function ReservasView() {
  const router = useRouter();
  const { restaurantId: profileRestaurantId, user, ready: authReady } = useAuth();
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
    if (!authReady || !restaurantId || !isFirebaseConfigured) {
      setReservations([]);
      setListError(null);
      return;
    }
    setListError(null);
    const unsub = listenReservationsForDate(
      restaurantId,
      viewDate,
      setReservations,
      (err) => {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err && "code" in err
              ? String((err as { code?: string }).code)
              : String(err);
        setListError(
          `No se pudieron cargar las reservas (${msg}). Comprueba índices Firestore y reglas.`,
        );
      },
    );
    return () => unsub();
  }, [authReady, restaurantId, viewDate]);

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

  const tablesOptions = useMemo(() => {
    return [...tables]
      .filter((t) => t.type === "table")
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
  }, [tables]);

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
    const payload = {
      customerName: draft.customerName,
      customerPhone: draft.customerPhone,
      date: draft.date,
      time: draft.time,
      partySize,
      status: "booked" as const,
      ...(table ? { tableId: table.id, tableLabel: table.name } : {}),
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

  async function handleAssignReservationTable(reservationId: string, tableId: string) {
    if (!restaurantId || !isFirebaseConfigured) return;
    const tid = String(tableId ?? "").trim();
    const table = tid ? tablesOptions.find((t) => t.id === tid) : undefined;
    setBusy(true);
    try {
      if (!table) {
        await updateReservation(reservationId, {
          tableId: "",
          tableLabel: "",
          zoneId: "",
          zoneName: "",
        });
        return;
      }
      await updateReservation(reservationId, {
        tableId: table.id,
        tableLabel: table.name,
        zoneId: table.zoneId ?? "",
        zoneName: table.zoneName ?? table.zone ?? "",
      });
    } finally {
      setBusy(false);
    }
  }

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
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: "0 16px 24px",
          boxSizing: "border-box",
        }}
      >
      <div style={{ ...cardStyle, ...headerRowStyle }}>
        <div>
          <h3 style={titleStyle}>Reservas</h3>
          <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginTop: 4 }}>
            Día seleccionado ·{" "}
            <input
              type="date"
              value={viewDate}
              onChange={(e) => setViewDate(e.target.value)}
              style={{
                marginLeft: 4,
                borderRadius: 8,
                border: "1px solid rgba(148, 163, 184, 0.25)",
                background: "rgba(15, 23, 42, 0.6)",
                color: "#e2e8f0",
                padding: "4px 8px",
                fontSize: 13,
                fontWeight: 600,
              }}
            />
          </div>
        </div>
        <button
          type="button"
          style={primaryBtn}
          onClick={() => {
            setSaveError(null);
            setDraft((d) => ({ ...d, date: viewDate }));
            setCreating(true);
          }}
        >
          Nueva reserva
        </button>
      </div>

      {listError ? (
        <div
          style={{
            ...cardStyle,
            borderColor: "rgba(248, 113, 113, 0.4)",
            color: "#fecaca",
            fontWeight: 600,
            fontSize: 14,
          }}
          role="alert"
        >
          {listError}
        </div>
      ) : null}

      <div style={metricsBarStyle} aria-label="Métricas de reservas del día">
        <MetricChip label="Previstas" value={metrics.booked} tone="amber" />
        <MetricChip label="Llegadas" value={metrics.seated} tone="blue" />
        <MetricChip label="Completadas" value={metrics.completed} tone="green" />
        <MetricChip label="No show" value={metrics.noShow} tone="red" />
        <MetricChip label="Canceladas" value={metrics.cancelled} tone="gray" />
        <MetricChip label="Pax previstas" value={metrics.paxPlanned} tone="neutral" />
        <MetricChip label="Pax llegadas" value={metrics.paxSeated} tone="neutral" />
      </div>

      {upcoming.length > 0 || delayed.length > 0 ? (
        <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(148, 163, 184, 0.14)",
                border: "1px solid rgba(148, 163, 184, 0.28)",
                color: "#e2e8f0",
                fontWeight: 800,
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {upcoming.length} próximas
            </span>
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(248, 113, 113, 0.12)",
                border: "1px solid rgba(248, 113, 113, 0.32)",
                color: "#fecaca",
                fontWeight: 800,
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {delayed.length} retrasadas
            </span>
          </div>

          {upcoming.length > 0 ? (
            <div>
              <div style={{ color: "#cbd5f5", fontWeight: 800, fontSize: 12, marginBottom: 8 }}>
                Próximas
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {upcoming.map((r) => (
                  <div
                    key={`up-${r.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(251, 191, 36, 0.28)",
                      background: "rgba(15, 23, 42, 0.35)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 900, color: "#e2e8f0" }}>{r.time || "—"}</span>
                      <span style={{ fontWeight: 800, color: "#e2e8f0" }}>{r.customerName || "—"}</span>
                      <span style={{ fontWeight: 700, color: "#94a3b8", fontSize: 13 }}>
                        {r.partySize ? `${r.partySize} pax` : "—"}
                      </span>
                      {r.tableLabel ? (
                        <span style={{ fontWeight: 700, color: "#cbd5f5", fontSize: 13 }}>{r.tableLabel}</span>
                      ) : null}
                    </div>
                    {r.status === "booked" ? (
                      <button
                        type="button"
                        style={{ ...primaryBtn, padding: "8px 12px" }}
                        onClick={() => void handleSeatReservation(r)}
                        disabled={busy}
                      >
                        Ha llegado
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {delayed.length > 0 ? (
            <div>
              <div style={{ color: "#fecaca", fontWeight: 800, fontSize: 12, marginBottom: 8 }}>
                Retrasadas
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {delayed.map((r) => (
                  <div
                    key={`dl-${r.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(248, 113, 113, 0.35)",
                      background: "rgba(248, 113, 113, 0.06)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 900, color: "#e2e8f0" }}>{r.time || "—"}</span>
                      <span style={{ fontWeight: 800, color: "#e2e8f0" }}>{r.customerName || "—"}</span>
                      <span style={{ fontWeight: 700, color: "#94a3b8", fontSize: 13 }}>
                        {r.partySize ? `${r.partySize} pax` : "—"}
                      </span>
                      {r.tableLabel ? (
                        <span style={{ fontWeight: 700, color: "#cbd5f5", fontSize: 13 }}>{r.tableLabel}</span>
                      ) : null}
                      <span style={{ ...statusBadgeStyle("cancelled"), background: "rgba(248, 113, 113, 0.14)" }}>
                        Retrasada
                      </span>
                    </div>
                    {r.status === "booked" ? (
                      <button
                        type="button"
                        style={{ ...primaryBtn, padding: "8px 12px" }}
                        onClick={() => void handleSeatReservation(r)}
                        disabled={busy}
                      >
                        Ha llegado
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {creating ? (
        <div
          style={{
            ...cardStyle,
            display: "flex",
            flexDirection: "column",
            gap: 0,
            minHeight: 0,
            maxHeight: "min(calc(100dvh - 32px), calc(100vh - 32px))",
            flexShrink: 0,
          }}
        >
          <div style={{ flexShrink: 0, marginBottom: 14 }}>
            <h4
              style={{
                margin: "0 0 6px 0",
                fontSize: 17,
                fontWeight: 800,
                color: "#f1f5f9",
                letterSpacing: "-0.02em",
              }}
            >
              Nueva reserva
            </h4>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>
              Desplázate dentro del recuadro si hace falta. Los botones quedan fijos abajo; pulsa{" "}
              <strong style={{ color: "#e2e8f0" }}>Guardar reserva</strong> cuando termines.
            </p>
          </div>

          <form
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
              gap: 0,
            }}
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreateReservation();
            }}
          >
            <div
              style={{
                overflowY: "auto",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
                flex: 1,
                minHeight: 0,
                paddingRight: 6,
                marginRight: -4,
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Nombre</label>
                  <input
                    style={inputStyle}
                    value={draft.customerName}
                    onChange={(e) => setDraft((d) => ({ ...d, customerName: e.target.value }))}
                    autoComplete="name"
                    disabled={savingReservation}
                  />
                </div>
                {saveError ? (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(248, 113, 113, 0.42)",
                      background: "rgba(248, 113, 113, 0.08)",
                      color: "#fecaca",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                    role="alert"
                  >
                    {saveError}
                  </div>
                ) : null}
                <div>
                  <label style={labelStyle}>Teléfono</label>
                  <input
                    style={inputStyle}
                    value={draft.customerPhone}
                    onChange={(e) => setDraft((d) => ({ ...d, customerPhone: e.target.value }))}
                    autoComplete="tel"
                    disabled={savingReservation}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Personas</label>
                  <input
                    style={inputStyle}
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
                    style={inputStyle}
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
                    style={inputStyle}
                    type="time"
                    value={draft.time}
                    onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                    required
                    disabled={savingReservation}
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Mesa (opcional)</label>
                  <select
                    style={inputStyle}
                    value={draft.tableId}
                    onChange={(e) => setDraft((d) => ({ ...d, tableId: e.target.value }))}
                    disabled={savingReservation}
                  >
                    <option value="">—</option>
                    {tablesOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Notas</label>
                  <input
                    style={inputStyle}
                    value={draft.notes}
                    onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                    disabled={savingReservation}
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 12,
                marginTop: 0,
                paddingTop: 16,
                borderTop: "1px solid rgba(148, 163, 184, 0.22)",
                flexShrink: 0,
                background: "rgba(15, 23, 42, 0.75)",
                paddingBottom: 2,
              }}
            >
              <button
                type="button"
                style={{
                  ...secondaryBtn,
                  opacity: savingReservation ? 0.55 : 1,
                  cursor: savingReservation ? "not-allowed" : "pointer",
                }}
                onClick={() => {
                  setCreating(false);
                  setSaveError(null);
                }}
                disabled={savingReservation}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{
                  ...formSaveBtn,
                  opacity: savingReservation ? 0.88 : 1,
                  cursor: savingReservation ? "wait" : "pointer",
                }}
                disabled={savingReservation}
              >
                {savingReservation ? "Guardando…" : "Guardar reserva"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {reservations.length === 0 ? (
        <div style={{ ...cardStyle, color: "#94a3b8", fontWeight: 600, fontSize: 14 }}>
          No hay reservas para el {day}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reservations.map((r) => (
            <div key={r.id} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: "#e2e8f0" }}>{r.time || "—"}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{r.customerName || "—"}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>
                    {r.partySize ? `${r.partySize} pax` : "—"}
                  </span>
                  {r.tableLabel ? (
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#cbd5f5" }}>{r.tableLabel}</span>
                  ) : null}
                </div>
                <span style={statusBadgeStyle(r.status)}>{statusLabel(r.status)}</span>
              </div>

              <div style={{ marginTop: 10 }}>
                <label style={labelStyle}>Mesa</label>
                <select
                  style={inputStyle}
                  value={r.tableId ?? ""}
                  onChange={(e) => void handleAssignReservationTable(r.id, e.target.value)}
                  disabled={busy}
                >
                  <option value="">Sin mesa</option>
                  {tablesOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {r.status === "booked" ? (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={primaryBtn}
                    onClick={() => void handleSeatReservation(r)}
                    disabled={busy}
                  >
                    Ha llegado
                  </button>
                  <button
                    type="button"
                    style={{
                      ...primaryBtn,
                      background: "transparent",
                      border: "1px solid rgba(248, 113, 113, 0.32)",
                      color: "#fecaca",
                      fontWeight: 800,
                    }}
                    onClick={() => void handleUpdateReservationStatus(r.id, "no_show")}
                    disabled={busy}
                  >
                    No show
                  </button>
                  <button
                    type="button"
                    style={{
                      ...primaryBtn,
                      background: "transparent",
                      border: "1px solid rgba(148, 163, 184, 0.28)",
                      color: "#e2e8f0",
                      fontWeight: 800,
                    }}
                    onClick={() => void handleUpdateReservationStatus(r.id, "cancelled")}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                </div>
              ) : r.status === "seated" ? (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  {r.tableId ? (
                    <button
                      type="button"
                      style={primaryBtn}
                      onClick={() => handleOpenTable(r)}
                      disabled={busy}
                    >
                      Abrir mesa
                    </button>
                  ) : null}
                  <button
                    type="button"
                    style={{
                      ...primaryBtn,
                      background: "rgba(34, 197, 94, 0.16)",
                      border: "1px solid rgba(34, 197, 94, 0.32)",
                      color: "#bbf7d0",
                      fontWeight: 900,
                    }}
                    onClick={() => void handleUpdateReservationStatus(r.id, "completed")}
                    disabled={busy}
                  >
                    Completar
                  </button>
                </div>
              ) : null}
              {r.notes && r.notes.length <= 80 ? (
                <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>
                  {r.notes}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
  );
}
