"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { requestManagedRestaurantUsers } from "@/lib/users/request-manage-users";
import {
  downloadEmployeeDocument,
  requestEmployeeClock,
  requestEmployeeDocumentDelete,
  requestEmployeeDocumentStatus,
  requestEmployeeDocumentUpload,
  requestEmployeeOperations,
  requestEmployeeProfileSave,
  requestEmployeeShiftDelete,
  requestEmployeeShiftSave,
  requestEmployeeTimeCorrection,
} from "@/lib/employees/request-employee-operations";
import type {
  ClockAction,
  EmployeeDocument,
  EmployeeOperationsSnapshot,
  EmployeeProfile,
  EmployeeShift,
  EmployeeTimeEntry,
} from "@/lib/employees/types";

type ManagedUser = Awaited<ReturnType<typeof requestManagedRestaurantUsers>>[number];
type Tab = "resumen" | "equipo" | "turnos" | "fichajes" | "documentos";

const EMPTY_SNAPSHOT: EmployeeOperationsSnapshot = {
  profiles: [],
  shifts: [],
  timeEntries: [],
  documents: [],
  summary: {
    scheduledToday: 0,
    workingNow: 0,
    onBreakNow: 0,
    missingClockIn: 0,
    completedToday: 0,
    workedMinutesToday: 0,
  },
  range: { from: "", to: "" },
};

function isoDate(date: Date) {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return copy.toISOString().slice(0, 10);
}

function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeek(date = new Date()) {
  const copy = startOfWeek(date);
  copy.setDate(copy.getDate() + 6);
  return copy;
}

function displayName(user: ManagedUser) {
  const row = user as ManagedUser & { displayName?: string; nombre?: string; email?: string };
  return row.displayName?.trim() || row.nombre?.trim() || row.email?.split("@")[0] || "Empleado";
}

function displayEmail(user: ManagedUser) {
  return ((user as ManagedUser & { email?: string }).email || "").trim();
}

function formatDate(date: string) {
  if (!date) return "—";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function formatTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function minutesLabel(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function errorLabel(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const labels: Record<string, string> = {
    EMPLOYEE_NOT_FOUND: "Primero completa la ficha operativa del empleado.",
    TIME_ENTRY_ALREADY_OPEN: "Este empleado ya tiene un fichaje abierto.",
    TIME_ENTRY_NOT_OPEN: "No hay un fichaje abierto para esta acción.",
    BREAK_ALREADY_STARTED: "El descanso ya está iniciado.",
    BREAK_NOT_STARTED: "No hay un descanso abierto.",
    SHIFT_END_BEFORE_START: "La hora de fin debe ser posterior a la de inicio.",
    DOCUMENT_SIZE_INVALID: "El documento debe pesar entre 1 byte y 10 MB.",
    DOCUMENT_TYPE_INVALID: "Solo se admiten PDF, JPG, PNG o WEBP.",
  };
  return labels[code] || code.replaceAll("_", " ").toLowerCase();
}

export default function EmployeesHrOperations() {
  const { can } = useHostlyCapabilities();
  const canManage = can("users.manage");
  const [tab, setTab] = useState<Tab>("resumen");
  const [from, setFrom] = useState(() => isoDate(startOfWeek()));
  const [to, setTo] = useState(() => isoDate(endOfWeek()));
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [snapshot, setSnapshot] = useState<EmployeeOperationsSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [profileDraft, setProfileDraft] = useState<Partial<EmployeeProfile> | null>(null);
  const [shiftDraft, setShiftDraft] = useState<Partial<EmployeeShift> | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState<EmployeeTimeEntry | null>(null);

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const [managedUsers, operations] = await Promise.all([
        requestManagedRestaurantUsers(),
        requestEmployeeOperations(from, to),
      ]);
      setUsers(managedUsers);
      setSnapshot(operations);
    } catch (error) {
      setMessage(`No se pudo cargar RRHH: ${errorLabel(error)}`);
    } finally {
      setLoading(false);
    }
  }, [canManage, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const profileByUser = useMemo(
    () => new Map(snapshot.profiles.map((profile) => [profile.userId, profile])),
    [snapshot.profiles],
  );
  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );
  const today = isoDate(new Date());
  const todayShifts = snapshot.shifts.filter((shift) => shift.date === today);
  const openEntryByEmployee = useMemo(
    () =>
      new Map(
        snapshot.timeEntries
          .filter((entry) => entry.status !== "completed")
          .map((entry) => [entry.employeeId, entry]),
      ),
    [snapshot.timeEntries],
  );

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
      await load();
      return true;
    } catch (error) {
      setMessage(`No se pudo completar: ${errorLabel(error)}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startProfile = (user: ManagedUser) => {
    const current = profileByUser.get(user.id);
    setProfileDraft(
      current || {
        userId: user.id,
        id: user.id,
        displayName: displayName(user),
        email: displayEmail(user),
        phone: "",
        position: "other",
        area: "",
        startDate: "",
        notes: "",
        active: (user as ManagedUser & { status?: string }).status !== "disabled",
      },
    );
  };

  const saveProfile = async () => {
    if (!profileDraft?.userId) return;
    const ok = await run(
      () => requestEmployeeProfileSave(profileDraft as Record<string, unknown>),
      "Ficha de empleado guardada.",
    );
    if (ok) setProfileDraft(null);
  };

  const saveShift = async () => {
    if (!shiftDraft?.employeeId || !shiftDraft.date || !shiftDraft.startTime || !shiftDraft.endTime) {
      setMessage("Completa empleado, fecha, inicio y fin del turno.");
      return;
    }
    const ok = await run(
      () => requestEmployeeShiftSave(shiftDraft as Record<string, unknown>),
      "Turno guardado.",
    );
    if (ok) setShiftDraft(null);
  };

  const clock = (employeeId: string, clockAction: ClockAction) =>
    run(() => requestEmployeeClock({ employeeId, clockAction }), "Fichaje actualizado.");

  const saveCorrection = async () => {
    if (!correctionDraft) return;
    const reason = window.prompt("Motivo de la corrección (obligatorio):")?.trim();
    if (!reason) return;
    const ok = await run(
      () =>
        requestEmployeeTimeCorrection({
          id: correctionDraft.id,
          clockInAt: correctionDraft.clockInAt,
          clockOutAt: correctionDraft.clockOutAt,
          breakMinutes: correctionDraft.breakMinutes,
          reason,
        }),
      "Fichaje corregido y auditado.",
    );
    if (ok) setCorrectionDraft(null);
  };

  if (!canManage) {
    return (
      <ModulePageShell title="Empleados" subtitle="RRHH operativo" maxWidth={1280}>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No tienes permiso para gestionar RRHH.
        </div>
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell title="Empleados" subtitle="RRHH operativo" maxWidth={1380} compactLayout>
      <div className="space-y-4 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Secciones de RRHH">
            {([
              ["resumen", "Resumen"],
              ["equipo", "Fichas"],
              ["turnos", "Turnos"],
              ["fichajes", "Fichajes"],
              ["documentos", "Documentos"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`min-h-11 rounded-xl px-4 text-sm font-semibold transition ${
                  tab === value
                    ? "bg-slate-950 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Link href="/dashboard/empleados" className="text-sm font-semibold text-sky-700 hover:underline">
            Gestionar accesos y roles
          </Link>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Desde
            <input className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Hasta
            <input className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="button" onClick={() => void load()} disabled={loading || busy} className="hostly-button-primary min-h-11 px-4">
            Actualizar
          </button>
          {message ? <p className="text-sm text-slate-600" role="status">{message}</p> : null}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Cargando RRHH…</div>
        ) : null}

        {!loading && tab === "resumen" ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ["Programados hoy", snapshot.summary.scheduledToday],
                ["Trabajando", snapshot.summary.workingNow],
                ["En descanso", snapshot.summary.onBreakNow],
                ["Sin fichar", snapshot.summary.missingClockIn],
                ["Finalizados", snapshot.summary.completedToday],
                ["Horas hoy", minutesLabel(snapshot.summary.workedMinutesToday)],
              ].map(([label, value]) => (
                <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <strong className="mt-2 block text-2xl text-slate-950">{value}</strong>
                </article>
              ))}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div><h2 className="font-bold text-slate-950">Quién trabaja hoy</h2><p className="text-sm text-slate-500">Turnos y estado de fichaje en tiempo real.</p></div>
                <button type="button" onClick={() => setTab("turnos")} className="text-sm font-semibold text-sky-700">Ver turnos</button>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {todayShifts.length ? todayShifts.map((shift) => {
                  const user = userById.get(shift.employeeId);
                  const entry = openEntryByEmployee.get(shift.employeeId);
                  return (
                    <div key={shift.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div><strong className="block text-sm text-slate-900">{user ? displayName(user) : profileByUser.get(shift.employeeId)?.displayName || "Empleado"}</strong><span className="text-xs text-slate-500">{shift.startTime}–{shift.endTime}{shift.area ? ` · ${shift.area}` : ""}</span></div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{entry ? (entry.status === "on_break" ? "Descanso" : "Trabajando") : "Pendiente"}</span>
                    </div>
                  );
                }) : <p className="text-sm text-slate-500">No hay turnos programados para hoy.</p>}
              </div>
            </div>
          </section>
        ) : null}

        {!loading && tab === "equipo" ? (
          <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-bold text-slate-950">Fichas del equipo</h2>
              <p className="mb-4 text-sm text-slate-500">Datos operativos separados de los permisos de acceso.</p>
              <div className="space-y-2">
                {users.map((user) => {
                  const profile = profileByUser.get(user.id);
                  return (
                    <button key={user.id} type="button" onClick={() => startProfile(user)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 text-left hover:bg-slate-50">
                      <span><strong className="block text-sm text-slate-900">{displayName(user)}</strong><span className="text-xs text-slate-500">{displayEmail(user)}</span></span>
                      <span className="text-xs font-semibold text-slate-600">{profile ? `${profile.position}${profile.area ? ` · ${profile.area}` : ""}` : "Completar ficha"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <ProfileForm draft={profileDraft} setDraft={setProfileDraft} onSave={saveProfile} busy={busy} />
          </section>
        ) : null}

        {!loading && tab === "turnos" ? (
          <section className="grid gap-4 xl:grid-cols-[1fr_390px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-950">Planificación</h2><p className="text-sm text-slate-500">{formatDate(from)} – {formatDate(to)}</p></div><button type="button" className="hostly-button-primary min-h-11 px-4" onClick={() => setShiftDraft({ date: today, startTime: "12:00", endTime: "20:00", breakMinutes: 30, area: "", notes: "" })}>Nuevo turno</button></div>
              <div className="space-y-2">
                {snapshot.shifts.length ? snapshot.shifts.map((shift) => {
                  const user = userById.get(shift.employeeId);
                  return (
                    <article key={shift.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                      <div><strong className="text-sm text-slate-900">{user ? displayName(user) : profileByUser.get(shift.employeeId)?.displayName || "Empleado"}</strong><p className="text-xs text-slate-500">{formatDate(shift.date)} · {shift.startTime}–{shift.endTime} · descanso {shift.breakMinutes} min{shift.area ? ` · ${shift.area}` : ""}</p></div>
                      <div className="flex gap-2"><button type="button" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onClick={() => setShiftDraft(shift)}>Editar</button><button type="button" className="min-h-10 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-700" disabled={busy} onClick={() => { if (window.confirm("¿Eliminar este turno?")) void run(() => requestEmployeeShiftDelete(shift.id), "Turno eliminado."); }}>Eliminar</button></div>
                    </article>
                  );
                }) : <p className="text-sm text-slate-500">No hay turnos en el periodo seleccionado.</p>}
              </div>
            </div>
            <ShiftForm users={users} profiles={profileByUser} draft={shiftDraft} setDraft={setShiftDraft} onSave={saveShift} busy={busy} />
          </section>
        ) : null}

        {!loading && tab === "fichajes" ? (
          <section className="grid gap-4 xl:grid-cols-[1fr_390px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-bold text-slate-950">Registro de jornada</h2><p className="mb-4 text-sm text-slate-500">Entrada, salida, descansos y correcciones auditadas.</p>
              <div className="space-y-2">
                {snapshot.timeEntries.length ? snapshot.timeEntries.map((entry) => {
                  const user = userById.get(entry.employeeId);
                  return (
                    <article key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                      <div><strong className="text-sm text-slate-900">{user ? displayName(user) : profileByUser.get(entry.employeeId)?.displayName || "Empleado"}</strong><p className="text-xs text-slate-500">{formatDate(entry.workDate)} · {formatTime(entry.clockInAt)}–{formatTime(entry.clockOutAt)} · descanso {entry.breakMinutes} min · {entry.status === "working" ? "Trabajando" : entry.status === "on_break" ? "Descanso" : "Finalizado"}</p>{entry.correctionReason ? <p className="mt-1 text-xs text-amber-700">Corregido: {entry.correctionReason}</p> : null}</div>
                      <button type="button" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onClick={() => setCorrectionDraft(entry)}>Corregir</button>
                    </article>
                  );
                }) : <p className="text-sm text-slate-500">No hay fichajes en este periodo.</p>}
              </div>
            </div>
            <div className="space-y-4">
              <ClockPanel users={users} profiles={profileByUser} openEntries={openEntryByEmployee} clock={clock} busy={busy} />
              <CorrectionForm draft={correctionDraft} setDraft={setCorrectionDraft} onSave={saveCorrection} busy={busy} />
            </div>
          </section>
        ) : null}

        {!loading && tab === "documentos" ? (
          <DocumentsPanel users={users} profiles={profileByUser} documents={snapshot.documents} reload={load} run={run} busy={busy} />
        ) : null}
      </div>
    </ModulePageShell>
  );
}

function ProfileForm({ draft, setDraft, onSave, busy }: { draft: Partial<EmployeeProfile> | null; setDraft: (value: Partial<EmployeeProfile> | null) => void; onSave: () => Promise<void>; busy: boolean }) {
  if (!draft) return <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Selecciona un empleado para completar su ficha.</aside>;
  const field = (key: keyof EmployeeProfile, value: unknown) => setDraft({ ...draft, [key]: value });
  return <aside className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="mb-4 font-bold text-slate-950">Ficha operativa</h3><div className="grid gap-3">
    <label className="grid gap-1 text-xs font-semibold text-slate-600">Nombre<input className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.displayName || ""} onChange={(e) => field("displayName", e.target.value)} /></label>
    <label className="grid gap-1 text-xs font-semibold text-slate-600">Email<input className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.email || ""} onChange={(e) => field("email", e.target.value)} /></label>
    <label className="grid gap-1 text-xs font-semibold text-slate-600">Teléfono<input className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.phone || ""} onChange={(e) => field("phone", e.target.value)} /></label>
    <label className="grid gap-1 text-xs font-semibold text-slate-600">Puesto<select className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.position || "other"} onChange={(e) => field("position", e.target.value)}><option value="manager">Encargado</option><option value="waiter">Camarero</option><option value="kitchen">Cocina</option><option value="bar">Barra</option><option value="host">Host / recepción</option><option value="runner">Runner</option><option value="other">Otro</option></select></label>
    <label className="grid gap-1 text-xs font-semibold text-slate-600">Zona / área<input className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.area || ""} onChange={(e) => field("area", e.target.value)} /></label>
    <label className="grid gap-1 text-xs font-semibold text-slate-600">Fecha de incorporación<input type="date" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.startDate || ""} onChange={(e) => field("startDate", e.target.value)} /></label>
    <label className="grid gap-1 text-xs font-semibold text-slate-600">Notas<textarea className="min-h-24 rounded-xl border border-slate-200 p-3 text-sm" value={draft.notes || ""} onChange={(e) => field("notes", e.target.value)} /></label>
    <div className="flex gap-2"><button type="button" className="hostly-button-primary min-h-11 flex-1" disabled={busy} onClick={() => void onSave()}>Guardar ficha</button><button type="button" className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold" onClick={() => setDraft(null)}>Cerrar</button></div>
  </div></aside>;
}

function ShiftForm({ users, profiles, draft, setDraft, onSave, busy }: { users: ManagedUser[]; profiles: Map<string, EmployeeProfile>; draft: Partial<EmployeeShift> | null; setDraft: (value: Partial<EmployeeShift> | null) => void; onSave: () => Promise<void>; busy: boolean }) {
  if (!draft) return <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Crea o selecciona un turno para editarlo.</aside>;
  const field = (key: keyof EmployeeShift, value: unknown) => setDraft({ ...draft, [key]: value });
  return <aside className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="mb-4 font-bold text-slate-950">Turno</h3><div className="grid gap-3">
    <label className="grid gap-1 text-xs font-semibold text-slate-600">Empleado<select className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.employeeId || ""} onChange={(e) => field("employeeId", e.target.value)}><option value="">Selecciona…</option>{users.filter((user) => profiles.has(user.id)).map((user) => <option key={user.id} value={user.id}>{displayName(user)}</option>)}</select></label>
    {!users.some((user) => profiles.has(user.id)) ? <p className="text-xs text-amber-700">Completa primero una ficha de empleado.</p> : null}
    <label className="grid gap-1 text-xs font-semibold text-slate-600">Fecha<input type="date" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.date || ""} onChange={(e) => field("date", e.target.value)} /></label>
    <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-xs font-semibold text-slate-600">Inicio<input type="time" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.startTime || ""} onChange={(e) => field("startTime", e.target.value)} /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Fin<input type="time" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.endTime || ""} onChange={(e) => field("endTime", e.target.value)} /></label></div>
    <label className="grid gap-1 text-xs font-semibold text-slate-600">Descanso (min)<input type="number" min="0" max="360" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.breakMinutes ?? 0} onChange={(e) => field("breakMinutes", Number(e.target.value))} /></label>
    <label className="grid gap-1 text-xs font-semibold text-slate-600">Zona<input className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.area || ""} onChange={(e) => field("area", e.target.value)} /></label>
    <label className="grid gap-1 text-xs font-semibold text-slate-600">Notas<textarea className="min-h-20 rounded-xl border border-slate-200 p-3 text-sm" value={draft.notes || ""} onChange={(e) => field("notes", e.target.value)} /></label>
    <div className="flex gap-2"><button type="button" className="hostly-button-primary min-h-11 flex-1" disabled={busy} onClick={() => void onSave()}>Guardar turno</button><button type="button" className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold" onClick={() => setDraft(null)}>Cancelar</button></div>
  </div></aside>;
}

function ClockPanel({ users, profiles, openEntries, clock, busy }: { users: ManagedUser[]; profiles: Map<string, EmployeeProfile>; openEntries: Map<string, EmployeeTimeEntry>; clock: (id: string, action: ClockAction) => Promise<unknown>; busy: boolean }) {
  const [employeeId, setEmployeeId] = useState("");
  const entry = openEntries.get(employeeId);
  return <aside className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-bold text-slate-950">Fichar</h3><p className="mb-3 text-sm text-slate-500">Acción manual del encargado o del propio usuario.</p><select className="mb-3 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Selecciona empleado…</option>{users.filter((user) => profiles.has(user.id)).map((user) => <option key={user.id} value={user.id}>{displayName(user)}</option>)}</select><div className="grid grid-cols-2 gap-2">
    {!entry ? <button type="button" disabled={!employeeId || busy} className="hostly-button-primary min-h-11 col-span-2" onClick={() => void clock(employeeId, "clock_in")}>Entrada</button> : null}
    {entry?.status === "working" ? <><button type="button" disabled={busy} className="min-h-11 rounded-xl border border-slate-200 text-sm font-semibold" onClick={() => void clock(employeeId, "break_start")}>Iniciar descanso</button><button type="button" disabled={busy} className="min-h-11 rounded-xl border border-slate-200 text-sm font-semibold" onClick={() => void clock(employeeId, "clock_out")}>Salida</button></> : null}
    {entry?.status === "on_break" ? <><button type="button" disabled={busy} className="hostly-button-primary min-h-11" onClick={() => void clock(employeeId, "break_end")}>Fin descanso</button><button type="button" disabled={busy} className="min-h-11 rounded-xl border border-slate-200 text-sm font-semibold" onClick={() => void clock(employeeId, "clock_out")}>Salida</button></> : null}
  </div></aside>;
}

function CorrectionForm({ draft, setDraft, onSave, busy }: { draft: EmployeeTimeEntry | null; setDraft: (value: EmployeeTimeEntry | null) => void; onSave: () => Promise<void>; busy: boolean }) {
  if (!draft) return <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Selecciona un fichaje para corregirlo. Todas las correcciones exigen motivo y quedan auditadas.</aside>;
  const localValue = (iso: string | null) => iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  return <aside className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="mb-3 font-bold text-slate-950">Corregir fichaje</h3><div className="grid gap-3"><label className="grid gap-1 text-xs font-semibold text-slate-600">Entrada<input type="datetime-local" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={localValue(draft.clockInAt)} onChange={(e) => setDraft({ ...draft, clockInAt: new Date(e.target.value).toISOString() })} /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Salida<input type="datetime-local" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={localValue(draft.clockOutAt)} onChange={(e) => setDraft({ ...draft, clockOutAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Descanso (min)<input type="number" min="0" max="360" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={draft.breakMinutes} onChange={(e) => setDraft({ ...draft, breakMinutes: Number(e.target.value) })} /></label><div className="flex gap-2"><button type="button" className="hostly-button-primary min-h-11 flex-1" disabled={busy} onClick={() => void onSave()}>Guardar corrección</button><button type="button" className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold" onClick={() => setDraft(null)}>Cancelar</button></div></div></aside>;
}

function DocumentsPanel({ users, profiles, documents, reload, run, busy }: { users: ManagedUser[]; profiles: Map<string, EmployeeProfile>; documents: EmployeeDocument[]; reload: () => Promise<void>; run: (action: () => Promise<unknown>, success: string) => Promise<boolean>; busy: boolean }) {
  const [employeeId, setEmployeeId] = useState("");
  const [category, setCategory] = useState("contract");
  const [file, setFile] = useState<File | null>(null);
  const upload = async () => { if (!employeeId || !file) return; const ok = await run(() => requestEmployeeDocumentUpload({ employeeId, category, file }), "Documento subido de forma privada."); if (ok) { setFile(null); await reload(); } };
  return <section className="grid gap-4 xl:grid-cols-[1fr_390px]"><div className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-bold text-slate-950">Documentación</h2><p className="mb-4 text-sm text-slate-500">Contratos, nóminas y certificados almacenados de forma privada. Máximo 10 MB.</p><div className="space-y-2">{documents.length ? documents.map((doc) => { const user = users.find((candidate) => candidate.id === doc.employeeId); return <article key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><strong className="block text-sm text-slate-900">{doc.name}</strong><span className="text-xs text-slate-500">{user ? displayName(user) : profiles.get(doc.employeeId)?.displayName || "Empleado"} · {doc.category} · {(doc.size / 1024).toFixed(0)} KB · {doc.status}</span></div><div className="flex flex-wrap gap-2"><button type="button" className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold" onClick={() => void downloadEmployeeDocument(doc.id, doc.name)}>Descargar</button><select className="min-h-10 rounded-lg border border-slate-200 px-2 text-sm" value={doc.status} onChange={(e) => void run(() => requestEmployeeDocumentStatus(doc.id, e.target.value), "Estado actualizado.")}><option value="pending">Pendiente</option><option value="delivered">Entregado</option><option value="read">Leído</option></select><button type="button" disabled={busy} className="min-h-10 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-700" onClick={() => { if (window.confirm("¿Eliminar este documento?")) void run(() => requestEmployeeDocumentDelete(doc.id), "Documento eliminado."); }}>Eliminar</button></div></article>; }) : <p className="text-sm text-slate-500">No hay documentos cargados.</p>}</div></div><aside className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="mb-4 font-bold text-slate-950">Subir documento</h3><div className="grid gap-3"><label className="grid gap-1 text-xs font-semibold text-slate-600">Empleado<select className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Selecciona…</option>{users.filter((user) => profiles.has(user.id)).map((user) => <option key={user.id} value={user.id}>{displayName(user)}</option>)}</select></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Tipo<select className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}><option value="contract">Contrato</option><option value="payroll">Nómina</option><option value="certificate">Certificado</option><option value="other">Otro</option></select></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Archivo<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="rounded-xl border border-slate-200 p-3 text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label><button type="button" className="hostly-button-primary min-h-11" disabled={!employeeId || !file || busy} onClick={() => void upload()}>Subir documento</button></div></aside></section>;
}
