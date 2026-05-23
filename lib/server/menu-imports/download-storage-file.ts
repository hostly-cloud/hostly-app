import { getHostlyStorageBucket } from "@/lib/firebase/admin";
import { MAX_MENU_IMPORT_OCR_BYTES, MAX_STORED_RAW_TEXT_CHARS } from "./menu-import-limits";

export type DownloadedStorageFile = {
  buffer: Buffer;
  contentType: string;
  size: number;
};

function inferContentType(path: string, metadataType?: string): string {
  if (metadataType?.trim()) return metadataType.trim().toLowerCase();
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

function assertSafeStoragePath(storagePath: string): string {
  const path = storagePath.trim();
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    throw new Error("Ruta Storage inválida");
  }
  if (!path.startsWith("restaurants/") || !path.includes("/menu-imports/")) {
    throw new Error("Ruta Storage fuera del prefijo permitido de importación");
  }
  return path;
}

export async function downloadMenuImportStorageFile(storagePath: string): Promise<DownloadedStorageFile> {
  const safePath = assertSafeStoragePath(storagePath);
  const bucket = getHostlyStorageBucket();
  if (!bucket) {
    throw new Error("Storage Admin no configurado en servidor");
  }

  const file = bucket.file(safePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error("Archivo no encontrado en Storage");
  }

  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  if (size > MAX_MENU_IMPORT_OCR_BYTES) {
    throw new Error(`Archivo demasiado grande para OCR (máx. ${MAX_MENU_IMPORT_OCR_BYTES / (1024 * 1024)} MB)`);
  }

  const [buffer] = await file.download({ validation: false });
  if (buffer.length > MAX_MENU_IMPORT_OCR_BYTES) {
    throw new Error("Archivo descargado supera el límite permitido");
  }

  return {
    buffer,
    contentType: inferContentType(safePath, metadata.contentType),
    size: buffer.length,
  };
}

export function truncateRawTextForStorage(rawText: string): { text: string; truncated: boolean } {
  const normalized = rawText.trim();
  if (normalized.length <= MAX_STORED_RAW_TEXT_CHARS) {
    return { text: normalized, truncated: false };
  }
  return {
    text: normalized.slice(0, MAX_STORED_RAW_TEXT_CHARS),
    truncated: true,
  };
}
