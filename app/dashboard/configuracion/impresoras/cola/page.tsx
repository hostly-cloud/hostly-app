"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  HostlyAlert,
  HostlyButton,
  HostlyLoadingState,
  HostlyPermissionState,
  HostlySectionHeader,
  HostlySurface,
} from "@/components/ui/hostly";
import type {
  ProcessPendingPrintJobsResult,
  ProcessPrintJobItemOutcome,
} from "@/lib/printing/print-worker-types";
import { requestProcessPendingPrintJobs } from "@/lib/printing/request-process-pending-print-jobs";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import {
  KDS_OPERATION_STATION_FILTER_ALL,
  matchesKdsOperationStationSelection,
} from "@/lib/kds/operation-station-kds-filter";
import {
  buildPrintJobId,
  cancelPrintJob,
  listenPrintJobs,
  markPrintJobAttemptFailed,
  markPrintJobPrinted,
  requeuePrintJobToPending,
  retryPrintJob,
} from "@/lib/firestore/print-jobs";
import { listenOperationStations } from "@/lib/firestore/operation-stations";
import {
  sortOperationStations,
  type OperationStationDocument,
} from "@/lib/operacion/operation-station-types";
import {
  PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES,
  PRINTER_STATION_KEYS,
  type PrinterStationKey,
} from "@/lib/printing/printer-config-types";
import {
  isPrintJobStalePending,
  PRINT_JOB_STALE_PENDING_MS,
  type PrintJobDocument,
  type PrintJobStatus,
} from "@/lib/printing/print-job-types";
import { getMenuCourseLabel } from "@/lib/carta/menu-course";

type StatusFilter = "all" | PrintJobStatus | "stale_pending";
type StationFilter = "all" | PrinterStationKey;

const STALE_PENDING_MINUTES = Math.round(PRINT_JOB_STALE_PENDING_MS / 60_000);

function formatJobTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusLabel(status: PrintJobStatus): string {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "printed":
      return "Impreso";
    case "failed":
      return "Error";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
}

function processingOutcomeLabel(outcome: ProcessPrintJobItemOutcome): string {
  switch (outcome) {
    case "printed":
      return "Impreso";
    case "failed":
      return "Fallido";
    case "omitted":
      return "Omitido";
    case "dry_run_print":
      return "Se imprimiría";
    case "dry_run_fail":
      return "Fallaría";
    case "skipped":
      return "Actualizado en paralelo";
    case "error":
      return "Error";
  }
}

function isLegacyPrintJob(job: Pick<PrintJobDocument, "operationStationId">): boolean {
  return !job.operationStationId?.trim();
}

function operationStationBadgeLabel(
  job: Pick<PrintJobDocument, "operationStationId" | "operationStationName">,
): string {
  const name = job.operationStationName?.trim();
  if (name) return name;
  return "Sin estación específica";
}

function statusBadgeClass(status: PrintJobStatus): string {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-800 ring-amber-200/80";
    case "printed":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200/80";
    case "failed":
      return "bg-rose-50 text-rose-800 ring-rose-200/80";
    case "cancelled":
      return "bg-slate-100 text-slate-600 ring-slate-200/80";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function ConfigImpresorasColaPage() {
  const { restaurantId: profileRestaurantId, ready: authReady, user } = useAuth();
  const restaurantId = useMemo(
    () => resolveOperationalRestaurantId(profileRestaurantId),
    [profileRestaurantId],
  );

  const [jobs, setJobs] = useState<PrintJobDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [stationFilter, setStationFilter] = useState<StationFilter>("all");
  const [operationStationFilter, setOperationStationFilter] = useState(
    KDS_OPERATION_STATION_FILTER_ALL,
  );
  const [operationStations, setOperationStations] = useState<
    OperationStationDocument[]
  >([]);
  const [actingJobId, setActingJobId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [workerBusy, setWorkerBusy] = useState(false);
  const [workerSummary, setWorkerSummary] =
    useState<ProcessPendingPrintJobsResult | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!authReady || !restaurantId) {
      setLoading(false);
      setJobs([]);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = listenPrintJobs(
      restaurantId,
      (next) => {
        setJobs(next);
        setLoading(false);
      },
      (e) => {
        console.error("listenPrintJobs", e);
        setError("No se pudo cargar la cola de impresión.");
        setJobs([]);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (!authReady || !restaurantId) {
      setOperationStations([]);
      return;
    }
    return listenOperationStations(restaurantId, setOperationStations);
  }, [authReady, restaurantId]);

  const activeOperationStations = useMemo(
    () =>
      sortOperationStations(operationStations.filter((s) => s.active)),
    [operationStations],
  );

  useEffect(() => {
    if (operationStationFilter === KDS_OPERATION_STATION_FILTER_ALL) return;
    const stillValid = activeOperationStations.some(
      (s) => s.id === operationStationFilter,
    );
    if (!stillValid) {
      setOperationStationFilter(KDS_OPERATION_STATION_FILTER_ALL);
    }
  }, [activeOperationStations, operationStationFilter]);

  const stalePendingCount = useMemo(
    () => jobs.filter((j) => isPrintJobStalePending(j, nowMs)).length,
    [jobs, nowMs],
  );

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (statusFilter === "stale_pending") {
        if (!isPrintJobStalePending(job, nowMs)) return false;
      } else if (statusFilter !== "all" && job.status !== statusFilter) {
        return false;
      }
      if (stationFilter !== "all" && job.station !== stationFilter) return false;
      if (
        !matchesKdsOperationStationSelection(
          { operationStationId: job.operationStationId },
          operationStationFilter,
        )
      ) {
        return false;
      }
      return true;
    });
  }, [jobs, statusFilter, stationFilter, operationStationFilter, nowMs]);

  const runAction = useCallback(
    async (
      job: PrintJobDocument,
      action:
        | "printed"
        | "failed"
        | "cancelled"
        | "retry"
        | "requeue",
    ) => {
      if (!restaurantId) return;
      const jobId = buildPrintJobId(job.orderId, job.lineId, job.station);
      setActingJobId(jobId);
      setError(null);
      try {
        if (action === "printed") {
          await markPrintJobPrinted(restaurantId, jobId);
        } else if (action === "failed") {
          await markPrintJobAttemptFailed(
            restaurantId,
            jobId,
            "Marcado como error (simulador)",
          );
        } else if (action === "cancelled") {
          await cancelPrintJob(restaurantId, jobId);
        } else if (action === "retry") {
          await retryPrintJob(restaurantId, jobId);
        } else if (action === "requeue") {
          await requeuePrintJobToPending(restaurantId, jobId);
        }
      } catch (e) {
        console.error("print job action", e);
        setError("No se pudo actualizar el ticket. Revisa permisos y conexión.");
      } finally {
        setActingJobId(null);
      }
    },
    [restaurantId],
  );

  const runWorker = useCallback(async (dryRun: boolean) => {
    setWorkerBusy(true);
    setWorkerError(null);
    setWorkerSummary(null);
    try {
      const res = await requestProcessPendingPrintJobs({ dryRun, maxJobs: 20 });
      if (!res.ok) {
        setWorkerError(
          res.details?.trim() || res.error || "No se pudo procesar la cola",
        );
        return;
      }
      setWorkerSummary(res.summary);
    } catch (e) {
      console.error("requestProcessPendingPrintJobs", e);
      setWorkerError("Error de red al procesar la cola.");
    } finally {
      setWorkerBusy(false);
    }
  }, []);

  return (
    <div className="hostly-config-page-body flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[var(--hostly-config-content-max)] flex-col gap-4 pb-6">
        <HostlySectionHeader
          title="Cola de impresión"
          description="Supervisa y gestiona los tickets enviados a cada estación."
        >
          <Link
            href="/dashboard/configuracion/impresoras"
            className="hostly-button-secondary hostly-button-compact"
          >
            ← Impresoras
          </Link>
        </HostlySectionHeader>

        <HostlyAlert tone="info" title="Entorno de simulación">
          Todavía no imprime físicamente. El sistema simula si cada ticket se
          imprimiría o fallaría según la configuración de su estación.
        </HostlyAlert>

        {stalePendingCount > 0 ? (
          <HostlyAlert tone="warning" title="Trabajos pendientes antiguos">
            {stalePendingCount} pendiente
            {stalePendingCount === 1 ? "" : "s"} con más de {STALE_PENDING_MINUTES}{" "}
            min sin imprimir.
          </HostlyAlert>
        ) : null}

        <HostlySurface variant="ice" className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <HostlyButton
              variant="primary"
              type="button"
              disabled={workerBusy || !authReady}
              onClick={() => void runWorker(false)}
            >
              {workerBusy ? "Procesando…" : "Procesar pendientes"}
            </HostlyButton>
            <HostlyButton
              variant="secondary"
              type="button"
              disabled={workerBusy || !authReady}
              onClick={() => void runWorker(true)}
            >
              Simular procesamiento
            </HostlyButton>
            <p className="hostly-muted text-xs">
              Se procesan hasta 20 tickets cada vez, respetando los reintentos
              programados y las estaciones activas.
            </p>
          </div>
          {workerError ? (
            <HostlyAlert tone="danger" className="mt-3">
              {workerError}
            </HostlyAlert>
          ) : null}
          {workerSummary ? (
            <HostlySurface
              variant="soft"
              className="mt-3 px-3 py-2 text-sm text-slate-700"
            >
              <p className="font-medium text-slate-900">
                {workerSummary.dryRun
                  ? "Simulación (sin cambios)"
                  : "Procesamiento completado"}
              </p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                <li>Procesados: {workerSummary.processed}</li>
                {workerSummary.dryRun ? (
                  <>
                    <li>Simulados OK: {workerSummary.simulatedPrint}</li>
                    <li>Simulados fallo: {workerSummary.simulatedFail}</li>
                  </>
                ) : (
                  <>
                    <li>Impresos: {workerSummary.printed}</li>
                    <li>Fallidos: {workerSummary.failed}</li>
                  </>
                )}
                <li>Omitidos: {workerSummary.omitted}</li>
                <li>Actualizados en paralelo: {workerSummary.skipped}</li>
                <li>Errores: {workerSummary.errors}</li>
              </ul>
              {workerSummary.items.length > 0 ? (
                <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto border-t border-slate-200/80 pt-2 text-xs text-slate-600">
                  {workerSummary.items.slice(0, 12).map((item) => (
                    <li key={item.jobId} className="truncate">
                      <span className="font-medium text-slate-800">
                        {item.productName?.trim() || "Ticket sin nombre"}
                      </span>
                      {item.modifiersLabel ? (
                        <span className="text-slate-500">
                          {" "}
                          · {item.modifiersLabel}
                        </span>
                      ) : null}
                      <span className="text-slate-400">
                        {" "}— {processingOutcomeLabel(item.outcome)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </HostlySurface>
          ) : null}
        </HostlySurface>

        <HostlySurface variant="flat" className="p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Estado
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["all", "Todos"],
                    ["pending", "Pendientes"],
                    ["stale_pending", `Antiguos (>${STALE_PENDING_MINUTES}m)`],
                    ["failed", "Fallidos"],
                    ["printed", "Impresos"],
                    ["cancelled", "Cancelados"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusFilter(value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                      statusFilter === value
                        ? "bg-sky-600 text-white ring-sky-600"
                        : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Destino general
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStationFilter("all")}
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                    stationFilter === "all"
                      ? "bg-sky-600 text-white ring-sky-600"
                      : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Todos
                </button>
                {PRINTER_STATION_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStationFilter(key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                      stationFilter === key
                        ? "bg-sky-600 text-white ring-sky-600"
                        : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES[key]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Estación operativa
              </p>
              <div
                className="mt-2 flex flex-wrap gap-2 overflow-x-auto pb-0.5"
                role="group"
                aria-label="Filtrar por estación operativa"
              >
                <button
                  type="button"
                  onClick={() =>
                    setOperationStationFilter(KDS_OPERATION_STATION_FILTER_ALL)
                  }
                  aria-pressed={
                    operationStationFilter === KDS_OPERATION_STATION_FILTER_ALL
                  }
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                    operationStationFilter === KDS_OPERATION_STATION_FILTER_ALL
                      ? "bg-[#3d7a9a] text-white ring-[#3d7a9a]"
                      : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Todas las estaciones
                </button>
                {activeOperationStations.map((station) => {
                  const active = operationStationFilter === station.id;
                  return (
                    <button
                      key={station.id}
                      type="button"
                      title={station.name}
                      aria-pressed={active}
                      onClick={() => setOperationStationFilter(station.id)}
                      className={`max-w-[min(200px,42vw)] shrink-0 truncate rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                        active
                          ? "bg-[#3d7a9a] text-white ring-[#3d7a9a]"
                          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {station.name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Los tickets sin una estación específica solo aparecen en «Todas las
                estaciones».
              </p>
            </div>
          </div>
        </HostlySurface>

        {error ? (
          <HostlyAlert tone="danger">{error}</HostlyAlert>
        ) : null}

        {loading ? (
          <HostlyLoadingState embedded label="Cargando cola de impresión…" />
        ) : !user || !restaurantId ? (
          <HostlyPermissionState embedded title="Sesión necesaria">
            Inicia sesión para consultar y gestionar la cola de impresión.
          </HostlyPermissionState>
        ) : filteredJobs.length === 0 ? (
          <HostlySurface variant="soft" className="p-5 text-center">
            <p className="hostly-muted text-sm">
              No hay tickets con los filtros actuales. Envía una comanda con impresión
              activada para generar tickets.
            </p>
          </HostlySurface>
        ) : (
          <ul className="flex flex-col gap-3">
            {filteredJobs.map((job) => {
              const jobId = buildPrintJobId(job.orderId, job.lineId, job.station);
              const isPending = job.status === "pending";
              const isFailed = job.status === "failed";
              const isCancelled = job.status === "cancelled";
              const stale = isPrintJobStalePending(job, nowMs);
              const busy = actingJobId === jobId;
              return (
                <li key={jobId}>
                  <HostlySurface variant="flat" interactive className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${statusBadgeClass(job.status)}`}
                          >
                            {statusLabel(job.status)}
                          </span>
                          {stale ? (
                            <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-900 ring-1 ring-orange-200/80">
                              Pendiente antiguo
                            </span>
                          ) : null}
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                            {job.destinationLabel}
                          </span>
                          <span
                            className={`inline-flex max-w-[min(160px,40vw)] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                              isLegacyPrintJob(job)
                                ? "bg-amber-50 text-amber-900 ring-amber-200/80"
                                : "bg-slate-100 text-slate-800 ring-slate-200/80"
                            }`}
                            title={operationStationBadgeLabel(job)}
                          >
                            {operationStationBadgeLabel(job)}
                          </span>
                          {job.copies > 1 ? (
                            <span className="text-[10px] text-slate-500">
                              ×{job.copies}
                            </span>
                          ) : null}
                          {job.attempts > 0 ? (
                            <span className="text-[10px] text-slate-500">
                              intentos: {job.attempts}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {job.quantity}× {job.productName}
                          {typeof job.course === "number" &&
                          job.course >= 1 &&
                          job.course <= 4 ? (
                            <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                              {getMenuCourseLabel(job.course)}
                            </span>
                          ) : null}
                        </p>
                        {job.modifiersLabel &&
                        !job.productName.includes(job.modifiersLabel) ? (
                          <p className="mt-1">
                            <span className="inline-flex max-w-full rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900 ring-1 ring-sky-200/80">
                              {job.modifiersLabel}
                            </span>
                          </p>
                        ) : null}
                        {job.baseProductName &&
                        job.baseProductName !== job.productName ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            Base: {job.baseProductName}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-600">
                          Mesa {job.tableName?.trim() || job.tableId} · Pedido{" "}
                          <span className="font-mono text-[11px]">{job.orderId}</span>
                        </p>
                        {job.notes ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Nota: {job.notes}
                          </p>
                        ) : null}
                        {job.lastError ? (
                          <p className="mt-1 text-xs text-rose-700">
                            Último error: {job.lastError}
                          </p>
                        ) : null}
                        {job.nextRetryAt && job.status === "failed" ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Próximo reintento sugerido:{" "}
                            {formatJobTime(job.nextRetryAt)}
                          </p>
                        ) : null}
                        {job.printerName || job.channel ? (
                          <p className="mt-1 text-xs text-slate-500">
                            {job.printerName ? `Impresora: ${job.printerName}` : null}
                            {job.printerName && job.channel ? " · " : null}
                            {job.channel ? `Canal: ${job.channel}` : null}
                          </p>
                        ) : null}
                        <p className="text-[10px] text-slate-400">
                          Creado {formatJobTime(job.createdAt)}
                          {job.lastAttemptAt
                            ? ` · último intento ${formatJobTime(job.lastAttemptAt)}`
                            : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {isPending ? (
                          <>
                            <HostlyButton
                              variant="primary"
                              type="button"
                              disabled={busy}
                              onClick={() => void runAction(job, "printed")}
                            >
                              Marcar impreso
                            </HostlyButton>
                            <HostlyButton
                              variant="secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => void runAction(job, "failed")}
                            >
                              Marcar error
                            </HostlyButton>
                            <HostlyButton
                              variant="secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => void runAction(job, "cancelled")}
                            >
                              Cancelar
                            </HostlyButton>
                          </>
                        ) : null}
                        {isFailed ? (
                          <>
                            <HostlyButton
                              variant="primary"
                              type="button"
                              disabled={busy}
                              onClick={() => void runAction(job, "retry")}
                            >
                              Reintentar
                            </HostlyButton>
                            <HostlyButton
                              variant="secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => void runAction(job, "cancelled")}
                            >
                              Cancelar
                            </HostlyButton>
                          </>
                        ) : null}
                        {isCancelled ? (
                          <HostlyButton
                            variant="secondary"
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(job, "requeue")}
                          >
                            Reenviar a pendiente
                          </HostlyButton>
                        ) : null}
                      </div>
                    </div>
                  </HostlySurface>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
