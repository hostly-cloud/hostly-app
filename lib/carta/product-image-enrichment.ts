export const PRODUCT_IMAGE_SOURCES = [
  "manual",
  "catalog_exact",
  "ai_generated",
] as const;

export type ProductImageSource = (typeof PRODUCT_IMAGE_SOURCES)[number];

export const PRODUCT_IMAGE_REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export type ProductImageReviewStatus =
  (typeof PRODUCT_IMAGE_REVIEW_STATUSES)[number];

/**
 * Metadata stored beside `imageUrl` / `imagePath` in the central product.
 *
 * `locked` is the hard guard used by automatic enrichment. A manually uploaded
 * or explicitly approved image is locked and must never be replaced by a
 * background enrichment job.
 */
export type ProductImageEnrichment = {
  source: ProductImageSource;
  reviewStatus: ProductImageReviewStatus;
  locked: boolean;
  confidence?: number;
  provider?: string;
  externalReference?: string;
  generatedAt?: number;
  reviewedAt?: number;
  reviewedBy?: string;
};

export type ProductImageState = {
  imageUrl?: string | null;
  imagePath?: string | null;
  imageEnrichment?: ProductImageEnrichment | null;
};

function isProductImageSource(value: unknown): value is ProductImageSource {
  return (
    typeof value === "string" &&
    (PRODUCT_IMAGE_SOURCES as readonly string[]).includes(value)
  );
}

function isProductImageReviewStatus(
  value: unknown,
): value is ProductImageReviewStatus {
  return (
    typeof value === "string" &&
    (PRODUCT_IMAGE_REVIEW_STATUSES as readonly string[]).includes(value)
  );
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Reads Firestore metadata defensively. Malformed/partial metadata returns null,
 * which makes an existing image behave like a protected legacy image.
 */
export function readProductImageEnrichment(
  value: unknown,
): ProductImageEnrichment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!isProductImageSource(raw.source)) return null;
  if (!isProductImageReviewStatus(raw.reviewStatus)) return null;
  if (typeof raw.locked !== "boolean") return null;

  const confidenceRaw = readOptionalFiniteNumber(raw.confidence);
  const confidence =
    confidenceRaw == null ? undefined : Math.max(0, Math.min(1, confidenceRaw));
  const provider = readOptionalString(raw.provider);
  const externalReference = readOptionalString(raw.externalReference);
  const generatedAt = readOptionalFiniteNumber(raw.generatedAt);
  const reviewedAt = readOptionalFiniteNumber(raw.reviewedAt);
  const reviewedBy = readOptionalString(raw.reviewedBy);

  return {
    source: raw.source,
    reviewStatus: raw.reviewStatus,
    locked: raw.locked,
    ...(confidence != null ? { confidence } : {}),
    ...(provider ? { provider } : {}),
    ...(externalReference ? { externalReference } : {}),
    ...(generatedAt != null ? { generatedAt } : {}),
    ...(reviewedAt != null ? { reviewedAt } : {}),
    ...(reviewedBy ? { reviewedBy } : {}),
  };
}

export function buildManualProductImageEnrichment(args?: {
  reviewedAt?: number;
  reviewedBy?: string;
}): ProductImageEnrichment {
  return {
    source: "manual",
    reviewStatus: "approved",
    locked: true,
    ...(args?.reviewedAt != null ? { reviewedAt: args.reviewedAt } : {}),
    ...(args?.reviewedBy?.trim()
      ? { reviewedBy: args.reviewedBy.trim() }
      : {}),
  };
}

export function buildPendingAutomaticProductImageEnrichment(args: {
  source: Exclude<ProductImageSource, "manual">;
  confidence?: number;
  provider?: string;
  externalReference?: string;
  generatedAt?: number;
}): ProductImageEnrichment {
  const confidence =
    typeof args.confidence === "number" && Number.isFinite(args.confidence)
      ? Math.max(0, Math.min(1, args.confidence))
      : undefined;

  return {
    source: args.source,
    reviewStatus: "pending",
    locked: false,
    ...(confidence != null ? { confidence } : {}),
    ...(args.provider?.trim() ? { provider: args.provider.trim() } : {}),
    ...(args.externalReference?.trim()
      ? { externalReference: args.externalReference.trim() }
      : {}),
    ...(args.generatedAt != null ? { generatedAt: args.generatedAt } : {}),
  };
}

/**
 * True only when an automatic enrichment is allowed to attach/replace an image.
 * Existing manual images, approved images and explicitly locked images win.
 */
export function canAutomaticallyReplaceProductImage(
  state: ProductImageState,
): boolean {
  const hasImage = Boolean(state.imageUrl?.trim() || state.imagePath?.trim());
  const metadata = state.imageEnrichment;

  if (!hasImage) return true;
  if (!metadata) return false; // legacy image: conservative, never overwrite it
  if (metadata.locked) return false;
  if (metadata.source === "manual") return false;
  if (metadata.reviewStatus === "approved") return false;

  return true;
}

export function approveProductImageEnrichment(
  current: ProductImageEnrichment,
  args: { reviewedAt: number; reviewedBy: string },
): ProductImageEnrichment {
  return {
    ...current,
    reviewStatus: "approved",
    locked: true,
    reviewedAt: args.reviewedAt,
    reviewedBy: args.reviewedBy.trim(),
  };
}

export function rejectProductImageEnrichment(
  current: ProductImageEnrichment,
  args: { reviewedAt: number; reviewedBy: string },
): ProductImageEnrichment {
  return {
    ...current,
    reviewStatus: "rejected",
    locked: false,
    reviewedAt: args.reviewedAt,
    reviewedBy: args.reviewedBy.trim(),
  };
}
