"use client";

import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type {
  CatalogImageCreditAccountSummary,
  CatalogImageCreditApiError,
} from "@/lib/productos/catalog-image-credit-contract";

export class CatalogImageCreditApiErrorResponse extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "CatalogImageCreditApiErrorResponse";
    this.code = code;
    this.status = status;
  }
}

export async function fetchCatalogImageCreditSummary(): Promise<CatalogImageCreditAccountSummary> {
  const response = await authenticatedApiFetch(
    "/api/catalog/product-image-credits",
  );
  const body = (await response.json().catch(() => null)) as
    | { ok: true; summary: CatalogImageCreditAccountSummary }
    | CatalogImageCreditApiError
    | null;
  if (!response.ok || !body?.ok) {
    const code = body && !body.ok ? body.error : "CATALOG_IMAGE_CREDIT_SUMMARY_FAILED";
    const message = body && !body.ok ? body.details ?? code : code;
    throw new CatalogImageCreditApiErrorResponse(code, message, response.status);
  }
  return body.summary;
}
