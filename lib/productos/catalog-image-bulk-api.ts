"use client";

import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type {
  CatalogImageBulkApiError,
  CatalogImageBulkCatalogSelection,
  CatalogImageBulkJob,
  CatalogImageBulkJobPayload,
  CatalogImageBulkPreflight,
  CatalogImageBulkReviewResult,
} from "@/lib/productos/catalog-image-bulk-contract";

export class CatalogImageBulkApiErrorResponse extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "CatalogImageBulkApiErrorResponse";
    this.code = code;
    this.status = status;
  }
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function throwApiError(
  response: Response,
  body: CatalogImageBulkApiError | null,
  fallback: string,
): never {
  const code = body?.error?.trim() || fallback;
  const message = body?.details?.trim() || code;
  throw new CatalogImageBulkApiErrorResponse(code, message, response.status);
}

export async function fetchCatalogImageBulkPreflight(): Promise<CatalogImageBulkPreflight> {
  const response = await authenticatedApiFetch(
    "/api/catalog/product-image-bulk/preflight",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  const body = await readJson<
    | { ok: true; preflight: CatalogImageBulkPreflight }
    | CatalogImageBulkApiError
  >(response);
  if (!response.ok || !body?.ok) {
    throwApiError(
      response,
      body && !body.ok ? body : null,
      "CATALOG_IMAGE_BULK_PREFLIGHT_FAILED",
    );
  }
  return body.preflight;
}

export async function createCatalogImageBulkJob(
  confirmationToken?: string,
): Promise<CatalogImageBulkJob> {
  const idempotencyKey =
    globalThis.crypto?.randomUUID?.() ??
    `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await authenticatedApiFetch(
    "/api/catalog/product-image-bulk/jobs",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey,
        confirmationToken,
        confirmBulkGeneration: true,
      }),
    },
  );
  const body = await readJson<
    | { ok: true; job: CatalogImageBulkJob }
    | CatalogImageBulkApiError
  >(response);
  if (!response.ok || !body?.ok) {
    throwApiError(
      response,
      body && !body.ok ? body : null,
      "CATALOG_IMAGE_BULK_CREATE_FAILED",
    );
  }
  return body.job;
}

async function readJobResponse(response: Response): Promise<CatalogImageBulkJobPayload> {
  const body = await readJson<
    | ({ ok: true } & CatalogImageBulkJobPayload)
    | CatalogImageBulkApiError
  >(response);
  if (!response.ok || !body?.ok) {
    throwApiError(
      response,
      body && !body.ok ? body : null,
      "CATALOG_IMAGE_BULK_JOB_FAILED",
    );
  }
  return { job: body.job, items: body.items, access: body.access };
}

export async function fetchLatestCatalogImageBulkJob(): Promise<CatalogImageBulkJobPayload | null> {
  const response = await authenticatedApiFetch(
    "/api/catalog/product-image-bulk/jobs",
  );
  const body = await readJson<
    | {
        ok: true;
        job: CatalogImageBulkJob | null;
        items: CatalogImageBulkJobPayload["items"];
        access: CatalogImageBulkJobPayload["access"];
      }
    | CatalogImageBulkApiError
  >(response);
  if (!response.ok || !body?.ok) {
    throwApiError(
      response,
      body && !body.ok ? body : null,
      "CATALOG_IMAGE_BULK_JOB_FAILED",
    );
  }
  return body.job
    ? { job: body.job, items: body.items, access: body.access }
    : null;
}

export async function fetchCatalogImageBulkJob(
  jobId: string,
): Promise<CatalogImageBulkJobPayload> {
  return readJobResponse(
    await authenticatedApiFetch(
      `/api/catalog/product-image-bulk/jobs/${encodeURIComponent(jobId)}`,
    ),
  );
}

export async function processNextCatalogImageBulkItem(
  jobId: string,
): Promise<CatalogImageBulkJob> {
  const response = await authenticatedApiFetch(
    `/api/catalog/product-image-bulk/jobs/${encodeURIComponent(jobId)}/process`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  const body = await readJson<
    | { ok: true; job: CatalogImageBulkJob }
    | CatalogImageBulkApiError
  >(response);
  if (!response.ok || !body?.ok) {
    throwApiError(
      response,
      body && !body.ok ? body : null,
      "CATALOG_IMAGE_BULK_PROCESS_FAILED",
    );
  }
  return body.job;
}

export async function controlCatalogImageBulkJob(
  jobId: string,
  action: "pause" | "resume" | "retry_failed" | "cancel",
): Promise<CatalogImageBulkJob> {
  const response = await authenticatedApiFetch(
    `/api/catalog/product-image-bulk/jobs/${encodeURIComponent(jobId)}/control`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
  );
  const body = await readJson<
    | { ok: true; job: CatalogImageBulkJob }
    | CatalogImageBulkApiError
  >(response);
  if (!response.ok || !body?.ok) {
    throwApiError(
      response,
      body && !body.ok ? body : null,
      "CATALOG_IMAGE_BULK_CONTROL_FAILED",
    );
  }
  return body.job;
}

export async function approveCatalogImageBulkSelection(
  jobId: string,
  productIds: string[],
  catalogSelections: CatalogImageBulkCatalogSelection[] = [],
): Promise<CatalogImageBulkReviewResult> {
  const response = await authenticatedApiFetch(
    `/api/catalog/product-image-bulk/jobs/${encodeURIComponent(jobId)}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds,
        catalogSelections,
        confirmApproval: true,
      }),
    },
  );
  const body = await readJson<
    | { ok: true; result: CatalogImageBulkReviewResult }
    | CatalogImageBulkApiError
  >(response);
  if (!response.ok || !body?.ok) {
    throwApiError(
      response,
      body && !body.ok ? body : null,
      "CATALOG_IMAGE_BULK_REVIEW_FAILED",
    );
  }
  return body.result;
}
