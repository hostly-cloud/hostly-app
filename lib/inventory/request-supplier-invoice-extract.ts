import type { SupplierInvoiceExtractResponse } from "@/lib/inventory/extracted-supplier-invoice-types";

export class SupplierInvoiceExtractRequestError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 500) {
    super(message);
    this.name = "SupplierInvoiceExtractRequestError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export async function requestSupplierInvoiceExtract(params: {
  file: File;
  idToken: string;
}): Promise<SupplierInvoiceExtractResponse> {
  const form = new FormData();
  form.append("file", params.file);

  const res = await fetch("/api/supplier-invoices/extract", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.idToken}`,
    },
    body: form,
  });

  const body = (await res.json().catch(() => null)) as
    | (SupplierInvoiceExtractResponse & { ok?: boolean; error?: string; details?: string })
    | null;

  if (!res.ok || !body?.ok) {
    const code = typeof body?.error === "string" ? body.error : "EXTRACT_FAILED";
    const details = typeof body?.details === "string" ? body.details : "No se pudo extraer la factura.";
    throw new SupplierInvoiceExtractRequestError(code, details, res.status);
  }

  return {
    ok: true,
    draft: body.draft,
    upload: body.upload,
    extractionMeta: body.extractionMeta,
  };
}
