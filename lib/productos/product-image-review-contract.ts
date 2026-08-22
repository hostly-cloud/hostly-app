import type {
  ProductImageReviewStatus,
  ProductImageSource,
} from "@/lib/carta/product-image-enrichment";

export type ProductImageCatalogProvenance = {
  externalReference: string | null;
  sourceUrl: string | null;
  imageSourceUrl: string | null;
  license: string | null;
  attribution: string | null;
  matchedProductName: string | null;
  matchedBrand: string | null;
  matchedQuantity: string | null;
  warnings: string[];
};

export type ProductImageReviewResolution =
  | { resolution: "not_found" }
  | { resolution: "ambiguous" }
  | ProductImageReviewResolvedState;

export type ProductImageReviewResolvedState = {
  resolution: "resolved";
  productId: string;
  productName: string;
  imageUrl: string | null;
  hasImage: boolean;
  source: ProductImageSource | "legacy" | null;
  reviewStatus: ProductImageReviewStatus | "protected" | null;
  locked: boolean;
  confidence: number | null;
  provider: string | null;
  importedFromMenu: boolean;
  generationInProgress: boolean;
  canGenerate: boolean;
  canApprove: boolean;
  canReject: boolean;
  canSearchCatalog: boolean;
  catalogProvenance: ProductImageCatalogProvenance | null;
  generationReason:
    | "not_imported"
    | "not_food"
    | "branded_or_beverage"
    | "invalid_product_name"
    | "protected_existing_image"
    | "generation_in_progress"
    | null;
};

export type ProductImageReviewAction = "approve" | "reject";

export type ProductImageReviewApiResponse =
  | { ok: true; state: ProductImageReviewResolution }
  | { ok: false; error: string; details?: string | null };
