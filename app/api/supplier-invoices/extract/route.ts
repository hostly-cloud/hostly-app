import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { extractSupplierInvoiceWithVision } from "@/lib/server/supplier-invoices/extract-supplier-invoice-with-ai";
import {
  uploadSupplierInvoiceFile,
  validateSupplierInvoiceUploadFile,
} from "@/lib/server/supplier-invoices/upload-supplier-invoice-file";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export type SupplierInvoiceExtractDependencies =
  AuthenticatedRestaurantDependencies & {
  uploadFile?: typeof uploadSupplierInvoiceFile;
  extractInvoice?: typeof extractSupplierInvoiceWithVision;
};

export async function handleExtractSupplierInvoiceRequest(
  req: Request,
  dependencies?: SupplierInvoiceExtractDependencies,
) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req, dependencies);
    if (isAuthErrorResponse(authCtx)) {
      return authCtx;
    }
    if (!serverRoleHasCapability(authCtx.role, "supplier_invoices.manage")) {
      return jsonError(403, "SUPPLIER_INVOICES_MANAGE_REQUIRED");
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return jsonError(400, "INVALID_MULTIPART");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError(400, "MISSING_FILE");
    }

    const mimeType = file.type || "application/octet-stream";
    try {
      validateSupplierInvoiceUploadFile({
        fileName: file.name,
        mimeType,
        size: file.size,
      });
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "INVALID_SUPPLIER_INVOICE_FILE";
      const status =
        code === "FILE_TOO_LARGE"
          ? 413
          : code === "UNSUPPORTED_FILE_TYPE" ||
              code === "FILE_SIGNATURE_MISMATCH"
            ? 415
            : 400;
      return jsonError(status, code);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      validateSupplierInvoiceUploadFile({
        fileName: file.name,
        mimeType,
        size: buffer.length,
        bytes: buffer,
      });
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "INVALID_SUPPLIER_INVOICE_FILE";
      return jsonError(code === "FILE_TOO_LARGE" ? 413 : 415, code);
    }

    let upload;
    try {
      const uploadFile = dependencies?.uploadFile ?? uploadSupplierInvoiceFile;
      upload = await uploadFile({
        restaurantId: authCtx.restaurantId,
        userId: authCtx.uid,
        fileName: file.name,
        mimeType,
        buffer,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
      if (
        message === "UNSUPPORTED_FILE_TYPE" ||
        message === "FILE_SIGNATURE_MISMATCH"
      ) {
        return jsonError(415, message);
      }
      if (message === "FILE_TOO_LARGE") {
        return jsonError(413, message);
      }
      if (message === "FILE_EMPTY") return jsonError(400, message);
      if (message === "STORAGE_ADMIN_NOT_CONFIGURED") {
        return jsonError(503, message);
      }
      return jsonError(500, "UPLOAD_FAILED");
    }

    const extractInvoice =
      dependencies?.extractInvoice ?? extractSupplierInvoiceWithVision;
    const extraction = await extractInvoice({
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
    console.error("[api/supplier-invoices/extract]", {
      code: "EXTRACT_FAILED",
    });
    return jsonError(500, "EXTRACT_FAILED");
  }
}

export async function POST(req: Request) {
  return handleExtractSupplierInvoiceRequest(req);
}
