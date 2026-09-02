import { createHash } from "node:crypto";
import { send } from "@vercel/queue";
import type { Firestore } from "firebase-admin/firestore";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import {
  HOSTLY_CATALOG_IMAGE_BULK_POLICY,
  hasCatalogImageCapability,
  isCatalogImageCreditPeriodActive,
} from "@/lib/productos/catalog-image-plan";
import {
  controlCatalogImageBulkJob,
  processNextCatalogImageBulkItem,
  readCatalogImageBulkJob,
  reconcileCatalogImageBulkControlOperation,
} from "@/lib/server/product-images/catalog-image-bulk";
import { resolveCatalogImageAccess } from "@/lib/server/product-images/resolve-catalog-image-access";
import { reconcileExpiredCatalogImageCreditReservations } from "@/lib/server/product-images/reconcile-catalog-image-credits";

export const CATALOG_IMAGE_BULK_QUEUE_TOPIC = "catalog-image-bulk";

export type CatalogImageBulkQueueMessage = {
  restaurantId: string;
  jobId: string;
  kind?: "process";
};

export type CatalogImageBulkControlRecoveryQueueMessage = {
  restaurantId: string;
  jobId: string;
  kind: "control_recovery";
  operationId: string;
};

type EnqueueParams = CatalogImageBulkQueueMessage & {
  revision: number;
};

export class CatalogImageBulkQueueMessageError extends Error {
  readonly code = "INVALID_CATALOG_IMAGE_BULK_QUEUE_MESSAGE";

  constructor(message: string) {
    super(message);
    this.name = "CatalogImageBulkQueueMessageError";
  }
}

export class CatalogImageBulkQueueRetryError extends Error {
  readonly code = "CATALOG_IMAGE_BULK_QUEUE_RETRY_REQUIRED";

  constructor(jobId: string) {
    super(`El trabajo ${jobId} sigue activo y debe volver a intentarse`);
    this.name = "CatalogImageBulkQueueRetryError";
  }
}

export function catalogImageBulkQueueRetryDecision(
  error: unknown,
  deliveryCount: number,
): { acknowledge: true } | { afterSeconds: number } {
  const errorCode =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";
  if (
    error instanceof CatalogImageBulkQueueMessageError ||
    errorCode === "INVALID_CATALOG_IMAGE_BULK_QUEUE_MESSAGE" ||
    errorCode === "CATALOG_IMAGE_BULK_JOB_NOT_FOUND"
  ) {
    return { acknowledge: true };
  }
  return {
    afterSeconds: Math.min(60, Math.max(2, deliveryCount * 5)),
  };
}

function assertSimpleId(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (
    !normalized ||
    normalized.length > 128 ||
    normalized.includes("/") ||
    normalized.includes("..")
  ) {
    throw new CatalogImageBulkQueueMessageError(
      `INVALID_CATALOG_IMAGE_BULK_QUEUE_${label.toUpperCase()}`,
    );
  }
  return normalized;
}

function assertOperationId(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(normalized)) {
    throw new CatalogImageBulkQueueMessageError(
      "INVALID_CATALOG_IMAGE_BULK_QUEUE_OPERATION_ID",
    );
  }
  return normalized;
}

function queueIdempotencyKey(params: EnqueueParams): string {
  const digest = createHash("sha256")
    .update(`${params.restaurantId}\0${params.jobId}\0${params.revision}`)
    .digest("hex");
  return `catalog-image-bulk-${digest}`;
}

function controlRecoveryIdempotencyKey(params: {
  restaurantId: string;
  jobId: string;
  operationId: string;
}): string {
  const digest = createHash("sha256")
    .update(`${params.restaurantId}\0${params.jobId}\0${params.operationId}`)
    .digest("hex");
  return `catalog-image-bulk-control-${digest}`;
}

export async function enqueueCatalogImageBulkJob(
  params: EnqueueParams,
): Promise<void> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurant_id");
  const jobId = assertSimpleId(params.jobId, "job_id");
  await send(
    CATALOG_IMAGE_BULK_QUEUE_TOPIC,
    { restaurantId, jobId } satisfies CatalogImageBulkQueueMessage,
    {
      idempotencyKey: queueIdempotencyKey({
        restaurantId,
        jobId,
        revision: params.revision,
      }),
      retentionSeconds: 24 * 60 * 60,
    },
  );
}

export async function enqueueCatalogImageBulkControlRecovery(params: {
  restaurantId: string;
  jobId: string;
  operationId: string;
}): Promise<void> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurant_id");
  const jobId = assertSimpleId(params.jobId, "job_id");
  const operationId = assertOperationId(params.operationId);
  await send(
    CATALOG_IMAGE_BULK_QUEUE_TOPIC,
    {
      kind: "control_recovery",
      restaurantId,
      jobId,
      operationId,
    } satisfies CatalogImageBulkControlRecoveryQueueMessage,
    {
      idempotencyKey: controlRecoveryIdempotencyKey({
        restaurantId,
        jobId,
        operationId,
      }),
      retentionSeconds: 24 * 60 * 60,
      delaySeconds: Math.ceil(
        HOSTLY_CATALOG_IMAGE_BULK_POLICY.controlRecoveryDelayMs / 1000,
      ),
    },
  );
}

export type CatalogImageBulkQueueWorkerDependencies = {
  db?: Firestore;
  readJob?: typeof readCatalogImageBulkJob;
  resolveAccess?: typeof resolveCatalogImageAccess;
  processNext?: typeof processNextCatalogImageBulkItem;
  controlJob?: typeof controlCatalogImageBulkJob;
  enqueue?: typeof enqueueCatalogImageBulkJob;
  reconcileControl?: typeof reconcileCatalogImageBulkControlOperation;
  reconcileExpiredReservations?: typeof reconcileExpiredCatalogImageCreditReservations;
};

export async function processCatalogImageBulkQueueMessage(
  message: unknown,
  dependencies?: CatalogImageBulkQueueWorkerDependencies,
): Promise<{ processed: boolean; requeued: boolean; status: string }> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new CatalogImageBulkQueueMessageError(
      "INVALID_CATALOG_IMAGE_BULK_QUEUE_MESSAGE",
    );
  }
  const raw = message as Record<string, unknown>;
  const restaurantId = assertSimpleId(raw.restaurantId, "restaurant_id");
  const jobId = assertSimpleId(raw.jobId, "job_id");
  const kind = raw.kind ?? "process";
  if (kind !== "process" && kind !== "control_recovery") {
    throw new CatalogImageBulkQueueMessageError(
      "INVALID_CATALOG_IMAGE_BULK_QUEUE_KIND",
    );
  }
  const db = dependencies?.db ?? getHostlyFirestore();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");

  if (kind === "control_recovery") {
    const operationId = assertOperationId(raw.operationId);
    const reconcileControl =
      dependencies?.reconcileControl ??
      reconcileCatalogImageBulkControlOperation;
    const recovery = await reconcileControl({
      db,
      restaurantId,
      jobId,
      operationId,
    });
    if (recovery.status === "pending") {
      throw new CatalogImageBulkQueueRetryError(jobId);
    }
    const shouldContinue =
      (recovery.job.status === "queued" || recovery.job.status === "running") &&
      recovery.job.counters.pending > 0;
    if (shouldContinue) {
      const enqueue = dependencies?.enqueue ?? enqueueCatalogImageBulkJob;
      await enqueue({
        restaurantId,
        jobId,
        revision: recovery.job.queueRevision,
      });
    }
    return {
      processed: false,
      requeued: shouldContinue,
      status: recovery.job.status,
    };
  }

  const readJob = dependencies?.readJob ?? readCatalogImageBulkJob;
  const current = await readJob({ db, restaurantId, jobId });
  if (
    current.job.status === "paused" ||
    current.job.status === "completed" ||
    current.job.status === "cancelled" ||
    current.job.status === "failed"
  ) {
    return { processed: false, requeued: false, status: current.job.status };
  }

  const resolveAccess = dependencies?.resolveAccess ?? resolveCatalogImageAccess;
  const access = await resolveAccess({ db, restaurantId });
  const reconcileExpiredReservations = dependencies
    ? dependencies.reconcileExpiredReservations
    : reconcileExpiredCatalogImageCreditReservations;
  if (access.meteringMode === "credit_balance" && reconcileExpiredReservations) {
    await reconcileExpiredReservations({
      db,
      restaurantId,
      actorId: current.job.createdBy,
    }).catch((error) => {
      console.error("[catalog-image-credits/reconcile-before-bulk]", {
        message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
    });
  }
  if (
    !hasCatalogImageCapability(access, "catalog.image.ai.bulk") ||
    !isCatalogImageCreditPeriodActive(access)
  ) {
    const controlJob = dependencies?.controlJob ?? controlCatalogImageBulkJob;
    const paused = await controlJob({
      db,
      restaurantId,
      jobId,
      action: "pause",
    });
    return { processed: false, requeued: false, status: paused.status };
  }

  const processNext = dependencies?.processNext ?? processNextCatalogImageBulkItem;
  const result = await processNext({
    db,
    restaurantId,
    jobId,
    userId: current.job.createdBy,
    access,
  });
  const requiresRetry =
    !result.processed &&
    (result.job.status === "queued" || result.job.status === "running") &&
    (result.job.counters.pending > 0 || result.job.counters.processing > 0);
  if (requiresRetry) {
    throw new CatalogImageBulkQueueRetryError(jobId);
  }
  const shouldContinue =
    result.processed &&
    (result.job.status === "queued" || result.job.status === "running") &&
    result.job.counters.pending > 0;
  if (shouldContinue) {
    const enqueue = dependencies?.enqueue ?? enqueueCatalogImageBulkJob;
    await enqueue({
      restaurantId,
      jobId,
      revision: result.job.queueRevision,
    });
  }
  return {
    processed: result.processed,
    requeued: shouldContinue,
    status: result.job.status,
  };
}
