import { randomUUID } from "node:crypto";
import { getHostlyStorageBucket } from "@/lib/firebase/admin";

export const MAX_SUPPLIER_INVOICE_UPLOAD_BYTES = 12 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

function sanitizeFileName(originalName: string): string {
  const base =
    typeof originalName === "string" && originalName.trim() !== ""
      ? originalName.trim()
      : "factura";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function assertRestaurantId(restaurantId: string): string {
  const rid = restaurantId.trim();
  if (!rid || rid.includes("/") || rid.includes("..")) {
    throw new Error("INVALID_RESTAURANT_ID");
  }
  return rid;
}

export type UploadSupplierInvoiceFileParams = {
  restaurantId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

export type UploadSupplierInvoiceFileResult = {
  storagePath: string;
  filename: string;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
};

export function validateSupplierInvoiceUploadFile(params: {
  fileName: string;
  mimeType: string;
  size: number;
}): void {
  const mime = params.mimeType.trim().toLowerCase() || "application/octet-stream";
  const lowerName = params.fileName.toLowerCase();
  const allowedByMime = ALLOWED_MIME_TYPES.has(mime);
  const allowedByName =
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".webp");

  if (!allowedByMime && !allowedByName) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }

  if (params.size <= 0 || params.size > MAX_SUPPLIER_INVOICE_UPLOAD_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }
}

export async function uploadSupplierInvoiceFile(
  params: UploadSupplierInvoiceFileParams,
): Promise<UploadSupplierInvoiceFileResult> {
  const rid = assertRestaurantId(params.restaurantId);
  const uid = params.userId.trim();
  if (!uid) throw new Error("MISSING_USER_ID");

  validateSupplierInvoiceUploadFile({
    fileName: params.fileName,
    mimeType: params.mimeType,
    size: params.buffer.length,
  });

  const bucket = getHostlyStorageBucket();
  if (!bucket) {
    throw new Error("STORAGE_ADMIN_NOT_CONFIGURED");
  }

  const uploadId = randomUUID();
  const safeName = sanitizeFileName(params.fileName);
  const storagePath = `restaurants/${rid}/supplier-invoice-uploads/${uploadId}_${safeName}`;
  const uploadedAt = new Date().toISOString();
  const mimeType = params.mimeType.trim() || "application/octet-stream";

  const file = bucket.file(storagePath);
  await file.save(params.buffer, {
    resumable: false,
    metadata: {
      contentType: mimeType,
      metadata: {
        uploadedAt,
        uploadedBy: uid,
        mimeType,
        filename: safeName,
        restaurantId: rid,
      },
    },
  });

  return {
    storagePath,
    filename: safeName,
    mimeType,
    uploadedAt,
    uploadedBy: uid,
  };
}
