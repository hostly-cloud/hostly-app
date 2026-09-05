"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyButton, HostlyKpiCard, HostlySurface } from "@/components/ui/hostly";
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type {
  EmployeeSalesPerformanceApiResponse,
  EmployeeSalesPerformanceRow,
  EmployeeSalesPerformanceSnapshot,
} from "@/lib/employees/sales-performance-types";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function statusLabel(row: EmployeeSalesPerformanceRow): string {
  if (row.status === "achieved") return "Objetivo conseguido";
  if (row.status === "on_track") return "En camino";
  if (row.status === "behind") return "Por debajo del objetivo";
  return "Sin objetivo";
}

function statusClass(row: EmployeeSalesPerformanceRow): string {
  if (row.status === "achieved") return "bg-emerald-50 text-emerald-800";
  if (row.status === "on_track") return "bg-sky-50 text-sky-800";
  if (row.status === "behind") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

export default function EmployeeSalesPerformancePage() {
  const [month, setMonth] = useState(currentMonth());
  const [snapshot, setSnapshot] = useState<EmployeeSalesPerformanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftGoals, setDraftGoals] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    try {
      const response = await authenticatedApiFetch(
        `/api/employees/performance?month=${encodeURIComponent(selectedMonth)}`,
        { cache: "no-store" },
      );
      const data = (await response.json().catch(() => null)) as EmployeeSalesPerformanceApiResponse | null;
      if (!response.ok || !data || data.ok !== true) {
        throw new Error(data && data.ok === false ? data.error : "No se pudo cargar el rendimiento");
      }
      setSnapshot(data.snapshot);
      setDraftGoals(
        Object.fromEntries(
          data.snapshot.rows.map((row) => [
            row.employeeId,
            row.targetAmount == null ? "" : String(row.targetAmount),
          ]),
        ),
      );
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el rendimiento");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [load, month]);

  const saveGoal = useCallback(async (employeeId: string) => {
    setSavingId(employeeId);
    setError(null);
    try {
      const raw = draftGoals[employeeId]?.trim() ?? "";
      const targetAmount = raw === "" ? null : Number(raw.replace(",", "."));
      if (targetAmount != null && (!Number.isFinite(targetAmount) || targetAmount <= 0)) {
        throw new Error("Introduce un objetivo superior a 0 € o deja el campo vacío para quitarlo.");
      }
      const response = await authenticatedApiFetch("/api/employees/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "goal.save", employeeId, month, targetAmount }),
      });
      const data = (await response.json().catch(() => null)) as EmployeeSalesPerformanceApiResponse | null;
      if (!response.ok || !data || data.ok !== true) {
        throw new Error(data && data.ok === false ? data.error : "No se pudo guardar el objetivo");
      }
      setSnapshot(data.snapshot);
      setDraftGoals(
        Object.fromEntries(
          data.snapshot.rows.map((row) => [
            row.employeeId,
            row.targetAmount == null ? "" : String(row.targetAmount),
          ]),
        ),
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el objetivo");
    } finally {
      setSavingId(null);
    }
  }, [draftGoals, month]);

  const rows = useMemo(() => snapshot?.rows ?? [], [snapshot?.rows]);
  const targetRows = useMemo(() => rows.filter((row) => row.targetAmount != null), [rows]);
  const achievedCount = useMemo(() => targetRows.filter((row) => row.status === "achieved").length, [targetRows]);

  return (
    <ModulePageShell
      title="Rendimiento del equipo"
      subtitle="Ventas, tickets y objetivos mensuales por empleado"
      maxWidth={1320}
      compactLayout
      shellSurface="configLight"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
            Mes
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-950"
            />
          </label>
          <Link href="/dashboard/empleados" className="hostly-button-secondary hostly-button-compact">
            Volver a empleados
          </Link>
        </div>

        {error ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {error}
          </div>
        ) : null}

        {snapshot ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <HostlyKpiCard title="Ventas del mes" value={formatEur(snapshot.totalSalesAmount)} />
            <HostlyKpiCard title="Tickets cobrados" value={String(snapshot.totalTicketCount)} />
            <HostlyKpiCard title="Ticket medio" value={formatEur(snapshot.averageTicket)} />
            <HostlyKpiCard title="Objetivos cumplidos" value={`${achievedCount}/${targetRows.length}`} />
          </div>
        ) : null}

        {snapshot && snapshot.unattributedSalesAmount > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            {formatEur(snapshot.unattributedSalesAmount)} de ventas del mes no tienen camarero identificable en pagos antiguos. Se muestran en el total del restaurante, pero no se asignan a ningún empleado.
          </div>
        ) : null}

        <HostlySurface variant="ice" className="overflow-hidden p-0">
          {loading ? (
            <div className="p-6 text-sm font-semibold text-slate-600">Cargando rendimiento…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm font-semibold text-slate-600">No hay empleados activos para este restaurante.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left">
                <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Empleado</th>
                    <th className="px-4 py-3 text-right">Ventas</th>
                    <th className="px-4 py-3 text-right">Tickets</th>
                    <th className="px-4 py-3 text-right">Ticket medio</th>
                    <th className="px-4 py-3">Objetivo mensual</th>
                    <th className="px-4 py-3">Progreso</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.employeeId} className="border-t border-slate-100 align-middle">
                      <td className="px-4 py-4">
                        <div className="font-extrabold text-slate-950">{row.displayName}</div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-500">{row.position || row.email || "Empleado"}</div>
                      </td>
                      <td className="px-4 py-4 text-right font-extrabold text-slate-950">{formatEur(row.salesAmount)}</td>
                      <td className="px-4 py-4 text-right font-bold text-slate-700">{row.ticketCount}</td>
                      <td className="px-4 py-4 text-right font-bold text-slate-700">{formatEur(row.averageTicket)}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            inputMode="decimal"
                            aria-label={`Objetivo de ${row.displayName}`}
                            value={draftGoals[row.employeeId] ?? ""}
                            onChange={(event) => setDraftGoals((current) => ({ ...current, [row.employeeId]: event.target.value }))}
                            placeholder="Sin objetivo"
                            className="min-h-10 w-32 rounded-xl border border-slate-300 bg-white px-3 text-right text-sm font-bold text-slate-950"
                          />
                          <span className="text-sm font-bold text-slate-500">€</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="min-w-40">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`rounded-full px-2 py-1 text-xs font-extrabold ${statusClass(row)}`}>{statusLabel(row)}</span>
                            {row.progressPct != null ? <span className="text-xs font-extrabold text-slate-600">{Math.min(999, row.progressPct)}%</span> : null}
                          </div>
                          {row.targetAmount != null ? (
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, Math.max(0, row.progressPct ?? 0))}%` }} />
                            </div>
                          ) : null}
                          {row.remainingAmount != null && row.remainingAmount > 0 ? (
                            <div className="mt-1 text-[11px] font-semibold text-slate-500">Faltan {formatEur(row.remainingAmount)}</div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <HostlyButton
                          variant="secondary"
                          size="compact"
                          disabled={savingId === row.employeeId}
                          onClick={() => void saveGoal(row.employeeId)}
                        >
                          {savingId === row.employeeId ? "Guardando…" : "Guardar"}
                        </HostlyButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HostlySurface>
      </div>
    </ModulePageShell>
  );
}
