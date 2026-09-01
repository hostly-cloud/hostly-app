"use client";

import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type {
  ProductImageReviewAction,
  ProductImageReviewApiResponse,
  ProductImageReviewResolution,
  ProductImageReviewResolvedState,
} from "@/lib/productos/product-image-review-contract";

export class ProductImageReviewApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ProductImageReviewApiError";
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
  body: { error?: unknown; details?: unknown } | null,
  fallback: string,
): never {
  const code =
    typeof body?.error === "string" && body.error.trim()
      ? body.error.trim()
      : fallback;
  const message =
    typeof body?.details === "string" && body.details.trim()
      ? body.details.trim()
      : code;
  throw new ProductImageReviewApiError(code, message, response.status);
}

async function fetchState(url: string): Promise<ProductImageReviewResolution> {
  const response = await authenticatedApiFetch(url);
  const body = await readJson<ProductImageReviewApiResponse>(response);
  if (!response.ok || !body?.ok) {
    throwApiError(
      response,
      body && !body.ok ? body : null,
      "PRODUCT_IMAGE_STATE_FAILED",
    );
  }
  return body.state;
}

export async function fetchProductImageReviewState(
  productName: string,
): Promise<ProductImageReviewResolution> {
  return fetchState(
    `/api/catalog/product-image-state?name=${encodeURIComponent(productName.trim())}`,
  );
}

export async function fetchProductImageReviewStateById(
  productId: string,
): Promise<ProductImageReviewResolution> {
  return fetchState(
    `/api/catalog/product-image-state?productId=${encodeURIComponent(productId.trim())}`,
  );
}

export type GenerateProductImageClientResult =
  | {
      outcome: "generated";
      productId: string;
      imageUrl: string;
      imagePath: string;
      model: string;
      replacedImagePath?: string;
    }
  | {
      outcome: "skipped";
      productId: string;
      reason: string;
    };

export async function generateProductImageForReview(
  productId: string,
  description?: string,
): Promise<GenerateProductImageClientResult> {
  const response = await authenticatedApiFetch(
    "/api/catalog/generate-product-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        confirmGeneration: true,
        ...(description?.trim() ? { description: description.trim() } : {}),
      }),
    },
  );
  const body = await readJson<{
    ok?: boolean;
    result?: GenerateProductImageClientResult;
    error?: string;
    details?: string | null;
  }>(response);
  if (!response.ok || body?.ok !== true || !body.result) {
    throwApiError(response, body, "IMAGE_GENERATION_FAILED");
  }
  return body.result;
}

export async function submitProductImageReview(
  productId: string,
  action: ProductImageReviewAction,
): Promise<ProductImageReviewResolvedState> {
  const response = await authenticatedApiFetch(
    "/api/catalog/review-product-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, action }),
    },
  );
  const body = await readJson<{
    ok?: boolean;
    state?: ProductImageReviewResolvedState;
    error?: string;
    details?: string | null;
  }>(response);
  if (!response.ok || body?.ok !== true || !body.state) {
    throwApiError(response, body, "PRODUCT_IMAGE_REVIEW_FAILED");
  }
  return body.state;
}
