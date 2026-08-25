import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { parseOperationStationDocument } from "@/lib/firestore/operation-stations";
import {
  getDefaultPrinterConfig,
  parsePrinterConfigDocument,
} from "@/lib/firestore/printer-config";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import type { PrinterConfigDocument } from "@/lib/printing/printer-config-types";
import { parsePrintJobDocument } from "@/lib/printing/parse-print-job-document";
import {
  buildOperationStationMap,
  resolvePrintJobPrinterTarget,
} from "@/lib/printing/resolve-print-job-printer-target";
import { computePrintJobNextRetryAt } from "@/lib/printing/print-job-retry";
import type { PrintJobDocument } from "@/lib/printing/print-job-types";
import { normalizePrintJobAttempts } from "@/lib/printing/print-job-types";
import type {
  ProcessPendingPrintJobsResult,
  ProcessPrintJobItemResult,
} from "@/lib/printing/print-worker-types";

export const DEFAULT_PRINT_WORKER_MAX_JOBS = 20;
export const MAX_PRINT_WORKER_MAX_JOBS = 50;

export type ProcessPendingPrintJobsParams = {
  db: Firestore;
  restaurantId: string;
  dryRun?: boolean;
  maxJobs?: number;
};

function clampMaxJobs(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_PRINT_WORKER_MAX_JOBS;
  }
  const n = Math.floor(raw);
  if (n < 1) return 1;
  if (n > MAX_PRINT_WORKER_MAX_JOBS) return MAX_PRINT_WORKER_MAX_JOBS;
  return n;
}

async function loadPrinterConfigAdmin(
  db: Firestore,
  restaurantId: string,
): Promise<PrinterConfigDocument> {
  const snap = await db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("config")
    .doc("printers")
    .get();
  if (!snap.exists) return getDefaultPrinterConfig();
  return parsePrinterConfigDocument(snap.data());
}

type PlannedAction =
  | { kind: "print"; copies: number }
  | { kind: "fail"; message: string }
  | { kind: "omit"; reason: string };

async function loadOperationStationsByIdAdmin(
  db: Firestore,
  restaurantId: string,
): Promise<Map<string, OperationStationDocument>> {
  const snap = await db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("operationStations")
    .get();
  const list: OperationStationDocument[] = [];
  snap.forEach((docSnap) => {
    const parsed = parseOperationStationDocument(
      docSnap.id,
      docSnap.data(),
      restaurantId,
    );
    if (parsed) list.push(parsed);
  });
  return buildOperationStationMap(list);
}

function workerItemMeta(job: PrintJobDocument): Pick<
  ProcessPrintJobItemResult,
  "productName" | "modifiersLabel"
> {
  return {
    productName: job.productName,
    ...(job.modifiersLabel?.trim()
      ? { modifiersLabel: job.modifiersLabel.trim() }
      : {}),
  };
}

function hasJobPrinterSnapshot(job: PrintJobDocument): boolean {
  return Boolean(job.printerName?.trim() || job.channel?.trim());
}

function hasActiveOperationStationPrinter(
  job: PrintJobDocument,
  operationStationsById: ReadonlyMap<string, OperationStationDocument>,
): boolean {
  const operationStationId = job.operationStationId?.trim();
  if (!operationStationId) return false;
  const station = operationStationsById.get(operationStationId);
  if (!station || station.active === false) return false;
  return Boolean(station.printerName?.trim() || station.printerChannel?.trim());
}

function planJobAction(
  job: PrintJobDocument,
  config: PrinterConfigDocument,
  nowMs: number,
  operationStationsById: ReadonlyMap<string, OperationStationDocument>,
): PlannedAction {
  if (job.status !== "pending") {
    return { kind: "omit", reason: `status_${job.status}` };
  }
  if (job.nextRetryAt != null && job.nextRetryAt > nowMs) {
    return { kind: "omit", reason: "next_retry_at" };
  }
  if (!config.enabled) {
    return { kind: "omit", reason: "printing_disabled" };
  }

  const stationCfg = config.stations[job.station];
  const hasSpecificTarget =
    hasJobPrinterSnapshot(job) ||
    hasActiveOperationStationPrinter(job, operationStationsById);

  // `stationCfg.enabled` pasa a significar "fallback de tipo activo". Un
  // snapshot del trabajo o un destino de la estación concreta no debe quedar
  // bloqueado por el interruptor legacy Cocina/Barra/Coctelería.
  if (!stationCfg?.enabled && !hasSpecificTarget) {
    return { kind: "omit", reason: "station_disabled" };
  }

  const target = resolvePrintJobPrinterTarget({
    legacyStation: job.station,
    legacyStationCfg: stationCfg,
    operationStationId: job.operationStationId,
    operationStationName: job.operationStationName,
    operationStationsById,
    jobPrinterName: job.printerName,
    jobChannel: job.channel,
    skipInactiveOperationStationPrinter: true,
  });

  if (!target.hasPrinterTarget) {
    return {
      kind: "fail",
      message: `Falta canal o nombre de impresora para ${target.destinationLabel}`,
    };
  }

  const copies = Math.min(5, Math.max(1, Math.floor(job.copies) || 1));
  return { kind: "print", copies };
}

function printJobRef(db: Firestore, restaurantId: string, jobId: string) {
  return db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("printJobs")
    .doc(jobId);
}

async function commitPrinted(
  db: Firestore,
  restaurantId: string,
  jobId: string,
  nowMs: number,
): Promise<"printed" | "skipped"> {
  const ref = printJobRef(db, restaurantId, jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "skipped";
    const job = parsePrintJobDocument(jobId, snap.data());
    if (!job || job.status !== "pending") return "skipped";
    if (job.nextRetryAt != null && job.nextRetryAt > nowMs) return "skipped";

    tx.update(ref, {
      status: "printed",
      updatedAt: nowMs,
      lastAttemptAt: nowMs,
      lastError: FieldValue.delete(),
      nextRetryAt: FieldValue.delete(),
    });
    return "printed";
  });
}

async function commitFailed(
  db: Firestore,
  restaurantId: string,
  jobId: string,
  errorMessage: string,
  nowMs: number,
): Promise<"failed" | "skipped"> {
  const ref = printJobRef(db, restaurantId, jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "skipped";
    const job = parsePrintJobDocument(jobId, snap.data());
    if (!job || job.status !== "pending") return "skipped";
    if (job.nextRetryAt != null && job.nextRetryAt > nowMs) return "skipped";

    const attempts = normalizePrintJobAttempts(job.attempts) + 1;
    const msg = errorMessage.trim().slice(0, 500) || "Error de impresión";

    tx.update(ref, {
      status: "failed",
      attempts,
      lastAttemptAt: nowMs,
      lastError: msg,
      nextRetryAt: computePrintJobNextRetryAt(attempts, nowMs),
      updatedAt: nowMs,
    });
    return "failed";
  });
}

/**
 * Worker simulado: consume jobs `pending`, respeta `nextRetryAt` y routing por
 * estación. Sin hardware; prepara el mismo contrato que un conector real.
 */
export async function processPendingPrintJobs(
  params: ProcessPendingPrintJobsParams,
): Promise<ProcessPendingPrintJobsResult> {
  const rid = params.restaurantId.trim();
  const dryRun = params.dryRun === true;
  const maxJobs = clampMaxJobs(params.maxJobs);
  const nowMs = Date.now();

  const result: ProcessPendingPrintJobsResult = {
    dryRun,
    processed: 0,
    printed: 0,
    failed: 0,
    omitted: 0,
    skipped: 0,
    errors: 0,
    simulatedPrint: 0,
    simulatedFail: 0,
    items: [],
  };

  if (!rid) return result;

  const [config, operationStationsById] = await Promise.all([
    loadPrinterConfigAdmin(params.db, rid),
    loadOperationStationsByIdAdmin(params.db, rid),
  ]);

  const snap = await params.db
    .collection("restaurants")
    .doc(rid)
    .collection("printJobs")
    .where("status", "==", "pending")
    .limit(maxJobs)
    .get();

  const docs = snap.docs
    .map((d) => ({ id: d.id, job: parsePrintJobDocument(d.id, d.data()) }))
    .filter((row): row is { id: string; job: PrintJobDocument } => row.job != null)
    .sort((a, b) => a.job.createdAt - b.job.createdAt);

  for (const { id: jobId, job } of docs) {
    result.processed += 1;
    const plan = planJobAction(job, config, nowMs, operationStationsById);

    if (plan.kind === "omit") {
      result.omitted += 1;
      result.items.push({
        jobId,
        outcome: "omitted",
        reason: plan.reason,
        copies: job.copies,
        ...workerItemMeta(job),
      });
      continue;
    }

    if (dryRun) {
      if (plan.kind === "print") {
        result.simulatedPrint += 1;
        result.items.push({
          jobId,
          outcome: "dry_run_print",
          copies: plan.copies,
          ...workerItemMeta(job),
        });
      } else {
        result.simulatedFail += 1;
        result.items.push({
          jobId,
          outcome: "dry_run_fail",
          reason: plan.message,
          copies: job.copies,
          ...workerItemMeta(job),
        });
      }
      continue;
    }

    try {
      if (plan.kind === "print") {
        const txOutcome = await commitPrinted(params.db, rid, jobId, nowMs);
        if (txOutcome === "printed") {
          result.printed += 1;
          result.items.push({
            jobId,
            outcome: "printed",
            copies: plan.copies,
            ...workerItemMeta(job),
          });
        } else {
          result.skipped += 1;
          result.items.push({
            jobId,
            outcome: "skipped",
            reason: "concurrent_or_state_changed",
            copies: job.copies,
            ...workerItemMeta(job),
          });
        }
      } else {
        const txOutcome = await commitFailed(
          params.db,
          rid,
          jobId,
          plan.message,
          nowMs,
        );
        if (txOutcome === "failed") {
          result.failed += 1;
          result.items.push({
            jobId,
            outcome: "failed",
            reason: plan.message,
            copies: job.copies,
            ...workerItemMeta(job),
          });
        } else {
          result.skipped += 1;
          result.items.push({
            jobId,
            outcome: "skipped",
            reason: "concurrent_or_state_changed",
            copies: job.copies,
            ...workerItemMeta(job),
          });
        }
      }
    } catch {
      result.errors += 1;
      result.items.push({
        jobId,
        outcome: "error",
        reason: "transaction_failed",
        copies: job.copies,
        ...workerItemMeta(job),
      });
    }
  }

  return result;
}
