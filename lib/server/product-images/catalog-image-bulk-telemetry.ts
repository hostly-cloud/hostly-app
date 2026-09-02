import type { MessageMetadata } from "@vercel/queue";
import {
  catalogImageBulkQueueRetryDecision,
  processCatalogImageBulkQueueMessage,
  type CatalogImageBulkQueueProcessResult,
} from "@/lib/server/product-images/catalog-image-bulk-queue";

const SERVICE = "catalog-image-bulk-queue";

export type CatalogImageBulkQueueLogEvent =
  | "delivery_started"
  | "delivery_completed"
  | "delivery_retry_scheduled"
  | "delivery_expiring"
  | "delivery_discarded";

export type CatalogImageBulkQueueLogEntry = {
  timestamp: string;
  level: "info" | "warning" | "error";
  service: typeof SERVICE;
  event: CatalogImageBulkQueueLogEvent;
  messageId: string;
  deliveryCount: number;
  topic: string;
  consumerGroup: string;
  region: string;
  messageAgeMs: number;
  expiresInMs: number;
  restaurantId?: string;
  jobId?: string;
  kind?: "process" | "control_recovery";
  durationMs?: number;
  processed?: boolean;
  requeued?: boolean;
  jobStatus?: string;
  recoveryStatus?: "reconciled" | "superseded";
  errorCode?: string;
  retryAfterSeconds?: number;
  acknowledged?: boolean;
};

export type CatalogImageBulkQueueLogWriter = (
  level: CatalogImageBulkQueueLogEntry["level"],
  entry: CatalogImageBulkQueueLogEntry,
) => void;

type ProcessMessage = typeof processCatalogImageBulkQueueMessage;

function safeLogId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(normalized)
    ? normalized
    : undefined;
}

function readMessageContext(message: unknown): Pick<
  CatalogImageBulkQueueLogEntry,
  "restaurantId" | "jobId" | "kind"
> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return {};
  }
  const raw = message as Record<string, unknown>;
  const restaurantId = safeLogId(raw.restaurantId);
  const jobId = safeLogId(raw.jobId);
  const kind =
    raw.kind == null || raw.kind === "process"
      ? "process"
      : raw.kind === "control_recovery"
        ? "control_recovery"
        : undefined;
  return {
    ...(restaurantId ? { restaurantId } : {}),
    ...(jobId ? { jobId } : {}),
    ...(kind ? { kind } : {}),
  };
}

function finiteMilliseconds(value: Date, now: number): number {
  const timestamp = value instanceof Date ? value.getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : 0;
}

function remainingMilliseconds(value: Date, now: number): number {
  const timestamp = value instanceof Date ? value.getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : 0;
}

function safeErrorCode(error: unknown): string {
  const raw =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : error instanceof Error
        ? error.name
        : "UNKNOWN_ERROR";
  const normalized = raw
    .trim()
    .replace(/[^A-Za-z0-9_.:-]/g, "_")
    .slice(0, 160);
  return normalized || "UNKNOWN_ERROR";
}

function baseEntry(params: {
  message: unknown;
  metadata: MessageMetadata;
  now: number;
  event: CatalogImageBulkQueueLogEvent;
  level: CatalogImageBulkQueueLogEntry["level"];
}): CatalogImageBulkQueueLogEntry {
  return {
    timestamp: new Date(params.now).toISOString(),
    level: params.level,
    service: SERVICE,
    event: params.event,
    messageId: params.metadata.messageId,
    deliveryCount: params.metadata.deliveryCount,
    topic: params.metadata.topicName,
    consumerGroup: params.metadata.consumerGroup,
    region: params.metadata.region,
    messageAgeMs: finiteMilliseconds(params.metadata.createdAt, params.now),
    expiresInMs: remainingMilliseconds(params.metadata.expiresAt, params.now),
    ...readMessageContext(params.message),
  };
}

export const writeCatalogImageBulkQueueLog: CatalogImageBulkQueueLogWriter = (
  level,
  entry,
) => {
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warning") {
    console.warn(line);
  } else {
    console.info(line);
  }
};

function emitSafely(
  writer: CatalogImageBulkQueueLogWriter,
  entry: CatalogImageBulkQueueLogEntry,
) {
  try {
    writer(entry.level, entry);
  } catch {
    // La telemetría nunca debe bloquear ni confirmar trabajo de negocio.
  }
}

export async function handleCatalogImageBulkQueueDelivery(
  message: unknown,
  metadata: MessageMetadata,
  options?: {
    processMessage?: ProcessMessage;
    writeLog?: CatalogImageBulkQueueLogWriter;
    now?: () => number;
  },
): Promise<CatalogImageBulkQueueProcessResult> {
  const processMessage =
    options?.processMessage ?? processCatalogImageBulkQueueMessage;
  const writeLog = options?.writeLog ?? writeCatalogImageBulkQueueLog;
  const now = options?.now ?? Date.now;
  const startedAt = now();
  emitSafely(
    writeLog,
    baseEntry({
      message,
      metadata,
      now: startedAt,
      event: "delivery_started",
      level: "info",
    }),
  );

  try {
    const result = await processMessage(message);
    const completedAt = now();
    emitSafely(writeLog, {
      ...baseEntry({
        message,
        metadata,
        now: completedAt,
        event: "delivery_completed",
        level: "info",
      }),
      durationMs: Math.max(0, completedAt - startedAt),
      processed: result.processed,
      requeued: result.requeued,
      jobStatus: result.status,
      ...(result.recoveryStatus
        ? { recoveryStatus: result.recoveryStatus }
        : {}),
    });
    return result;
  } catch (error) {
    const failedAt = now();
    const decision = catalogImageBulkQueueRetryDecision(
      error,
      metadata.deliveryCount,
    );
    const common = {
      durationMs: Math.max(0, failedAt - startedAt),
      errorCode: safeErrorCode(error),
    };
    if ("acknowledge" in decision) {
      emitSafely(writeLog, {
        ...baseEntry({
          message,
          metadata,
          now: failedAt,
          event: "delivery_discarded",
          level: "warning",
        }),
        ...common,
        acknowledged: true,
      });
    } else {
      const expiresInMs = remainingMilliseconds(metadata.expiresAt, failedAt);
      const expiring = expiresInMs <= decision.afterSeconds * 1000 + 1_000;
      emitSafely(writeLog, {
        ...baseEntry({
          message,
          metadata,
          now: failedAt,
          event: expiring ? "delivery_expiring" : "delivery_retry_scheduled",
          level: "error",
        }),
        ...common,
        retryAfterSeconds: decision.afterSeconds,
        acknowledged: false,
      });
    }
    throw error;
  }
}
