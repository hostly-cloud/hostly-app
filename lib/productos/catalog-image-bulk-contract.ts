import type {
  CatalogImageAccess,
  CatalogImageMeteringMode,
} from "@/lib/productos/catalog-image-plan";

export const CATALOG_IMAGE_BULK_ITEM_KINDS = [
  "ai_generate",
  "catalog_search",
  "manual_review",
  "pending_review",
  "existing_image",
  "already_processing",
] as const;

export type CatalogImageBulkItemKind =
  (typeof CATALOG_IMAGE_BULK_ITEM_KINDS)[number];

export const CATALOG_IMAGE_BULK_JOB_STATUSES = [
  "preparing",
  "queued",
  "running",
  "paused",
  "completed",
  "cancelled",
  "failed",
] as const;

export type CatalogImageBulkJobStatus =
  (typeof CATALOG_IMAGE_BULK_JOB_STATUSES)[number];

export const CATALOG_IMAGE_BULK_ITEM_STATUSES = [
  "pending",
  "processing",
  "completed",
  "needs_review",
  "skipped",
  "failed",
  "cancelled",
] as const;

export type CatalogImageBulkItemStatus =
  (typeof CATALOG_IMAGE_BULK_ITEM_STATUSES)[number];

export type CatalogImageBulkSummary = {
  totalProducts: number;
  withoutApprovedImage: number;
  aiGenerable: number;
  catalogSearchable: number;
  manualReview: number;
  pendingReview: number;
  alreadyProcessing: number;
  existingImage: number;
};

export type CatalogImageBulkEstimate = {
  aiGenerationRequests: number;
  catalogSearchRequests: number;
  credits: number | null;
  costUsd: number | null;
  mode: CatalogImageMeteringMode;
  note: string;
};

export type CatalogImageBulkPreflight = {
  summary: CatalogImageBulkSummary;
  estimate: CatalogImageBulkEstimate;
  access: CatalogImageAccess;
};

export type CatalogImageBulkJobCounters = {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  needsReview: number;
  failed: number;
  skipped: number;
  cancelled: number;
};

export type CatalogImageBulkJob = {
  jobId: string;
  status: CatalogImageBulkJobStatus;
  queueRevision: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  summary: CatalogImageBulkSummary;
  estimate: CatalogImageBulkEstimate;
  counters: CatalogImageBulkJobCounters;
  activeProductId: string | null;
  failureReason: string | null;
};

export type CatalogImageBulkCatalogCandidate = {
  externalReference: string;
  productName: string;
  brand: string | null;
  quantity: string | null;
  thumbnailUrl: string;
  sourceUrl: string;
  confidence: number;
  matchLevel: "strong" | "review";
  warnings: string[];
  license: string;
  attribution: string;
};

export type CatalogImageBulkCatalogSelection = {
  productId: string;
  externalReference: string;
};

export type CatalogImageBulkJobItem = {
  productId: string;
  productName: string;
  kind: CatalogImageBulkItemKind;
  status: CatalogImageBulkItemStatus;
  attempts: number;
  imageUrl: string | null;
  candidateCount: number;
  catalogCandidates: CatalogImageBulkCatalogCandidate[];
  failureReason: string | null;
  reviewStatus: "pending" | "approved" | null;
};

export type CatalogImageBulkReviewItemResult = {
  productId: string;
  status: "approved" | "already_approved" | "ineligible" | "failed";
  error: string | null;
};

export type CatalogImageBulkReviewResult = {
  requested: number;
  approved: number;
  alreadyApproved: number;
  failed: number;
  results: CatalogImageBulkReviewItemResult[];
};

export type CatalogImageBulkJobPayload = {
  job: CatalogImageBulkJob;
  items: CatalogImageBulkJobItem[];
  access: CatalogImageAccess;
};

export type CatalogImageBulkApiError = {
  ok: false;
  error: string;
  details?: string | null;
};
