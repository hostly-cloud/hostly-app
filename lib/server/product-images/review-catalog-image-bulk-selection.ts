import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HOSTLY_CATALOG_IMAGE_BULK_POLICY } from "@/lib/productos/catalog-image-plan";
import type {
  CatalogImageBulkCatalogSelection,
  CatalogImageBulkReviewItemResult,
  CatalogImageBulkReviewResult,
} from "@/lib/productos/catalog-image-bulk-contract";
import { attachCatalogProductImage } from "@/lib/server/product-images/attach-catalog-product-image";
import { reviewProductImage } from "@/lib/server/product-images/review-product-image";

function assertSimpleId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.includes("/") || normalized.includes("..")) {
    throw Object.assign(new Error(`${label} inválido`), {
      code: "INVALID_CATALOG_IMAGE_BULK_REVIEW_ID",
      httpStatus: 400,
    });
  }
  return normalized;
}

function errorCode(error: unknown): string {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.trim()
    ? error.code.trim().slice(0, 160)
    : "PRODUCT_IMAGE_REVIEW_FAILED";
}

function normalizeCatalogSelections(
  selections: CatalogImageBulkCatalogSelection[],
): CatalogImageBulkCatalogSelection[] {
  const byProduct = new Map<string, string>();
  for (const selection of selections) {
    const productId = assertSimpleId(selection.productId, "productId");
    const externalReference = selection.externalReference.trim();
    if (!/^\d{4,24}$/.test(externalReference)) {
      throw Object.assign(new Error("Referencia de catálogo inválida"), {
        code: "INVALID_CATALOG_IMAGE_BULK_CATALOG_SELECTION",
        httpStatus: 400,
      });
    }
    const previous = byProduct.get(productId);
    if (previous && previous !== externalReference) {
      throw Object.assign(new Error("Selección de catálogo contradictoria"), {
        code: "INVALID_CATALOG_IMAGE_BULK_CATALOG_SELECTION",
        httpStatus: 400,
      });
    }
    byProduct.set(productId, externalReference);
  }
  return [...byProduct].map(([productId, externalReference]) => ({
    productId,
    externalReference,
  }));
}

function itemBelongsToJob(params: {
  item: Record<string, unknown>;
  restaurantId: string;
  jobId: string;
  productId: string;
}): boolean {
  return (
    params.item.restaurantId === params.restaurantId &&
    params.item.jobId === params.jobId &&
    params.item.productId === params.productId &&
    params.item.status === "needs_review"
  );
}

async function recordApprovedReviewCount(
  jobRef: FirebaseFirestore.DocumentReference,
  count: number,
): Promise<void> {
  if (count <= 0) return;
  await jobRef.update({
    "counters.needsReview": FieldValue.increment(-count),
    "counters.completed": FieldValue.increment(count),
    updatedAt: Date.now(),
  });
}

export async function reviewCatalogImageBulkSelection(params: {
  db: Firestore;
  restaurantId: string;
  jobId: string;
  productIds: string[];
  catalogSelections?: CatalogImageBulkCatalogSelection[];
  userId: string;
  review?: typeof reviewProductImage;
  attachCatalog?: typeof attachCatalogProductImage;
}): Promise<CatalogImageBulkReviewResult> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const jobId = assertSimpleId(params.jobId, "jobId");
  const userId = params.userId.trim();
  if (!userId) {
    throw Object.assign(new Error("Usuario requerido"), {
      code: "UNAUTHORIZED",
      httpStatus: 401,
    });
  }
  const productIds = [...new Set(params.productIds.map((id) => id.trim()))];
  const catalogSelections = normalizeCatalogSelections(
    params.catalogSelections ?? [],
  );
  const catalogProductIds = new Set(
    catalogSelections.map((selection) => selection.productId),
  );
  if (productIds.some((productId) => catalogProductIds.has(productId))) {
    throw Object.assign(new Error("Un producto no puede aprobarse dos veces"), {
      code: "INVALID_CATALOG_IMAGE_BULK_REVIEW_SELECTION",
      httpStatus: 400,
    });
  }
  const requestedCount = productIds.length + catalogSelections.length;
  if (
    requestedCount === 0 ||
    requestedCount > HOSTLY_CATALOG_IMAGE_BULK_POLICY.maxReviewItemsPerRequest
  ) {
    throw Object.assign(new Error("Selección de imágenes inválida"), {
      code: "INVALID_CATALOG_IMAGE_BULK_REVIEW_SELECTION",
      httpStatus: 400,
    });
  }
  productIds.forEach((productId) => assertSimpleId(productId, "productId"));

  const jobRef = params.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("catalogImageJobs")
    .doc(jobId);
  const jobSnapshot = await jobRef.get();
  if (!jobSnapshot.exists) {
    throw Object.assign(new Error("Trabajo masivo no encontrado"), {
      code: "CATALOG_IMAGE_BULK_JOB_NOT_FOUND",
      httpStatus: 404,
    });
  }
  const job = jobSnapshot.data() as Record<string, unknown>;
  if (job.restaurantId !== restaurantId || job.jobId !== jobId) {
    throw Object.assign(new Error("Trabajo masivo no encontrado"), {
      code: "CATALOG_IMAGE_BULK_JOB_NOT_FOUND",
      httpStatus: 404,
    });
  }

  const review = params.review ?? reviewProductImage;
  const results: CatalogImageBulkReviewItemResult[] = [];
  for (const productId of productIds) {
    const itemRef = jobRef.collection("items").doc(productId);
    const itemSnapshot = await itemRef.get();
    const item = itemSnapshot.exists
      ? (itemSnapshot.data() as Record<string, unknown>)
      : null;
    if (!item || !itemBelongsToJob({ item, restaurantId, jobId, productId })) {
      results.push({
        productId,
        status: "ineligible",
        error: "CATALOG_IMAGE_BULK_ITEM_NOT_APPROVABLE",
      });
      continue;
    }
    if (item.reviewStatus === "approved") {
      results.push({ productId, status: "already_approved", error: null });
      continue;
    }
    const directApprovalEligible =
      item.kind === "ai_generate" ||
      item.kind === "pending_review" ||
      (item.kind === "catalog_search" &&
        item.reviewStatus === "pending" &&
        typeof item.selectedCatalogReference === "string" &&
        Boolean(item.selectedCatalogReference.trim()));
    if (!directApprovalEligible) {
      results.push({
        productId,
        status: "ineligible",
        error: "CATALOG_IMAGE_BULK_ITEM_NOT_APPROVABLE",
      });
      continue;
    }
    try {
      await review({
        db: params.db,
        restaurantId,
        productId,
        userId,
        action: "approve",
      });
      await itemRef.update({
        reviewStatus: "approved",
        reviewedAt: Date.now(),
        reviewedBy: userId,
        reviewFailureReason: FieldValue.delete(),
        updatedAt: Date.now(),
      });
      results.push({ productId, status: "approved", error: null });
    } catch (error) {
      const code = errorCode(error);
      await itemRef.update({
        reviewFailureReason: code,
        updatedAt: Date.now(),
      });
      results.push({ productId, status: "failed", error: code });
    }
  }

  const attachCatalog = params.attachCatalog ?? attachCatalogProductImage;
  for (const selection of catalogSelections) {
    const { productId, externalReference } = selection;
    const itemRef = jobRef.collection("items").doc(productId);
    const itemSnapshot = await itemRef.get();
    const item = itemSnapshot.exists
      ? (itemSnapshot.data() as Record<string, unknown>)
      : null;
    if (
      !item ||
      !itemBelongsToJob({ item, restaurantId, jobId, productId }) ||
      item.kind !== "catalog_search"
    ) {
      results.push({
        productId,
        status: "ineligible",
        error: "CATALOG_IMAGE_BULK_ITEM_NOT_APPROVABLE",
      });
      continue;
    }
    if (item.reviewStatus === "approved") {
      results.push({ productId, status: "already_approved", error: null });
      continue;
    }
    const candidates = Array.isArray(item.catalogCandidates)
      ? item.catalogCandidates
      : [];
    const referenceBelongsToItem = candidates.some(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate) &&
        (candidate as Record<string, unknown>).externalReference ===
          externalReference,
    );
    if (!referenceBelongsToItem) {
      results.push({
        productId,
        status: "ineligible",
        error: "CATALOG_IMAGE_BULK_CANDIDATE_NOT_FOUND",
      });
      continue;
    }

    try {
      const alreadyAttached =
        item.reviewStatus === "pending" &&
        item.selectedCatalogReference === externalReference;
      if (!alreadyAttached) {
        const attached = await attachCatalog({
          db: params.db,
          restaurantId,
          productId,
          externalReference,
          userId,
        });
        await itemRef.update({
          imageUrl: attached.imageUrl,
          reviewStatus: "pending",
          selectedCatalogReference: externalReference,
          catalogAttachedAt: Date.now(),
          catalogAttachedBy: userId,
          reviewFailureReason: FieldValue.delete(),
          updatedAt: Date.now(),
        });
      }
      await review({
        db: params.db,
        restaurantId,
        productId,
        userId,
        action: "approve",
      });
      await itemRef.update({
        reviewStatus: "approved",
        selectedCatalogReference: externalReference,
        reviewedAt: Date.now(),
        reviewedBy: userId,
        reviewFailureReason: FieldValue.delete(),
        updatedAt: Date.now(),
      });
      results.push({ productId, status: "approved", error: null });
    } catch (error) {
      const code = errorCode(error);
      await itemRef.update({
        reviewFailureReason: code,
        updatedAt: Date.now(),
      });
      results.push({ productId, status: "failed", error: code });
    }
  }

  await recordApprovedReviewCount(
    jobRef,
    results.filter((result) => result.status === "approved").length,
  );

  return {
    requested: requestedCount,
    approved: results.filter((result) => result.status === "approved").length,
    alreadyApproved: results.filter(
      (result) => result.status === "already_approved",
    ).length,
    failed: results.filter(
      (result) => result.status === "failed" || result.status === "ineligible",
    ).length,
    results,
  };
}
