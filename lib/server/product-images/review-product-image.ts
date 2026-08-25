import type { Firestore } from "firebase-admin/firestore";
import {
  approveProductImageEnrichment,
  readProductImageEnrichment,
  rejectProductImageEnrichment,
} from "@/lib/carta/product-image-enrichment";
import type {
  ProductImageReviewAction,
  ProductImageReviewResolvedState,
} from "@/lib/productos/product-image-review-contract";
import { buildProductImageReviewStateFromDocument } from "@/lib/server/product-images/resolve-product-image-review-state";

export class ReviewProductImageError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "ReviewProductImageError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function assertSimpleId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("..")) {
    throw new ReviewProductImageError(
      "INVALID_IMAGE_REVIEW_ID",
      `${label} inválido`,
      400,
    );
  }
  return trimmed;
}

export async function reviewProductImage(params: {
  db: Firestore;
  restaurantId: string;
  productId: string;
  userId: string;
  action: ProductImageReviewAction;
}): Promise<ProductImageReviewResolvedState> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const productId = assertSimpleId(params.productId, "productId");
  const userId = params.userId.trim();
  if (!userId) {
    throw new ReviewProductImageError("UNAUTHORIZED", "Usuario requerido", 401);
  }

  const productRef = params.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("products")
    .doc(productId);

  return params.db.runTransaction(async (transaction) => {
    const snap = await transaction.get(productRef);
    if (!snap.exists) {
      throw new ReviewProductImageError(
        "PRODUCT_NOT_FOUND",
        "Producto no encontrado",
        404,
      );
    }

    const data = snap.data() as Record<string, unknown>;
    const imageUrl =
      typeof data.imageUrl === "string" && data.imageUrl.trim()
        ? data.imageUrl.trim()
        : "";
    const imagePath =
      typeof data.imagePath === "string" && data.imagePath.trim()
        ? data.imagePath.trim()
        : "";
    if (!imageUrl && !imagePath) {
      throw new ReviewProductImageError(
        "PRODUCT_IMAGE_NOT_FOUND",
        "El producto no tiene una imagen para revisar",
        409,
      );
    }

    const current = readProductImageEnrichment(data.imageEnrichment);
    if (
      !current ||
      current.source === "manual" ||
      current.locked ||
      current.reviewStatus === "approved"
    ) {
      throw new ReviewProductImageError(
        "PRODUCT_IMAGE_PROTECTED",
        "La imagen está protegida y no admite esta revisión",
        409,
      );
    }
    if (current.reviewStatus !== "pending") {
      throw new ReviewProductImageError(
        "PRODUCT_IMAGE_REVIEW_STATE_INVALID",
        "Solo una imagen pendiente puede aprobarse o rechazarse",
        409,
      );
    }

    const now = Date.now();
    const next =
      params.action === "approve"
        ? approveProductImageEnrichment(current, {
            reviewedAt: now,
            reviewedBy: userId,
          })
        : rejectProductImageEnrichment(current, {
            reviewedAt: now,
            reviewedBy: userId,
          });

    transaction.update(productRef, {
      imageEnrichment: next,
      updatedAt: now,
      updatedBy: userId,
    });

    return buildProductImageReviewStateFromDocument(
      productId,
      { ...data, imageEnrichment: next, updatedAt: now, updatedBy: userId },
      now,
    );
  });
}
