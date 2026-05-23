import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { extractSupplierInvoiceWithVision } from "@/lib/server/supplier-invoices/extract-supplier-invoice-with-ai";
import { uploadSupplierInvoiceFile } from "@/lib/server/supplier-invoices/upload-supplier-invoice-file";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export async function POST(req: Request) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(authCtx)) {
      return authCtx;
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return jsonError(400, "INVALID_MULTIPART");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError(400, "MISSING_FILE");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    let upload;
    try {
      upload = await uploadSupplierInvoiceFile({
        restaurantId: authCtx.restaurantId,
        userId: authCtx.uid,
        fileName: file.name,
        mimeType,
        buffer,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
      if (message === "UNSUPPORTED_FILE_TYPE") {
        return jsonError(415, message, "Solo JPG, PNG, WebP o PDF.");
      }
      if (message === "FILE_TOO_LARGE") {
        return jsonError(413, message, "Máximo 12 MB.");
      }
      if (message === "STORAGE_ADMIN_NOT_CONFIGURED") {
        return jsonError(503, message, "Storage Admin no disponible en servidor.");
      }
      return jsonError(500, "UPLOAD_FAILED", message);
    }

    const extraction = await extractSupplierInvoiceWithVision({
      buffer,
      mimeType,
      filename: file.name,
      restaurantId: authCtx.restaurantId,
    });

    return NextResponse.json({
      ok: true,
      draft: extraction.draft,
      upload,
      extractionMeta: {
        source: extraction.source,
        warnings: extraction.warnings,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EXTRACT_FAILED";
    console.error("[api/supplier-invoices/extract]", message, error);
    return jsonError(500, "EXTRACT_FAILED", message);
  }
}
