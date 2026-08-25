"use client";

import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type {
  ProductCommercialIdentity,
  ProductCommercialIdentityApiResponse,
  ProductCommercialIdentityInput,
} from "@/lib/productos/product-commercial-identity-contract";

export class ProductCommercialIdentityApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "ProductCommercialIdentityApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

async function readResponse(response: Response): Promise<ProductCommercialIdentityApiResponse | null> {
  try {
    return (await response.json()) as ProductCommercialIdentityApiResponse;
  } catch {
    return null;
  }
}

function throwApiError(
  response: Response,
  body: ProductCommercialIdentityApiResponse | null,
): never {
  const error = body && !body.ok ? body.error : "PRODUCT_COMMERCIAL_IDENTITY_FAILED";
  const details = body && !body.ok ? body.details : null;
  throw new ProductCommercialIdentityApiError(
    error,
    details ?? error,
    response.status,
  );
}

export async function fetchProductCommercialIdentity(
  productId: string,
): Promise<ProductCommercialIdentity> {
  const response = await authenticatedApiFetch(
    `/api/catalog/product-identity?productId=${encodeURIComponent(productId)}`,
  );
  const body = await readResponse(response);
  if (!response.ok || !body?.ok) throwApiError(response, body);
  return body.identity;
}

export async function saveProductCommercialIdentity(
  input: ProductCommercialIdentityInput,
): Promise<ProductCommercialIdentity> {
  const response = await authenticatedApiFetch("/api/catalog/product-identity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readResponse(response);
  if (!response.ok || !body?.ok) throwApiError(response, body);
  return body.identity;
}
