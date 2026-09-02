import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HOSTLY_CATALOG_IMAGE_BULK_POLICY } from "@/lib/productos/catalog-image-plan";
import type {
  CatalogImageBulkReviewItemResult,
  CatalogImageBulkReviewResult,
} from "@/lib/productos/catalog-image-bulk-contract";
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

export async function reviewCatalogImageBulkSelection(params: {
  db: Firestore;
  restaurantId: string;
  jobId: string;
  productIds: string[];
  userId: string;
  review?: typeof reviewProductImage;
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
  if (
    productIds.length === 0 ||
    productIds.length > HOSTLY_CATALOG_IMAGE_BULK_POLICY.maxReviewItemsPerRequest
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
    if (
      !item ||
      item.restaurantId !== restaurantId ||
      item.jobId !== jobId ||
      item.productId !== productId ||
      item.status !== "needs_review" ||
      (item.kind !== "ai_generate" && item.kind !== "pending_review")
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

  return {
    requested: productIds.length,
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
