import { createHash } from "node:crypto";
import { send } from "@vercel/queue";
import type { Firestore } from "firebase-admin/firestore";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import {
  hasCatalogImageCapability,
  isCatalogImageCreditPeriodActive,
} from "@/lib/productos/catalog-image-plan";
import {
  controlCatalogImageBulkJob,
  processNextCatalogImageBulkItem,
  readCatalogImageBulkJob,
} from "@/lib/server/product-images/catalog-image-bulk";
import { resolveCatalogImageAccess } from "@/lib/server/product-images/resolve-catalog-image-access";
import { reconcileExpiredCatalogImageCreditReservations } from "@/lib/server/product-images/reconcile-catalog-image-credits";

export const CATALOG_IMAGE_BULK_QUEUE_TOPIC = "catalog-image-bulk";

export type CatalogImageBulkQueueMessage = {
  restaurantId: string;
  jobId: string;
};

type EnqueueParams = CatalogImageBulkQueueMessage & {
  revision: number;
};

function assertSimpleId(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (
    !normalized ||
    normalized.length > 128 ||
    normalized.includes("/") ||
    normalized.includes("..")
  ) {
    throw new Error(`INVALID_CATALOG_IMAGE_BULK_QUEUE_${label.toUpperCase()}`);
  }
  return normalized;
}

function queueIdempotencyKey(params: EnqueueParams): string {
  const digest = createHash("sha256")
    .update(`${params.restaurantId}\0${params.jobId}\0${params.revision}`)
    .digest("hex");
  return `catalog-image-bulk-${digest}`;
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

export type CatalogImageBulkQueueWorkerDependencies = {
  db?: Firestore;
  readJob?: typeof readCatalogImageBulkJob;
  resolveAccess?: typeof resolveCatalogImageAccess;
  processNext?: typeof processNextCatalogImageBulkItem;
  controlJob?: typeof controlCatalogImageBulkJob;
  enqueue?: typeof enqueueCatalogImageBulkJob;
  reconcileExpiredReservations?: typeof reconcileExpiredCatalogImageCreditReservations;
};

export async function processCatalogImageBulkQueueMessage(
  message: unknown,
  dependencies?: CatalogImageBulkQueueWorkerDependencies,
): Promise<{ processed: boolean; requeued: boolean; status: string }> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("INVALID_CATALOG_IMAGE_BULK_QUEUE_MESSAGE");
  }
  const raw = message as Record<string, unknown>;
  const restaurantId = assertSimpleId(raw.restaurantId, "restaurant_id");
  const jobId = assertSimpleId(raw.jobId, "job_id");
  const db = dependencies?.db ?? getHostlyFirestore();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");

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
