"use client";

import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type {
  CatalogProductImageAttachApiResponse,
  CatalogProductImageAttachResult,
  CatalogProductImageSearchApiResponse,
  CatalogProductImageSearchResult,
} from "@/lib/productos/catalog-product-image-contract";

export class CatalogProductImageApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "CatalogProductImageApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function apiError(
  response: Response,
  body: { error?: string; details?: string | null } | null,
  fallback: string,
): CatalogProductImageApiError {
  return new CatalogProductImageApiError(
    body?.error ?? fallback,
    body?.details ?? body?.error ?? fallback,
    response.status,
  );
}

export async function searchCatalogProductImagesForReview(
  productId: string,
  query: string,
): Promise<CatalogProductImageSearchResult> {
  const idempotencyKey = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await authenticatedApiFetch(
    "/api/catalog/search-product-images",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        query,
        idempotencyKey,
        confirmSearch: true,
      }),
    },
  );
  const body = await readJson<CatalogProductImageSearchApiResponse>(response);
  if (!response.ok || !body?.ok) {
    throw apiError(
      response,
      body && !body.ok ? body : null,
      "CATALOG_IMAGE_SEARCH_FAILED",
    );
  }
  return body.result;
}

export async function attachCatalogProductImageForReview(
  productId: string,
  externalReference: string,
): Promise<CatalogProductImageAttachResult> {
  const response = await authenticatedApiFetch(
    "/api/catalog/attach-product-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        externalReference,
        confirmSelection: true,
      }),
    },
  );
  const body = await readJson<CatalogProductImageAttachApiResponse>(response);
  if (!response.ok || !body?.ok) {
    throw apiError(
      response,
      body && !body.ok ? body : null,
      "CATALOG_IMAGE_ATTACH_FAILED",
    );
  }
  return body.result;
}
