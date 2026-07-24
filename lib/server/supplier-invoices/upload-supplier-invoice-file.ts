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

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export function supplierInvoiceFileSignatureMatches(
  bytes: Uint8Array,
  mimeType: string,
): boolean {
  const mime = mimeType.trim().toLowerCase();
  if (mime === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (mime === "image/png") {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mime === "image/gif") {
    const header = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
    return header === "GIF87a" || header === "GIF89a";
  }
  if (mime === "image/webp") {
    return (
      Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
    );
  }
  if (mime === "application/pdf") {
    return Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
  }
  return false;
}

export function validateSupplierInvoiceUploadFile(params: {
  fileName: string;
  mimeType: string;
  size: number;
  bytes?: Uint8Array;
}): void {
  const mime = params.mimeType.trim().toLowerCase() || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }

  if (params.size <= 0) {
    throw new Error("FILE_EMPTY");
  }
  if (params.size > MAX_SUPPLIER_INVOICE_UPLOAD_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }
  if (params.bytes && !supplierInvoiceFileSignatureMatches(params.bytes, mime)) {
    throw new Error("FILE_SIGNATURE_MISMATCH");
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
    bytes: params.buffer,
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
