import type { PrinterStationKey } from "@/lib/printing/printer-config-types";
import type { CartOrderLineSelectedModifier } from "@/lib/modifiers/cart-order-modifiers";

export const PRINT_JOB_STATUSES = [
  "pending",
  "printed",
  "failed",
  "cancelled",
] as const;

export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];

export type PrintJobSource = "comanda";

/** Pendiente más antiguo que esto → badge “Pendiente antiguo”. */
export const PRINT_JOB_STALE_PENDING_MS = 15 * 60 * 1000;

/** `restaurants/{restaurantId}/printJobs/{jobId}` */
export type PrintJobDocument = {
  restaurantId: string;
  orderId: string;
  tableId: string;
  tableName?: string;
  lineId: string;
  productId?: string;
  productName: string;
  /** Nombre base del catálogo (sin modifiers). */
  baseProductName?: string;
  selectedModifiers?: CartOrderLineSelectedModifier[];
  modifierTotal?: number;
  /** Resumen corto: "Chupito" o "Copa + mixer · Tónica". */
  modifiersLabel?: string;
  quantity: number;
  notes?: string;
  course?: number;
  station: PrinterStationKey;
  /** Estación operativa concreta (Barra 2, etc.); no sustituye `station` en jobId. */
  operationStationId?: string;
  operationStationName?: string;
  destinationLabel: string;
  printerName?: string;
  channel?: string;
  copies: number;
  status: PrintJobStatus;
  createdAt: number;
  createdBy?: string;
  updatedAt: number;
  source: PrintJobSource;
  idempotencyKey: string;
  /** Intentos de impresión fallidos (0 en jobs nuevos; legacy sin campo = 0). */
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  nextRetryAt?: number;
};

export function normalizePrintJobAttempts(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

export function isPrintJobStalePending(
  job: Pick<PrintJobDocument, "status" | "createdAt" | "updatedAt">,
  nowMs: number = Date.now(),
): boolean {
  if (job.status !== "pending") return false;
  const anchor =
    typeof job.updatedAt === "number" && job.updatedAt > 0
      ? job.updatedAt
      : job.createdAt;
  return nowMs - anchor >= PRINT_JOB_STALE_PENDING_MS;
}
