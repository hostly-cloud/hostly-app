import type { Firestore } from "firebase-admin/firestore";
import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import {
  canAutomaticallyReplaceProductImage,
  canExplicitlyReplaceApprovedAiProductImage,
  readProductImageEnrichment,
} from "@/lib/carta/product-image-enrichment";
import type {
  ProductImageCatalogProvenance,
  ProductImageReviewResolution,
  ProductImageReviewResolvedState,
} from "@/lib/productos/product-image-review-contract";
import { evaluateImportedProductImageEligibility } from "@/lib/server/product-images/generate-imported-product-image";
import { classifyProductImageContentStrategy } from "@/lib/server/product-images/product-image-content-strategy";

const GENERATION_LOCK_MS = 3 * 60 * 1000;
const CATALOG_ATTACH_LOCK_MS = 2 * 60 * 1000;

export class ResolveProductImageReviewStateError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "ResolveProductImageReviewStateError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function readString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasActiveLock(value: unknown, now: number, ttlMs: number): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  const requestId = typeof raw.requestId === "string" ? raw.requestId.trim() : "";
  const startedAt =
    typeof raw.startedAt === "number" && Number.isFinite(raw.startedAt)
      ? raw.startedAt
      : null;
  return Boolean(
    requestId &&
      startedAt != null &&
      now >= startedAt &&
      now - startedAt < ttlMs,
  );
}

function catalogProvenanceFromEnrichment(
  enrichment: ReturnType<typeof readProductImageEnrichment>,
): ProductImageCatalogProvenance | null {
  if (!enrichment || enrichment.source !== "catalog_exact") return null;
  return {
    externalReference: enrichment.externalReference ?? null,
    sourceUrl: enrichment.sourceUrl ?? null,
    imageSourceUrl: enrichment.imageSourceUrl ?? null,
    license: enrichment.license ?? null,
    attribution: enrichment.attribution ?? null,
    matchedProductName: enrichment.matchedProductName ?? null,
    matchedBrand: enrichment.matchedBrand ?? null,
    matchedQuantity: enrichment.matchedQuantity ?? null,
    warnings: enrichment.matchWarnings ?? [],
  };
}

export function buildProductImageReviewStateFromDocument(
  productId: string,
  data: Record<string, unknown>,
  now = Date.now(),
): ProductImageReviewResolvedState {
  const imageUrl = readString(data, "imageUrl");
  const imagePath = readString(data, "imagePath");
  const hasImage = Boolean(imageUrl || imagePath);
  const enrichment = readProductImageEnrichment(data.imageEnrichment);
  const generationInProgress = hasActiveLock(
    data.imageGenerationInProgress,
    now,
    GENERATION_LOCK_MS,
  );
  const catalogAttachInProgress = hasActiveLock(
    data.catalogImageAttachInProgress,
    now,
    CATALOG_ATTACH_LOCK_MS,
  );
  const eligibility = evaluateImportedProductImageEligibility(data);
  const individualFallbackEligibility = evaluateImportedProductImageEligibility(
    data,
    undefined,
    { allowCatalogFallback: true },
  );

  const source = enrichment?.source ?? (hasImage ? "legacy" : null);
  const reviewStatus =
    enrichment?.reviewStatus ?? (hasImage ? "protected" : null);
  const canReviewAutomatic = Boolean(
    hasImage &&
      enrichment &&
      enrichment.source !== "manual" &&
      enrichment.reviewStatus === "pending" &&
      enrichment.locked === false,
  );

  const imageState = { imageUrl, imagePath, imageEnrichment: enrichment };
  const recommendedAction = classifyProductImageContentStrategy(data);
  const canReplaceApprovedAi =
    canExplicitlyReplaceApprovedAiProductImage(imageState);
  const canSearchCatalog =
    recommendedAction === "catalog_search" &&
    !generationInProgress &&
    !catalogAttachInProgress &&
    canAutomaticallyReplaceProductImage(imageState);
  const generationEligible =
    recommendedAction === "catalog_search"
      ? individualFallbackEligibility.eligible
      : eligibility.eligible;
  const canGenerate =
    (recommendedAction === "ai_generate" || recommendedAction === "catalog_search") &&
    (generationEligible || canReplaceApprovedAi) &&
    !generationInProgress;
  const generationEligibility =
    recommendedAction === "catalog_search" ? individualFallbackEligibility : eligibility;
  const generationReason =
    generationInProgress && (generationEligibility.eligible || canReplaceApprovedAi)
      ? "generation_in_progress"
      : generationEligibility.eligible || canReplaceApprovedAi
        ? null
        : generationEligibility.reason;

  return {
    resolution: "resolved",
    productId,
    productName: readString(data, "name") ?? productId,
    imageUrl,
    hasImage,
    source,
    reviewStatus,
    locked: enrichment?.locked ?? hasImage,
    confidence:
      typeof enrichment?.confidence === "number" ? enrichment.confidence : null,
    provider: enrichment?.provider ?? null,
    importedFromMenu: Boolean(readString(data, "importedFromMenuDraftId")),
    generationInProgress,
    canGenerate,
    canApprove: canReviewAutomatic,
    canReject: canReviewAutomatic,
    canSearchCatalog,
    recommendedAction,
    requiresApprovedImageReplacementConfirmation:
      canGenerate && canReplaceApprovedAi,
    catalogProvenance: catalogProvenanceFromEnrichment(enrichment),
    generationReason,
  };
}

function assertSimpleProductId(value: string): string {
  const productId = value.trim();
  if (!productId || productId.includes("/") || productId.includes("..")) {
    throw new ResolveProductImageReviewStateError(
      "INVALID_PRODUCT_ID",
      "productId inválido",
      400,
    );
  }
  return productId;
}

export async function resolveProductImageReviewStateById(params: {
  db: Firestore;
  restaurantId: string;
  productId: string;
}): Promise<ProductImageReviewResolution> {
  const restaurantId = params.restaurantId.trim();
  if (!restaurantId) return { resolution: "not_found" };
  const productId = assertSimpleProductId(params.productId);
  const snap = await params.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("products")
    .doc(productId)
    .get();
  if (!snap.exists) return { resolution: "not_found" };
  return buildProductImageReviewStateFromDocument(
    snap.id,
    snap.data() as Record<string, unknown>,
  );
}

async function queryUniqueProduct(
  db: Firestore,
  restaurantId: string,
  field: "normalizedName" | "name",
  value: string,
): Promise<ProductImageReviewResolution | null> {
  const snap = await db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("products")
    .where(field, "==", value)
    .limit(2)
    .get();

  if (snap.empty) return null;
  if (snap.size > 1) return { resolution: "ambiguous" };

  const doc = snap.docs[0];
  return buildProductImageReviewStateFromDocument(
    doc.id,
    doc.data() as Record<string, unknown>,
  );
}

/** Name fallback retained for unsaved/legacy callers. Saved products should use id. */
export async function resolveProductImageReviewState(params: {
  db: Firestore;
  restaurantId: string;
  productName: string;
}): Promise<ProductImageReviewResolution> {
  const restaurantId = params.restaurantId.trim();
  const productName = params.productName.trim();
  if (!restaurantId || !productName) return { resolution: "not_found" };

  const normalizedName = normalizeProductName(productName);
  if (normalizedName) {
    const byNormalizedName = await queryUniqueProduct(
      params.db,
      restaurantId,
      "normalizedName",
      normalizedName,
    );
    if (byNormalizedName) return byNormalizedName;
  }

  const byExactName = await queryUniqueProduct(
    params.db,
    restaurantId,
    "name",
    productName,
  );
  return byExactName ?? { resolution: "not_found" };
}
