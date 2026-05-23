import {
  PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES,
  type PrinterStationKey,
} from "@/lib/printing/printer-config-types";
import type { PrintJobDocument } from "@/lib/printing/print-job-types";
import { normalizePrintJobAttempts } from "@/lib/printing/print-job-types";
import {
  parseFirestoreSelectedModifiers,
} from "@/lib/modifiers/cart-order-modifiers";

/** Parsea documento Firestore (cliente o admin). */
export function parsePrintJobDocument(
  jobId: string,
  raw: unknown,
): PrintJobDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const restaurantId =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  const orderId = typeof data.orderId === "string" ? data.orderId.trim() : "";
  const tableId = typeof data.tableId === "string" ? data.tableId.trim() : "";
  const lineId = typeof data.lineId === "string" ? data.lineId.trim() : "";
  const productName =
    typeof data.productName === "string" ? data.productName.trim() : "";
  const station = data.station as PrinterStationKey | undefined;
  if (
    !restaurantId ||
    !orderId ||
    !tableId ||
    !lineId ||
    !productName ||
    (station !== "kitchen" && station !== "bar" && station !== "cocktail")
  ) {
    return null;
  }
  const status = data.status;
  if (
    status !== "pending" &&
    status !== "printed" &&
    status !== "failed" &&
    status !== "cancelled"
  ) {
    return null;
  }
  const createdAt =
    typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
      ? data.createdAt
      : 0;
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : createdAt;
  const quantity =
    typeof data.quantity === "number" && Number.isFinite(data.quantity)
      ? Math.max(1, Math.floor(data.quantity))
      : 1;
  const copies =
    typeof data.copies === "number" && Number.isFinite(data.copies)
      ? Math.min(5, Math.max(1, Math.floor(data.copies)))
      : 1;
  const destinationLabel =
    typeof data.destinationLabel === "string" && data.destinationLabel.trim()
      ? data.destinationLabel.trim()
      : PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES[station];
  const idempotencyKey =
    typeof data.idempotencyKey === "string" && data.idempotencyKey.trim()
      ? data.idempotencyKey.trim()
      : jobId;

  const readOpt = (key: string): string | undefined => {
    const v = data[key];
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t || undefined;
  };

  const courseRaw = data.course;
  const course =
    typeof courseRaw === "number" && Number.isFinite(courseRaw)
      ? Math.floor(courseRaw)
      : undefined;

  const attempts = normalizePrintJobAttempts(data.attempts);
  const lastAttemptAt =
    typeof data.lastAttemptAt === "number" && Number.isFinite(data.lastAttemptAt)
      ? data.lastAttemptAt
      : undefined;
  const lastError = readOpt("lastError");
  const nextRetryAt =
    typeof data.nextRetryAt === "number" && Number.isFinite(data.nextRetryAt)
      ? data.nextRetryAt
      : undefined;

  const selectedModifiers = parseFirestoreSelectedModifiers(data.selectedModifiers);
  const modifierTotalRaw = data.modifierTotal;
  const modifierTotal =
    typeof modifierTotalRaw === "number" && Number.isFinite(modifierTotalRaw)
      ? modifierTotalRaw
      : undefined;
  const modifiersLabel = readOpt("modifiersLabel");
  const baseProductName = readOpt("baseProductName");

  return {
    restaurantId,
    orderId,
    tableId,
    ...(readOpt("tableName") ? { tableName: readOpt("tableName") } : {}),
    lineId,
    ...(readOpt("productId") ? { productId: readOpt("productId") } : {}),
    ...(readOpt("operationStationId")
      ? { operationStationId: readOpt("operationStationId") }
      : {}),
    ...(readOpt("operationStationName")
      ? { operationStationName: readOpt("operationStationName") }
      : {}),
    ...(baseProductName ? { baseProductName } : {}),
    productName,
    quantity,
    ...(selectedModifiers.length > 0 ? { selectedModifiers } : {}),
    ...(modifierTotal != null ? { modifierTotal } : {}),
    ...(modifiersLabel ? { modifiersLabel } : {}),
    ...(readOpt("notes") ? { notes: readOpt("notes") } : {}),
    ...(course !== undefined && course >= 0 ? { course } : {}),
    station,
    destinationLabel,
    ...(readOpt("printerName") ? { printerName: readOpt("printerName") } : {}),
    ...(readOpt("channel") ? { channel: readOpt("channel") } : {}),
    copies,
    status,
    createdAt,
    ...(readOpt("createdBy") ? { createdBy: readOpt("createdBy") } : {}),
    updatedAt,
    source: data.source === "comanda" ? "comanda" : "comanda",
    idempotencyKey,
    attempts,
    ...(lastAttemptAt !== undefined ? { lastAttemptAt } : {}),
    ...(lastError ? { lastError } : {}),
    ...(nextRetryAt !== undefined ? { nextRetryAt } : {}),
  };
}
