import { createHash, randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  readProductImageEnrichment,
} from "@/lib/carta/product-image-enrichment";
import {
  HOSTLY_CATALOG_IMAGE_BULK_POLICY,
  isCatalogImageCreditPeriodActive,
  type CatalogImageAccess,
} from "@/lib/productos/catalog-image-plan";
import type {
  CatalogImageBulkEstimate,
  CatalogImageBulkCatalogCandidate,
  CatalogImageBulkItemKind,
  CatalogImageBulkItemStatus,
  CatalogImageBulkJob,
  CatalogImageBulkJobCounters,
  CatalogImageBulkJobItem,
  CatalogImageBulkJobStatus,
  CatalogImageBulkPreflight,
  CatalogImageBulkSummary,
} from "@/lib/productos/catalog-image-bulk-contract";
import {
  evaluateImportedProductImageEligibility,
  generateImportedProductImage,
  type GenerateImportedProductImageResult,
} from "@/lib/server/product-images/generate-imported-product-image";
import {
  searchCatalogProductImages,
} from "@/lib/server/product-images/search-catalog-product-images";
import { classifyProductImageContentStrategy } from "@/lib/server/product-images/product-image-content-strategy";
import {
  finalizeCatalogImageOperation,
  reserveCatalogImageOperation,
} from "@/lib/server/product-images/meter-catalog-image-operation";

const JOBS_COLLECTION = "catalogImageJobs";
const JOB_ITEMS_COLLECTION = "items";
const JOB_CONTROLS_COLLECTION = "catalogImageJobControls";
const ACTIVE_JOB_CONTROL_ID = "active";
const JOB_SCHEMA_VERSION = 1;
const WRITE_BATCH_SIZE = 400;

const ACTIVE_JOB_STATUSES = new Set<CatalogImageBulkJobStatus>([
  "preparing",
  "queued",
  "running",
  "paused",
]);

type FirestoreProduct = {
  id: string;
  data: Record<string, unknown>;
};

type BulkClassifiedProduct = {
  productId: string;
  productName: string;
  kind: CatalogImageBulkItemKind;
  status: CatalogImageBulkItemStatus;
  imageUrl?: string | null;
};

type StoredJobLease = {
  requestId: string;
  productId: string;
  expiresAt: number;
};

export class CatalogImageBulkError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "CatalogImageBulkError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function assertSimpleId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("..")) {
    throw new CatalogImageBulkError(
      "INVALID_CATALOG_IMAGE_BULK_ID",
      `${label} inválido`,
      400,
    );
  }
  return trimmed;
}

function assertIdempotencyKey(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(trimmed)) {
    throw new CatalogImageBulkError(
      "INVALID_BULK_IDEMPOTENCY_KEY",
      "Identificador idempotente inválido",
      400,
    );
  }
  return trimmed;
}

function itemIdempotencyKey(
  jobId: string,
  productId: string,
  attempt: number,
): string {
  const digest = createHash("sha256").update(productId).digest("hex").slice(0, 32);
  return `${jobId}_${digest}_${attempt}`.slice(0, 120);
}

function readString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

function readFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function hasActiveLock(value: unknown, now: number, ttlMs: number): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  const requestId = typeof raw.requestId === "string" ? raw.requestId.trim() : "";
  const startedAt = readFiniteNumber(raw.startedAt, -1);
  return Boolean(requestId && startedAt >= 0 && now - startedAt < ttlMs);
}

export function classifyCatalogImageBulkProduct(
  productId: string,
  data: Record<string, unknown>,
  now = Date.now(),
): BulkClassifiedProduct {
  const normalizedId = assertSimpleId(productId, "productId");
  const productName = readString(data, "name") || normalizedId;
  const imageUrl = readString(data, "imageUrl");
  const imagePath = readString(data, "imagePath");
  const enrichment = readProductImageEnrichment(data.imageEnrichment);
  const hasImage = Boolean(imageUrl || imagePath);

  if (hasImage) {
    if (
      enrichment &&
      enrichment.source !== "manual" &&
      enrichment.reviewStatus === "pending" &&
      enrichment.locked === false
    ) {
      return {
        productId: normalizedId,
        productName,
        kind: "pending_review",
        status: "needs_review",
      };
    }
    const replaceableRejectedAutomatic = Boolean(
      enrichment &&
        enrichment.source !== "manual" &&
        enrichment.reviewStatus === "rejected" &&
        enrichment.locked === false,
    );
    if (!replaceableRejectedAutomatic) {
      return {
        productId: normalizedId,
        productName,
        kind: "existing_image",
        status: "skipped",
      };
    }
  }

  if (
    hasActiveLock(data.imageGenerationInProgress, now, 3 * 60 * 1000) ||
    hasActiveLock(data.catalogImageAttachInProgress, now, 2 * 60 * 1000)
  ) {
    return {
      productId: normalizedId,
      productName,
      kind: "already_processing",
      status: "skipped",
    };
  }

  const strategy = classifyProductImageContentStrategy(data);
  if (strategy === "catalog_search") {
    return {
      productId: normalizedId,
      productName,
      kind: "catalog_search",
      status: "pending",
    };
  }

  if (strategy === "manual_review") {
    return {
      productId: normalizedId,
      productName,
      kind: "manual_review",
      status: "needs_review",
    };
  }

  const eligibility = evaluateImportedProductImageEligibility(data);
  if (eligibility.eligible) {
    return {
      productId: normalizedId,
      productName,
      kind: "ai_generate",
      status: "pending",
    };
  }

  return {
    productId: normalizedId,
    productName,
    kind: "manual_review",
    status: "needs_review",
  };
}

function emptySummary(totalProducts: number): CatalogImageBulkSummary {
  return {
    totalProducts,
    withoutApprovedImage: 0,
    aiGenerable: 0,
    catalogSearchable: 0,
    manualReview: 0,
    pendingReview: 0,
    alreadyProcessing: 0,
    existingImage: 0,
  };
}

function summarizeClassifications(
  products: FirestoreProduct[],
  now = Date.now(),
): { summary: CatalogImageBulkSummary; classified: BulkClassifiedProduct[] } {
  const summary = emptySummary(products.length);
  const classified = products.map((product) =>
    ({
      ...classifyCatalogImageBulkProduct(product.id, product.data, now),
      imageUrl: readString(product.data, "imageUrl") || null,
    }),
  );
  for (const item of classified) {
    switch (item.kind) {
      case "ai_generate":
        summary.aiGenerable += 1;
        summary.withoutApprovedImage += 1;
        break;
      case "catalog_search":
        summary.catalogSearchable += 1;
        summary.withoutApprovedImage += 1;
        break;
      case "manual_review":
        summary.manualReview += 1;
        summary.withoutApprovedImage += 1;
        break;
      case "pending_review":
        summary.pendingReview += 1;
        summary.withoutApprovedImage += 1;
        break;
      case "already_processing":
        summary.alreadyProcessing += 1;
        summary.withoutApprovedImage += 1;
        break;
      case "existing_image":
        summary.existingImage += 1;
        break;
    }
  }
  return { summary, classified };
}

function estimateFromSummary(
  summary: CatalogImageBulkSummary,
  access: CatalogImageAccess,
): CatalogImageBulkEstimate {
  const aiCredits = access.creditCosts.aiBulk;
  const catalogCredits = access.creditCosts.catalogSearch;
  const availableBalance = access.creditBalance;
  if (access.meteringMode === "usage_recorded") {
    return {
      aiGenerationRequests: summary.aiGenerable,
      catalogSearchRequests: summary.catalogSearchable,
      credits: null,
      costUsd: null,
      mode: "usage_recorded",
      note:
        "Hostly registrará cada uso completado. Este restaurante aún no tiene un saldo de créditos configurado.",
    };
  }
  if (!isCatalogImageCreditPeriodActive(access)) {
    return {
      aiGenerationRequests: summary.aiGenerable,
      catalogSearchRequests: summary.catalogSearchable,
      credits: null,
      costUsd: null,
      mode: "credit_balance",
      note: "El periodo de créditos no está activo. Hostly no iniciará operaciones con coste.",
    };
  }
  const complete =
    availableBalance != null &&
    (summary.aiGenerable === 0 || aiCredits != null) &&
    (summary.catalogSearchable === 0 || catalogCredits != null);
  const estimatedCredits = complete
    ? summary.aiGenerable * (aiCredits ?? 0) +
      summary.catalogSearchable * (catalogCredits ?? 0)
    : null;
  return {
    aiGenerationRequests: summary.aiGenerable,
    catalogSearchRequests: summary.catalogSearchable,
    credits: estimatedCredits,
    costUsd: null,
    mode: "credit_balance",
    note:
      complete && estimatedCredits != null && availableBalance != null
      ? estimatedCredits > availableBalance
        ? `El catálogo necesita hasta ${estimatedCredits} créditos y el saldo actual es ${availableBalance}; el proceso se detendrá al agotarse.`
        : `Estimación sobre el saldo actual de ${availableBalance} créditos; solo se consumen operaciones completadas.`
      : "La configuración de créditos está incompleta para las operaciones detectadas.",
  };
}

async function readTenantProducts(
  db: Firestore,
  restaurantId: string,
): Promise<FirestoreProduct[]> {
  const snapshot = await db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("products")
    .get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as Record<string, unknown>,
  }));
}

export async function analyzeCatalogImageBulk(params: {
  db: Firestore;
  restaurantId: string;
  access: CatalogImageAccess;
}): Promise<CatalogImageBulkPreflight & { classified: BulkClassifiedProduct[] }> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const products = await readTenantProducts(params.db, restaurantId);
  const { summary, classified } = summarizeClassifications(products);
  return {
    summary,
    estimate: estimateFromSummary(summary, params.access),
    access: params.access,
    classified,
  };
}

function countersFromClassifications(
  classified: BulkClassifiedProduct[],
): CatalogImageBulkJobCounters {
  const included = classified.filter((item) => item.kind !== "existing_image");
  return {
    total: included.length,
    pending: included.filter((item) => item.status === "pending").length,
    processing: 0,
    completed: 0,
    needsReview: included.filter((item) => item.status === "needs_review").length,
    failed: 0,
    skipped: included.filter((item) => item.status === "skipped").length,
    cancelled: 0,
  };
}

function jobRef(db: Firestore, restaurantId: string, jobId: string) {
  return db
    .collection("restaurants")
    .doc(restaurantId)
    .collection(JOBS_COLLECTION)
    .doc(jobId);
}

function activeJobControlRef(db: Firestore, restaurantId: string) {
  return db
    .collection("restaurants")
    .doc(restaurantId)
    .collection(JOB_CONTROLS_COLLECTION)
    .doc(ACTIVE_JOB_CONTROL_ID);
}

function isActiveJobStatus(status: CatalogImageBulkJobStatus): boolean {
  return ACTIVE_JOB_STATUSES.has(status);
}

async function readLegacyActiveJobId(params: {
  db: Firestore;
  restaurantId: string;
}): Promise<string | null> {
  const jobs = params.db
    .collection("restaurants")
    .doc(params.restaurantId)
    .collection(JOBS_COLLECTION);
  const snapshots = await Promise.all(
    [...ACTIVE_JOB_STATUSES].map((status) =>
      jobs.where("status", "==", status).limit(1).get(),
    ),
  );
  return snapshots.find((snapshot) => !snapshot.empty)?.docs[0]?.id ?? null;
}

function activeJobControlData(params: {
  restaurantId: string;
  jobId: string;
  now: number;
}) {
  return {
    schemaVersion: JOB_SCHEMA_VERSION,
    restaurantId: params.restaurantId,
    activeJobId: params.jobId,
    updatedAt: params.now,
  };
}

function jobStatus(value: unknown): CatalogImageBulkJobStatus {
  return value === "preparing" ||
    value === "queued" ||
    value === "running" ||
    value === "paused" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "failed"
    ? value
    : "failed";
}

function readSummary(value: unknown): CatalogImageBulkSummary {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    totalProducts: readFiniteNumber(raw.totalProducts),
    withoutApprovedImage: readFiniteNumber(raw.withoutApprovedImage),
    aiGenerable: readFiniteNumber(raw.aiGenerable),
    catalogSearchable: readFiniteNumber(raw.catalogSearchable),
    manualReview: readFiniteNumber(raw.manualReview),
    pendingReview: readFiniteNumber(raw.pendingReview),
    alreadyProcessing: readFiniteNumber(raw.alreadyProcessing),
    existingImage: readFiniteNumber(raw.existingImage),
  };
}

function readEstimate(value: unknown): CatalogImageBulkEstimate {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    aiGenerationRequests: readFiniteNumber(raw.aiGenerationRequests),
    catalogSearchRequests: readFiniteNumber(raw.catalogSearchRequests),
    credits: typeof raw.credits === "number" ? raw.credits : null,
    costUsd: typeof raw.costUsd === "number" ? raw.costUsd : null,
    mode: raw.mode === "credit_balance" ? "credit_balance" : "usage_recorded",
    note:
      typeof raw.note === "string" && raw.note.trim()
        ? raw.note.trim()
        : "Uso registrado sin tarifa configurada.",
  };
}

function readCounters(value: unknown): CatalogImageBulkJobCounters {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    total: readFiniteNumber(raw.total),
    pending: readFiniteNumber(raw.pending),
    processing: readFiniteNumber(raw.processing),
    completed: readFiniteNumber(raw.completed),
    needsReview: readFiniteNumber(raw.needsReview),
    failed: readFiniteNumber(raw.failed),
    skipped: readFiniteNumber(raw.skipped),
    cancelled: readFiniteNumber(raw.cancelled),
  };
}

function deserializeJob(jobId: string, data: Record<string, unknown>): CatalogImageBulkJob {
  return {
    jobId,
    status: jobStatus(data.status),
    createdAt: readFiniteNumber(data.createdAt),
    updatedAt: readFiniteNumber(data.updatedAt),
    createdBy: readString(data, "createdBy"),
    summary: readSummary(data.summary),
    estimate: readEstimate(data.estimate),
    counters: readCounters(data.counters),
    activeProductId: readString(data, "activeProductId") || null,
    failureReason: readString(data, "failureReason") || null,
  };
}

function deserializeItem(
  productId: string,
  data: Record<string, unknown>,
): CatalogImageBulkJobItem {
  const kind = data.kind as CatalogImageBulkItemKind;
  const status = data.status as CatalogImageBulkItemStatus;
  return {
    productId,
    productName: readString(data, "productName") || productId,
    kind,
    status,
    attempts: readFiniteNumber(data.attempts),
    imageUrl: readString(data, "imageUrl") || null,
    candidateCount: readFiniteNumber(data.candidateCount),
    catalogCandidates: readCatalogCandidates(data.catalogCandidates),
    failureReason: readString(data, "failureReason") || null,
    reviewStatus:
      data.reviewStatus === "pending" || data.reviewStatus === "approved"
        ? data.reviewStatus
        : null,
  };
}

function readCatalogCandidates(value: unknown): CatalogImageBulkCatalogCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const raw = entry as Record<string, unknown>;
    const externalReference = readString(raw, "externalReference");
    const productName = readString(raw, "productName");
    const thumbnailUrl = readString(raw, "thumbnailUrl");
    const confidence = readFiniteNumber(raw.confidence, -1);
    const matchLevel = raw.matchLevel;
    if (
      !externalReference ||
      !productName ||
      !thumbnailUrl ||
      confidence < 0 ||
      (matchLevel !== "strong" && matchLevel !== "review")
    ) {
      return [];
    }
    return [
      {
        externalReference,
        productName,
        brand: readString(raw, "brand") || null,
        quantity: readString(raw, "quantity") || null,
        thumbnailUrl,
        sourceUrl:
          readString(raw, "sourceUrl") ||
          `https://world.openfoodfacts.org/product/${encodeURIComponent(externalReference)}`,
        confidence,
        matchLevel,
        warnings: Array.isArray(raw.warnings)
          ? raw.warnings.filter(
              (warning): warning is string =>
                typeof warning === "string" && Boolean(warning.trim()),
            )
          : [],
        license: readString(raw, "license") || "CC BY-SA 3.0",
        attribution:
          readString(raw, "attribution") || "Open Food Facts contributors",
      },
    ];
  });
}

export async function createCatalogImageBulkJob(params: {
  db: Firestore;
  restaurantId: string;
  userId: string;
  idempotencyKey: string;
  access: CatalogImageAccess;
}): Promise<CatalogImageBulkJob> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const userId = params.userId.trim();
  if (!userId) {
    throw new CatalogImageBulkError("UNAUTHORIZED", "Usuario requerido", 401);
  }
  const jobId = assertIdempotencyKey(params.idempotencyKey);
  const requestedRef = jobRef(params.db, restaurantId, jobId);
  const controlRef = activeJobControlRef(params.db, restaurantId);
  const existingControl = await controlRef.get();
  const legacyActiveJobId = existingControl.exists
    ? null
    : await readLegacyActiveJobId({
        db: params.db,
        restaurantId,
      });
  const now = Date.now();

  const acquired = await params.db.runTransaction(async (transaction) => {
    const [requestedSnapshot, controlSnapshot] = await Promise.all([
      transaction.get(requestedRef),
      transaction.get(controlRef),
    ]);
    const requestedJob = requestedSnapshot.exists
      ? deserializeJob(
          jobId,
          requestedSnapshot.data() as Record<string, unknown>,
        )
      : null;
    const controlData = controlSnapshot.exists
      ? (controlSnapshot.data() as Record<string, unknown>)
      : null;
    const controlledJobId = controlData
      ? readString(controlData, "activeJobId")
      : "";
    const candidateActiveJobId = controlledJobId || legacyActiveJobId || "";
    const candidateActiveRef = candidateActiveJobId
      ? jobRef(params.db, restaurantId, candidateActiveJobId)
      : null;
    const candidateActiveSnapshot =
      candidateActiveJobId === jobId
        ? requestedSnapshot
        : candidateActiveRef
          ? await transaction.get(candidateActiveRef)
          : null;
    const candidateActiveJob =
      candidateActiveSnapshot?.exists && candidateActiveJobId
        ? deserializeJob(
            candidateActiveJobId,
            candidateActiveSnapshot.data() as Record<string, unknown>,
          )
        : null;

    if (requestedJob && requestedJob.status !== "preparing") {
      return {
        prepare: false as const,
        job: requestedJob,
      };
    }

    if (candidateActiveJob && isActiveJobStatus(candidateActiveJob.status)) {
      transaction.set(
        controlRef,
        activeJobControlData({
          restaurantId,
          jobId: candidateActiveJob.jobId,
          now,
        }),
      );
      const preparationLeaseExpiresAt = readFiniteNumber(
        candidateActiveSnapshot?.get("preparationLeaseExpiresAt"),
        candidateActiveJob.updatedAt +
          HOSTLY_CATALOG_IMAGE_BULK_POLICY.preparationLeaseMs,
      );
      if (
        candidateActiveJob.status === "preparing" &&
        preparationLeaseExpiresAt <= now &&
        candidateActiveRef
      ) {
        transaction.update(candidateActiveRef, {
          preparationLeaseExpiresAt:
            now + HOSTLY_CATALOG_IMAGE_BULK_POLICY.preparationLeaseMs,
          recoveredAt: now,
          recoveredBy: userId,
          updatedAt: now,
        });
        return {
          prepare: true as const,
          jobId: candidateActiveJob.jobId,
        };
      }
      return {
        prepare: false as const,
        job: candidateActiveJob,
      };
    }

    transaction.set(
      controlRef,
      activeJobControlData({ restaurantId, jobId, now }),
    );
    if (requestedJob) {
      transaction.update(requestedRef, {
        preparationLeaseExpiresAt:
          now + HOSTLY_CATALOG_IMAGE_BULK_POLICY.preparationLeaseMs,
        recoveredAt: now,
        recoveredBy: userId,
        updatedAt: now,
      });
      return {
        prepare: true as const,
        jobId,
      };
    }

    transaction.create(requestedRef, {
      schemaVersion: JOB_SCHEMA_VERSION,
      restaurantId,
      jobId,
      status: "preparing",
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      effectivePlan: params.access.effectivePlan,
      planSource: params.access.source,
      capability: "catalog.image.ai.bulk",
      confirmedAt: now,
      preparationLeaseExpiresAt:
        now + HOSTLY_CATALOG_IMAGE_BULK_POLICY.preparationLeaseMs,
      counters: {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        needsReview: 0,
        failed: 0,
        skipped: 0,
        cancelled: 0,
      },
    });
    return { prepare: true as const, jobId };
  });

  if (!acquired.prepare) {
    return acquired.job;
  }

  const activeJobId = acquired.jobId;
  const ref = jobRef(params.db, restaurantId, activeJobId);

  try {
    const analysis = await analyzeCatalogImageBulk({
      db: params.db,
      restaurantId,
      access: params.access,
    });
    const included = analysis.classified.filter(
      (item) => item.kind !== "existing_image",
    );
    const counters = countersFromClassifications(analysis.classified);

    for (let offset = 0; offset < included.length; offset += WRITE_BATCH_SIZE) {
      const batch = params.db.batch();
      for (const item of included.slice(offset, offset + WRITE_BATCH_SIZE)) {
        batch.set(ref.collection(JOB_ITEMS_COLLECTION).doc(item.productId), {
          schemaVersion: JOB_SCHEMA_VERSION,
          restaurantId,
          jobId: activeJobId,
          productId: item.productId,
          productName: item.productName,
          kind: item.kind,
          status: item.status,
          attempts: 0,
          ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
          ...(item.kind === "pending_review"
            ? { reviewStatus: "pending" }
            : {}),
          createdAt: now,
          updatedAt: now,
        });
      }
      await batch.commit();
    }

    const status: CatalogImageBulkJobStatus =
      counters.pending > 0 ? "queued" : "completed";
    await ref.update({
      status,
      summary: analysis.summary,
      estimate: analysis.estimate,
      counters,
      preparationLeaseExpiresAt: FieldValue.delete(),
      updatedAt: Date.now(),
      ...(status === "completed" ? { completedAt: Date.now() } : {}),
    });
    const snapshot = await ref.get();
    return deserializeJob(
      activeJobId,
      snapshot.data() as Record<string, unknown>,
    );
  } catch (error) {
    const failureReason = errorCode(error, "BULK_JOB_PREPARATION_FAILED");
    await ref.update({
      status: "failed",
      failureReason,
      preparationLeaseExpiresAt: FieldValue.delete(),
      updatedAt: Date.now(),
      completedAt: Date.now(),
    });
    throw error;
  }
}

export async function readCatalogImageBulkJob(params: {
  db: Firestore;
  restaurantId: string;
  jobId: string;
}): Promise<{ job: CatalogImageBulkJob; items: CatalogImageBulkJobItem[] }> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const jobId = assertIdempotencyKey(params.jobId);
  const ref = jobRef(params.db, restaurantId, jobId);
  const [jobSnapshot, itemsSnapshot] = await Promise.all([
    ref.get(),
    ref.collection(JOB_ITEMS_COLLECTION).orderBy("createdAt", "asc").get(),
  ]);
  if (!jobSnapshot.exists) {
    throw new CatalogImageBulkError(
      "CATALOG_IMAGE_BULK_JOB_NOT_FOUND",
      "Trabajo masivo no encontrado",
      404,
    );
  }
  return {
    job: deserializeJob(jobId, jobSnapshot.data() as Record<string, unknown>),
    items: itemsSnapshot.docs.map((doc) =>
      deserializeItem(doc.id, doc.data() as Record<string, unknown>),
    ),
  };
}

export async function readLatestCatalogImageBulkJob(params: {
  db: Firestore;
  restaurantId: string;
}): Promise<{ job: CatalogImageBulkJob; items: CatalogImageBulkJobItem[] } | null> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const snapshot = await params.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection(JOBS_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  return readCatalogImageBulkJob({
    db: params.db,
    restaurantId,
    jobId: snapshot.docs[0].id,
  });
}

function readLease(value: unknown): StoredJobLease | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const requestId = typeof raw.requestId === "string" ? raw.requestId.trim() : "";
  const productId = typeof raw.productId === "string" ? raw.productId.trim() : "";
  const expiresAt = readFiniteNumber(raw.expiresAt, -1);
  return requestId && productId && expiresAt >= 0
    ? { requestId, productId, expiresAt }
    : null;
}

type ClaimedItem = {
  requestId: string;
  productId: string;
  productName: string;
  kind: CatalogImageBulkItemKind;
  attempts: number;
};

async function claimNextItem(params: {
  db: Firestore;
  restaurantId: string;
  jobId: string;
}): Promise<ClaimedItem | null> {
  const ref = jobRef(params.db, params.restaurantId, params.jobId);
  const now = Date.now();
  const requestId = randomUUID();
  return params.db.runTransaction(async (transaction) => {
    const jobSnapshot = await transaction.get(ref);
    if (!jobSnapshot.exists) {
      throw new CatalogImageBulkError(
        "CATALOG_IMAGE_BULK_JOB_NOT_FOUND",
        "Trabajo masivo no encontrado",
        404,
      );
    }
    const jobData = jobSnapshot.data() as Record<string, unknown>;
    const status = jobStatus(jobData.status);
    if (["paused", "completed", "cancelled", "failed"].includes(status)) {
      return null;
    }
    const counters = readCounters(jobData.counters);
    const lease = readLease(jobData.processingLease);
    if (lease && lease.expiresAt > now) return null;
    if (
      !lease &&
      counters.processing >=
        HOSTLY_CATALOG_IMAGE_BULK_POLICY.maxConcurrentItemsPerJob
    ) {
      return null;
    }

    let itemSnapshot = null as FirebaseFirestore.DocumentSnapshot | null;
    if (lease?.productId) {
      const stale = await transaction.get(
        ref.collection(JOB_ITEMS_COLLECTION).doc(lease.productId),
      );
      if (stale.exists && stale.get("status") === "processing") {
        itemSnapshot = stale;
      }
    }
    if (!itemSnapshot) {
      const pendingSnapshot = await transaction.get(
        ref
          .collection(JOB_ITEMS_COLLECTION)
          .where("status", "==", "pending")
          .limit(1),
      );
      itemSnapshot = pendingSnapshot.empty ? null : pendingSnapshot.docs[0];
    }

    if (!itemSnapshot) {
      if (counters.processing === 0 && counters.pending === 0) {
        transaction.update(ref, {
          status: "completed",
          activeProductId: FieldValue.delete(),
          processingLease: FieldValue.delete(),
          updatedAt: now,
          completedAt: now,
        });
      }
      return null;
    }

    const itemData = itemSnapshot.data() as Record<string, unknown>;
    const wasPending = itemData.status === "pending";
    const attempts = readFiniteNumber(itemData.attempts) + 1;
    const expiresAt = now + HOSTLY_CATALOG_IMAGE_BULK_POLICY.leaseDurationMs;
    transaction.update(itemSnapshot.ref, {
      status: "processing",
      attempts,
      leaseRequestId: requestId,
      leaseExpiresAt: expiresAt,
      updatedAt: now,
    });
    transaction.update(ref, {
      status: "running",
      activeProductId: itemSnapshot.id,
      processingLease: { requestId, productId: itemSnapshot.id, expiresAt },
      counters: {
        ...counters,
        pending: wasPending ? Math.max(0, counters.pending - 1) : counters.pending,
        processing: wasPending ? counters.processing + 1 : counters.processing,
      },
      updatedAt: now,
    });
    return {
      requestId,
      productId: itemSnapshot.id,
      productName: readString(itemData, "productName") || itemSnapshot.id,
      kind: itemData.kind as CatalogImageBulkItemKind,
      attempts,
    };
  });
}

function errorCode(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.trim()
  ) {
    return error.code.trim().slice(0, 160);
  }
  return fallback;
}

async function finalizeClaim(params: {
  db: Firestore;
  restaurantId: string;
  jobId: string;
  claim: ClaimedItem;
  status: "completed" | "needs_review" | "skipped" | "failed";
  imageUrl?: string;
  failureReason?: string;
  candidateCount?: number;
  catalogCandidates?: CatalogImageBulkCatalogCandidate[];
}) {
  const ref = jobRef(params.db, params.restaurantId, params.jobId);
  const itemRef = ref.collection(JOB_ITEMS_COLLECTION).doc(params.claim.productId);
  const now = Date.now();
  await params.db.runTransaction(async (transaction) => {
    const [jobSnapshot, itemSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(itemRef),
    ]);
    if (!jobSnapshot.exists || !itemSnapshot.exists) return;
    const jobData = jobSnapshot.data() as Record<string, unknown>;
    const lease = readLease(jobData.processingLease);
    if (
      !lease ||
      lease.requestId !== params.claim.requestId ||
      lease.productId !== params.claim.productId
    ) {
      return;
    }
    const counters = readCounters(jobData.counters);
    const nextCounters = {
      ...counters,
      processing: Math.max(0, counters.processing - 1),
      completed: counters.completed + (params.status === "completed" ? 1 : 0),
      needsReview:
        counters.needsReview + (params.status === "needs_review" ? 1 : 0),
      failed: counters.failed + (params.status === "failed" ? 1 : 0),
      skipped: counters.skipped + (params.status === "skipped" ? 1 : 0),
    };
    const finished = nextCounters.pending === 0 && nextCounters.processing === 0;
    const nextStatus: CatalogImageBulkJobStatus = finished
      ? "completed"
      : jobStatus(jobData.status) === "paused"
        ? "paused"
        : "running";
    transaction.update(itemRef, {
      status: params.status,
      imageUrl: params.imageUrl || FieldValue.delete(),
      failureReason: params.failureReason || FieldValue.delete(),
      candidateCount:
        params.candidateCount == null
          ? FieldValue.delete()
          : params.candidateCount,
      catalogCandidates:
        params.catalogCandidates == null
          ? FieldValue.delete()
          : params.catalogCandidates,
      ...(params.status === "needs_review" &&
      (params.claim.kind === "ai_generate" ||
        params.claim.kind === "pending_review")
        ? { reviewStatus: "pending" }
        : {}),
      leaseRequestId: FieldValue.delete(),
      leaseExpiresAt: FieldValue.delete(),
      updatedAt: now,
      completedAt: now,
    });
    transaction.update(ref, {
      status: nextStatus,
      counters: nextCounters,
      activeProductId: FieldValue.delete(),
      processingLease: FieldValue.delete(),
      updatedAt: now,
      ...(finished ? { completedAt: now } : {}),
    });
  });
}

async function reserveCatalogSearchUsage(params: {
  db: Firestore;
  restaurantId: string;
  jobId: string;
  productId: string;
  attempt: number;
  userId: string;
}) {
  const idempotencyKey = itemIdempotencyKey(
    params.jobId,
    params.productId,
    params.attempt,
  );
  return reserveCatalogImageOperation({
    db: params.db,
    restaurantId: params.restaurantId,
    productId: params.productId,
    userId: params.userId,
    idempotencyKey,
    capability: "catalog.image.catalogSearch",
    operation: "catalog_image_catalog_search_bulk",
    provider: "open_food_facts",
    jobId: params.jobId,
  });
}

async function finalizeCatalogSearchUsage(params: {
  db: Firestore;
  restaurantId: string;
  jobId: string;
  productId: string;
  attempt: number;
  result: "candidates" | "not_found" | "failed";
  candidateCount?: number;
  failureReason?: string;
}) {
  const idempotencyKey = itemIdempotencyKey(
    params.jobId,
    params.productId,
    params.attempt,
  );
  await finalizeCatalogImageOperation({
    db: params.db,
    restaurantId: params.restaurantId,
    idempotencyKey,
    result: params.result,
    succeeded: params.result !== "failed",
    ...(params.failureReason ? { failureReason: params.failureReason } : {}),
    metadata: { candidateCount: params.candidateCount ?? 0 },
  });
}

export async function processNextCatalogImageBulkItem(params: {
  db: Firestore;
  restaurantId: string;
  jobId: string;
  userId: string;
  access: CatalogImageAccess;
  generate?: typeof generateImportedProductImage;
  search?: typeof searchCatalogProductImages;
}): Promise<{ processed: boolean; job: CatalogImageBulkJob }> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const jobId = assertIdempotencyKey(params.jobId);
  const userId = params.userId.trim();
  if (!userId) {
    throw new CatalogImageBulkError("UNAUTHORIZED", "Usuario requerido", 401);
  }
  const claim = await claimNextItem({ db: params.db, restaurantId, jobId });
  if (!claim) {
    const current = await readCatalogImageBulkJob({
      db: params.db,
      restaurantId,
      jobId,
    });
    return { processed: false, job: current.job };
  }

  try {
    if (claim.kind === "ai_generate") {
      const generate = params.generate ?? generateImportedProductImage;
      const result: GenerateImportedProductImageResult = await generate({
        db: params.db,
        restaurantId,
        productId: claim.productId,
        userId,
        idempotencyKey: itemIdempotencyKey(
          jobId,
          claim.productId,
          claim.attempts,
        ),
        access: params.access,
        usageOperation: "catalog_image_ai_bulk",
        usageCapability: "catalog.image.ai.bulk",
        jobId,
      });
      if (result.outcome === "generated") {
        await finalizeClaim({
          db: params.db,
          restaurantId,
          jobId,
          claim,
          status: "needs_review",
          imageUrl: result.imageUrl,
        });
      } else {
        await finalizeClaim({
          db: params.db,
          restaurantId,
          jobId,
          claim,
          status: "skipped",
          failureReason: result.reason,
        });
      }
    } else if (claim.kind === "catalog_search") {
      await reserveCatalogSearchUsage({
        db: params.db,
        restaurantId,
        jobId,
        productId: claim.productId,
        attempt: claim.attempts,
        userId,
      });
      const search = params.search ?? searchCatalogProductImages;
      const result = await search({
        db: params.db,
        restaurantId,
        productId: claim.productId,
        query: claim.productName,
      });
      const candidateCount = result.candidates.length;
      const catalogCandidates = result.candidates.map((candidate) => ({
        externalReference: candidate.externalReference,
        productName: candidate.productName,
        brand: candidate.brand,
        quantity: candidate.quantity,
        thumbnailUrl: candidate.thumbnailUrl,
        sourceUrl: candidate.sourceUrl,
        confidence: candidate.confidence,
        matchLevel: candidate.matchLevel,
        warnings: candidate.warnings,
        license: candidate.license,
        attribution: candidate.attribution,
      }));
      await finalizeCatalogSearchUsage({
        db: params.db,
        restaurantId,
        jobId,
        productId: claim.productId,
        attempt: claim.attempts,
        result: candidateCount > 0 ? "candidates" : "not_found",
        candidateCount,
      });
      await finalizeClaim({
        db: params.db,
        restaurantId,
        jobId,
        claim,
        status: "needs_review",
        candidateCount,
        catalogCandidates,
        ...(catalogCandidates[0]?.thumbnailUrl
          ? { imageUrl: catalogCandidates[0].thumbnailUrl }
          : {}),
        ...(candidateCount === 0
          ? { failureReason: "CATALOG_MATCH_NOT_FOUND" }
          : {}),
      });
    } else {
      await finalizeClaim({
        db: params.db,
        restaurantId,
        jobId,
        claim,
        status: "needs_review",
      });
    }
  } catch (error) {
    const failureReason = errorCode(error, "CATALOG_IMAGE_BULK_ITEM_FAILED");
    if (claim.kind === "catalog_search") {
      await finalizeCatalogSearchUsage({
        db: params.db,
        restaurantId,
        jobId,
        productId: claim.productId,
        attempt: claim.attempts,
        result: "failed",
        failureReason,
      }).catch(() => undefined);
    }
    await finalizeClaim({
      db: params.db,
      restaurantId,
      jobId,
      claim,
      status: "failed",
      failureReason,
    });
  }

  const current = await readCatalogImageBulkJob({
    db: params.db,
    restaurantId,
    jobId,
  });
  return { processed: true, job: current.job };
}

async function updateItemsWithStatus(params: {
  db: Firestore;
  collection: FirebaseFirestore.CollectionReference;
  fromStatus: CatalogImageBulkItemStatus;
  toStatus: CatalogImageBulkItemStatus;
  maxAttemptsExclusive?: number;
}) {
  const snapshot = await params.collection
    .where("status", "==", params.fromStatus)
    .get();
  const eligible = snapshot.docs.filter((doc) => {
    if (params.maxAttemptsExclusive == null) return true;
    return readFiniteNumber(doc.get("attempts")) < params.maxAttemptsExclusive;
  });
  for (let offset = 0; offset < eligible.length; offset += WRITE_BATCH_SIZE) {
    const batch = params.db.batch();
    for (const doc of eligible.slice(offset, offset + WRITE_BATCH_SIZE)) {
      batch.update(doc.ref, {
        status: params.toStatus,
        updatedAt: Date.now(),
        failureReason: FieldValue.delete(),
      });
    }
    await batch.commit();
  }
  return eligible.length;
}

export async function controlCatalogImageBulkJob(params: {
  db: Firestore;
  restaurantId: string;
  jobId: string;
  action: "pause" | "resume" | "retry_failed" | "cancel";
}): Promise<CatalogImageBulkJob> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const jobId = assertIdempotencyKey(params.jobId);
  const ref = jobRef(params.db, restaurantId, jobId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new CatalogImageBulkError(
      "CATALOG_IMAGE_BULK_JOB_NOT_FOUND",
      "Trabajo masivo no encontrado",
      404,
    );
  }
  const current = deserializeJob(jobId, snapshot.data() as Record<string, unknown>);
  const now = Date.now();

  if (params.action === "pause") {
    if (current.status === "queued" || current.status === "running") {
      await ref.update({ status: "paused", updatedAt: now });
    }
  } else if (params.action === "resume") {
    if (current.status === "paused") {
      await ref.update({ status: "queued", updatedAt: now });
    }
  } else if (params.action === "retry_failed") {
    if (current.counters.failed > 0 && current.status !== "cancelled") {
      const reset = await updateItemsWithStatus({
        db: params.db,
        collection: ref.collection(JOB_ITEMS_COLLECTION),
        fromStatus: "failed",
        toStatus: "pending",
        maxAttemptsExclusive:
          HOSTLY_CATALOG_IMAGE_BULK_POLICY.maxAttemptsPerItem,
      });
      await ref.update({
        status: "queued",
        counters: {
          ...current.counters,
          pending: current.counters.pending + reset,
          failed: Math.max(0, current.counters.failed - reset),
        },
        failureReason: FieldValue.delete(),
        completedAt: FieldValue.delete(),
        updatedAt: now,
      });
    }
  } else if (params.action === "cancel") {
    if (current.status !== "completed" && current.status !== "cancelled") {
      if (current.counters.processing > 0) {
        throw new CatalogImageBulkError(
          "CATALOG_IMAGE_BULK_ITEM_PROCESSING",
          "Pausa y espera a que termine el elemento actual antes de cancelar",
          409,
        );
      }
      const cancelled = await updateItemsWithStatus({
        db: params.db,
        collection: ref.collection(JOB_ITEMS_COLLECTION),
        fromStatus: "pending",
        toStatus: "cancelled",
      });
      await ref.update({
        status: "cancelled",
        counters: {
          ...current.counters,
          pending: Math.max(0, current.counters.pending - cancelled),
          cancelled: current.counters.cancelled + cancelled,
        },
        updatedAt: now,
        completedAt: now,
      });
    }
  }

  const updated = await ref.get();
  return deserializeJob(jobId, updated.data() as Record<string, unknown>);
}
