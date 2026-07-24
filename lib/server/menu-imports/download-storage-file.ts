import { getHostlyStorageBucket } from "@/lib/firebase/admin";
import { MAX_MENU_IMPORT_OCR_BYTES, MAX_STORED_RAW_TEXT_CHARS } from "./menu-import-limits";

export type DownloadedStorageFile = {
  buffer: Buffer;
  contentType: string;
  size: number;
};

export type MenuImportStorageScope = {
  restaurantId: string;
  draftId: string;
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
  if (storagePath !== storagePath.trim()) {
    throw new Error("Ruta Storage no canónica");
  }
  const path = storagePath;
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[%?#\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new Error("Ruta Storage inválida");
  }
  if (!path.startsWith("restaurants/") || !path.includes("/menu-imports/")) {
    throw new Error("Ruta Storage fuera del prefijo permitido de importación");
  }
  return path;
}

export function assertMenuImportStoragePathForDraft(
  storagePath: string,
  scope: MenuImportStorageScope,
): string {
  const path = assertSafeStoragePath(storagePath);
  if (
    scope.restaurantId !== scope.restaurantId.trim() ||
    scope.draftId !== scope.draftId.trim()
  ) {
    throw new Error("Scope Storage de importación inválido");
  }
  const restaurantId = scope.restaurantId;
  const draftId = scope.draftId;
  if (
    !restaurantId ||
    !draftId ||
    /[\\/%?#\u0000-\u001f\u007f]/.test(restaurantId) ||
    /[\\/%?#\u0000-\u001f\u007f]/.test(draftId)
  ) {
    throw new Error("Scope Storage de importación inválido");
  }
  const segments = path.split("/");
  const fileName = segments[4] ?? "";
  if (
    segments.length !== 5 ||
    segments[0] !== "restaurants" ||
    segments[1] !== restaurantId ||
    segments[2] !== "menu-imports" ||
    segments[3] !== draftId ||
    !/^[A-Za-z0-9._-]{1,120}$/.test(fileName) ||
    fileName === "." ||
    fileName.includes("..")
  ) {
    throw new Error("Ruta Storage fuera del tenant o borrador");
  }
  return path;
}

export async function downloadMenuImportStorageFile(
  storagePath: string,
  scope: MenuImportStorageScope,
): Promise<DownloadedStorageFile> {
  const safePath = assertMenuImportStoragePathForDraft(storagePath, scope);
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
