import {
  collection,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { resolveKdsDestination } from "@/lib/kds/kds-destination";
import {
  readStationFieldsFromFirestoreRecord,
  resolveOperationStationFieldsForCartLine,
  resolveStationFieldsForCartLine,
  type OrderLinePreparationArea,
  type OrderLineStation,
} from "@/lib/kds/order-line-station";
import { listOperationStations } from "@/lib/firestore/operation-stations";
import type { PrinterConfigDocument } from "@/lib/printing/printer-config-types";
import {
  PRINTER_STATION_KEYS,
  type PrinterStationKey,
} from "@/lib/printing/printer-config-types";
import {
  buildOperationStationMap,
  resolvePrintJobPrinterTarget,
} from "@/lib/printing/resolve-print-job-printer-target";
import { computePrintJobNextRetryAt } from "@/lib/printing/print-job-retry";
import { parsePrintJobDocument } from "@/lib/printing/parse-print-job-document";
import type {
  PrintJobDocument,
  PrintJobStatus,
} from "@/lib/printing/print-job-types";
import { normalizePrintJobAttempts } from "@/lib/printing/print-job-types";
import type { Product } from "@/types/product";
import {
  resolveLineModifierTotal,
  resolveOrderLineModifierPresentation,
  selectedModifiersToFirestorePayload,
  type CartOrderLineSelectedModifier,
} from "@/lib/modifiers/cart-order-modifiers";

const PRINT_JOBS_LIST_LIMIT = 150;

export type ComandaLineForPrintJob = {
  id: string;
  quantity: number;
  status: string;
  lineNote?: string;
  course?: number;
  station?: OrderLineStation;
  preparationArea?: OrderLinePreparationArea;
  operationStationId?: string;
  operationStationName?: string;
  displayName?: string;
  selectedModifiers?: CartOrderLineSelectedModifier[];
  modifierTotal?: number;
  product: Product;
};

export type CreatePrintJobsParams = {
  restaurantId: string;
  orderId: string;
  tableId: string;
  tableName?: string;
  lines: ComandaLineForPrintJob[];
  printerConfig: PrinterConfigDocument;
  createdBy?: string;
};

export type CreatePrintJobsResult = {
  created: number;
  skipped: number;
  failed: number;
};

export type CancelPrintJobsForOrderLineResult = {
  cancelled: number;
  skipped: number;
  errors: number;
};

function sanitizePrintJobIdPart(value: string): string {
  return value
    .trim()
    .replace(/\//g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 240);
}

/** Idempotente: `{orderId}_{lineId}_{station}` */
export function buildPrintJobId(
  orderId: string,
  lineId: string,
  station: PrinterStationKey,
): string {
  return `${sanitizePrintJobIdPart(orderId)}_${sanitizePrintJobIdPart(lineId)}_${station}`;
}

export function buildPrintJobIdempotencyKey(
  orderId: string,
  lineId: string,
  station: PrinterStationKey,
): string {
  return buildPrintJobId(orderId, lineId, station);
}

export function printJobsCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "printJobs");
}

export function printJobDocRef(restaurantId: string, jobId: string) {
  return doc(printJobsCollectionRef(restaurantId), jobId.trim());
}

function isCancelledComandaLine(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return s === "cancelled";
}

function kdsDestinationToPrinterStation(
  destination: ReturnType<typeof resolveKdsDestination>,
): PrinterStationKey | null {
  if (destination === "kitchen" || destination === "bar" || destination === "cocktail") {
    return destination;
  }
  return null;
}

function authUidOrUndefined(): string | undefined {
  const uid = auth.currentUser?.uid?.trim();
  return uid || undefined;
}

function cartLineToKdsRoutableItem(line: ComandaLineForPrintJob) {
  const materialized = readStationFieldsFromFirestoreRecord({
    station: line.station,
    preparationArea: line.preparationArea,
  });
  const fields =
    materialized.station || materialized.preparationArea
      ? materialized
      : resolveStationFieldsForCartLine(line);
  return {
    nombre: line.product.nombre,
    name: line.product.nombre,
    categoria: line.product.categoria,
    station: fields.station,
    preparationArea: fields.preparationArea,
  };
}

async function createSinglePrintJobIdempotent(
  restaurantId: string,
  payload: PrintJobDocument,
  jobId: string,
): Promise<"created" | "skipped" | "failed"> {
  const ref = printJobDocRef(restaurantId, jobId);
  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (snap.exists()) return "skipped";
      transaction.set(ref, payload);
      return "created";
    });
  } catch {
    return "failed";
  }
}

/**
 * Crea jobs de impresión por línea enviada. Idempotente por orderId+lineId+station.
 * No lanza si la config global está desactivada o la estación no aplica.
 */
export async function createPrintJobsForComandaLines(
  params: CreatePrintJobsParams,
): Promise<CreatePrintJobsResult> {
  const result: CreatePrintJobsResult = { created: 0, skipped: 0, failed: 0 };
  const rid = params.restaurantId.trim();
  const orderId = params.orderId.trim();
  const tableId = params.tableId.trim();
  if (!rid || !orderId || !tableId || !isAuthReady()) return result;
  if (!params.printerConfig.enabled) return result;

  const now = Date.now();
  const createdBy = params.createdBy?.trim() || auth.currentUser?.uid?.trim();
  const operationStationsById = buildOperationStationMap(
    await listOperationStations(rid),
  );

  for (const line of params.lines) {
    if (isCancelledComandaLine(line.status)) continue;

    const destination = resolveKdsDestination(cartLineToKdsRoutableItem(line));
    const station = kdsDestinationToPrinterStation(destination);
    if (!station) continue;

    const stationCfg = params.printerConfig.stations[station];
    if (!stationCfg?.enabled) continue;

    const jobId = buildPrintJobId(orderId, line.id, station);
    const idempotencyKey = buildPrintJobIdempotencyKey(orderId, line.id, station);
    const copies = Math.min(5, Math.max(1, Math.floor(stationCfg.copies ?? 1)));
    const course =
      typeof line.course === "number" && Number.isFinite(line.course)
        ? Math.floor(line.course)
        : undefined;
    const opFields = resolveOperationStationFieldsForCartLine(line);
    const baseProductName = String(line.product.nombre ?? "").trim() || "—";
    const presentation = resolveOrderLineModifierPresentation({
      baseProductName,
      displayName: line.displayName,
      selectedModifiers: line.selectedModifiers,
      lineNote: line.lineNote,
    });
    const selectedModifiersPayload = selectedModifiersToFirestorePayload(
      line.selectedModifiers,
    );
    const modifierTotal = resolveLineModifierTotal(line);
    const printerTarget = resolvePrintJobPrinterTarget({
      legacyStation: station,
      legacyStationCfg: stationCfg,
      operationStationId: opFields.operationStationId,
      operationStationName: opFields.operationStationName,
      operationStationsById,
    });

    const payload: PrintJobDocument = {
      restaurantId: rid,
      orderId,
      tableId,
      ...(params.tableName?.trim()
        ? { tableName: params.tableName.trim() }
        : {}),
      lineId: line.id,
      productId: String(line.product.id),
      productName: presentation.displayName,
      baseProductName,
      ...(selectedModifiersPayload.length > 0
        ? {
            selectedModifiers: selectedModifiersPayload,
            modifierTotal,
            modifiersLabel: presentation.modifiersLabel,
          }
        : {}),
      quantity: Math.max(1, Math.floor(line.quantity) || 1),
      ...(presentation.note ? { notes: presentation.note } : {}),
      ...(course !== undefined && course >= 0 ? { course } : {}),
      station,
      ...(opFields.operationStationId
        ? { operationStationId: opFields.operationStationId }
        : {}),
      ...(opFields.operationStationName
        ? { operationStationName: opFields.operationStationName }
        : {}),
      destinationLabel: printerTarget.destinationLabel,
      ...(printerTarget.printerName
        ? { printerName: printerTarget.printerName }
        : {}),
      ...(printerTarget.channel ? { channel: printerTarget.channel } : {}),
      copies,
      status: "pending",
      createdAt: now,
      ...(createdBy ? { createdBy } : {}),
      updatedAt: now,
      source: "comanda",
      idempotencyKey,
      attempts: 0,
    };

    const outcome = await createSinglePrintJobIdempotent(rid, payload, jobId);
    if (outcome === "created") result.created += 1;
    else if (outcome === "skipped") result.skipped += 1;
    else result.failed += 1;
  }

  return result;
}

export function listenPrintJobs(
  restaurantId: string,
  onData: (jobs: PrintJobDocument[]) => void,
  onListenError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const q = query(
    printJobsCollectionRef(rid),
    orderBy("createdAt", "desc"),
    limit(PRINT_JOBS_LIST_LIMIT),
  );

  return onSnapshot(
    q,
    (snap) => {
      const jobs: PrintJobDocument[] = [];
      snap.forEach((docSnap) => {
        const parsed = parsePrintJobDocument(docSnap.id, docSnap.data());
        if (parsed) jobs.push(parsed);
      });
      onData(jobs);
    },
    (error) => {
      onListenError?.(error);
    },
  );
}

async function updatePrintJobStatus(
  restaurantId: string,
  jobId: string,
  status: PrintJobStatus,
  extra?: Record<string, unknown>,
): Promise<void> {
  const rid = restaurantId.trim();
  const jid = jobId.trim();
  if (!rid || !jid) throw new Error("MISSING_IDS");
  const ref = printJobDocRef(rid, jid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("PRINT_JOB_NOT_FOUND");
  const uid = authUidOrUndefined();
  await updateDoc(ref, {
    status,
    updatedAt: Date.now(),
    ...(uid ? { updatedBy: uid } : {}),
    ...extra,
  });
}

export function markPrintJobPrinted(
  restaurantId: string,
  jobId: string,
): Promise<void> {
  const now = Date.now();
  return updatePrintJobStatus(restaurantId, jobId, "printed", {
    lastAttemptAt: now,
    lastError: deleteField(),
    nextRetryAt: deleteField(),
  });
}

/** Simulador / worker: fallo con metadata de reintento. */
export async function markPrintJobAttemptFailed(
  restaurantId: string,
  jobId: string,
  errorMessage?: string,
): Promise<void> {
  const rid = restaurantId.trim();
  const jid = jobId.trim();
  if (!rid || !jid) throw new Error("MISSING_IDS");
  const ref = printJobDocRef(rid, jid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("PRINT_JOB_NOT_FOUND");
  const job = parsePrintJobDocument(jid, snap.data());
  if (!job) throw new Error("PRINT_JOB_INVALID");
  if (job.status === "printed" || job.status === "cancelled") {
    throw new Error("PRINT_JOB_NOT_RETRYABLE");
  }

  const now = Date.now();
  const attempts = job.attempts + 1;
  const msg =
    typeof errorMessage === "string" && errorMessage.trim()
      ? errorMessage.trim().slice(0, 500)
      : "Error de impresión";

  const uid = authUidOrUndefined();
  await updateDoc(ref, {
    status: "failed",
    attempts,
    lastAttemptAt: now,
    lastError: msg,
    nextRetryAt: computePrintJobNextRetryAt(attempts, now),
    updatedAt: now,
    ...(uid ? { updatedBy: uid } : {}),
  });
}

export function markPrintJobFailed(
  restaurantId: string,
  jobId: string,
  errorMessage?: string,
): Promise<void> {
  return markPrintJobAttemptFailed(restaurantId, jobId, errorMessage);
}

export function cancelPrintJob(
  restaurantId: string,
  jobId: string,
): Promise<void> {
  return updatePrintJobStatus(restaurantId, jobId, "cancelled", {
    nextRetryAt: deleteField(),
  });
}

/**
 * Reintenta un job fallido: mismo documento → `pending` (sin duplicar).
 * Conserva `attempts`; el siguiente fallo lo incrementará.
 */
export async function retryPrintJob(
  restaurantId: string,
  jobId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  const jid = jobId.trim();
  if (!rid || !jid) throw new Error("MISSING_IDS");
  const ref = printJobDocRef(rid, jid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("PRINT_JOB_NOT_FOUND");
  const job = parsePrintJobDocument(jid, snap.data());
  if (!job || job.status !== "failed") throw new Error("INVALID_RETRY_STATE");

  const now = Date.now();
  await updateDoc(ref, {
    status: "pending",
    updatedAt: now,
    lastAttemptAt: now,
    lastError: deleteField(),
    nextRetryAt: deleteField(),
    ...(authUidOrUndefined() ? { updatedBy: authUidOrUndefined() } : {}),
  });
}

/** Reenvía a cola un job cancelado (manual en simulador). */
export async function requeuePrintJobToPending(
  restaurantId: string,
  jobId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  const jid = jobId.trim();
  if (!rid || !jid) throw new Error("MISSING_IDS");
  const ref = printJobDocRef(rid, jid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("PRINT_JOB_NOT_FOUND");
  const job = parsePrintJobDocument(jid, snap.data());
  if (!job || job.status !== "cancelled") {
    throw new Error("INVALID_REQUEUE_STATE");
  }

  const now = Date.now();
  await updateDoc(ref, {
    status: "pending",
    updatedAt: now,
    lastError: deleteField(),
    nextRetryAt: deleteField(),
    ...(authUidOrUndefined() ? { updatedBy: authUidOrUndefined() } : {}),
  });
}

/**
 * Cancela jobs de impresión de una línea (máx. 3 estaciones por id determinista).
 * No modifica jobs `printed`. Sin queries compuestas.
 */
export async function cancelPrintJobsForOrderLine(
  restaurantId: string,
  orderId: string,
  lineId: string,
): Promise<CancelPrintJobsForOrderLineResult> {
  const result: CancelPrintJobsForOrderLineResult = {
    cancelled: 0,
    skipped: 0,
    errors: 0,
  };
  const rid = restaurantId.trim();
  const oid = orderId.trim();
  const lid = lineId.trim();
  if (!rid || !oid || !lid || !isAuthReady()) return result;

  const now = Date.now();
  const uid = authUidOrUndefined();

  for (const station of PRINTER_STATION_KEYS) {
    const jobId = buildPrintJobId(oid, lid, station);
    try {
      const ref = printJobDocRef(rid, jobId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        result.skipped += 1;
        continue;
      }
      const job = parsePrintJobDocument(jobId, snap.data());
      if (!job) {
        result.skipped += 1;
        continue;
      }
      if (job.status === "printed" || job.status === "cancelled") {
        result.skipped += 1;
        continue;
      }
      if (job.status !== "pending" && job.status !== "failed") {
        result.skipped += 1;
        continue;
      }
      await updateDoc(ref, {
        status: "cancelled",
        updatedAt: now,
        nextRetryAt: deleteField(),
        ...(uid ? { updatedBy: uid } : {}),
      });
      result.cancelled += 1;
    } catch {
      result.errors += 1;
    }
  }

  return result;
}
