import { FirebaseError } from "firebase/app";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/lib/firebase/client";
import {
  MAX_MENU_IMPORT_SOURCE_FILES,
  type MenuImportSourceFile,
} from "@/lib/carta/menu-import-source-files";

export const MAX_MENU_IMPORT_FILE_BYTES = 12 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 120_000;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function storageErr(phase: string, e: unknown): Error {
  if (e instanceof FirebaseError) {
    return new Error(`[Storage/${phase}] ${e.code}: ${e.message}`);
  }
  if (e instanceof Error) return new Error(`[Storage/${phase}] ${e.message}`);
  return new Error(`[Storage/${phase}] ${String(e)}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[Storage/${label}] timeout tras ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function sanitizeFileName(originalName: string): string {
  const base =
    typeof originalName === "string" && originalName.trim() !== ""
      ? originalName.trim()
      : "archivo";
  const sanitized = base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 120);
  return sanitized === "." ? "archivo" : sanitized;
}

function assertAuthUser(userId: string): void {
  const au = auth.currentUser;
  if (!au) {
    throw new Error("[Storage/auth] No hay usuario autenticado");
  }
  if (au.uid !== userId.trim()) {
    throw new Error("[Storage/auth] UID de sesión no coincide");
  }
}

function assertRestaurantId(restaurantId: string): string {
  const rid = restaurantId.trim();
  if (!rid) {
    throw new Error("[Storage/menu-import] restaurantId obligatorio");
  }
  return rid;
}

function assertDraftId(draftId: string): string {
  const did = draftId.trim();
  if (!did || did.includes("/") || did.includes("..")) {
    throw new Error("[Storage/menu-import] draftId inválido");
  }
  return did;
}

export function validateMenuImportFile(file: File, sourceType: "image" | "pdf"): void {
  const byImageType = ALLOWED_IMAGE_MIME_TYPES.has(file.type.toLowerCase());
  const byPdfType = file.type === "application/pdf";

  if (sourceType === "image") {
    if (!byImageType) {
      throw new Error("El archivo debe ser JPEG, PNG, WebP o GIF");
    }
  } else if (sourceType === "pdf") {
    if (!byPdfType && !byImageType) {
      throw new Error("El archivo debe ser PDF, JPEG, PNG, WebP o GIF");
    }
  }

  if (file.size > MAX_MENU_IMPORT_FILE_BYTES) {
    throw new Error("El archivo supera 12 MB");
  }
  if (file.size <= 0) {
    throw new Error("El archivo está vacío");
  }
}

/**
 * Ruta canónica tenant-safe. No acepta paths externos del cliente.
 */
export function buildMenuImportStoragePath(
  restaurantId: string,
  draftId: string,
  originalFileName: string,
): string {
  const rid = assertRestaurantId(restaurantId);
  const did = assertDraftId(draftId);
  const safeName = sanitizeFileName(originalFileName);
  return `restaurants/${rid}/menu-imports/${did}/${safeName}`;
}

export function buildMenuImportBatchStoragePath(
  restaurantId: string,
  draftId: string,
  order: number,
  originalFileName: string,
): string {
  const rid = assertRestaurantId(restaurantId);
  const did = assertDraftId(draftId);
  const safeName = sanitizeFileName(originalFileName);
  const safeOrder = Math.max(0, Math.floor(order));
  const prefix = String(safeOrder + 1).padStart(3, "0");
  return `restaurants/${rid}/menu-imports/${did}/pages/${prefix}-${safeName}`;
}

export type UploadMenuImportFileResult = {
  path: string;
  downloadUrl: string;
  originalFileName: string;
};

async function uploadToPath(input: {
  path: string;
  file: File;
  sourceType: "image" | "pdf";
}): Promise<UploadMenuImportFileResult> {
  const storageRef = ref(storage, input.path);
  const originalFileName = sanitizeFileName(input.file.name);
  const contentType =
    input.file.type && input.file.type.trim() !== ""
      ? input.file.type
      : input.sourceType === "pdf"
        ? "application/pdf"
        : "image/jpeg";

  try {
    await withTimeout(
      uploadBytes(storageRef, input.file, { contentType }),
      UPLOAD_TIMEOUT_MS,
      "uploadBytes",
    );
    const downloadUrl = await withTimeout(
      getDownloadURL(storageRef),
      UPLOAD_TIMEOUT_MS,
      "getDownloadURL",
    );
    return { path: input.path, downloadUrl, originalFileName };
  } catch (e) {
    throw storageErr("uploadMenuImportFile", e);
  }
}

export async function uploadMenuImportFile(input: {
  restaurantId: string;
  draftId: string;
  file: File;
  userId: string;
  sourceType: "image" | "pdf";
}): Promise<UploadMenuImportFileResult> {
  const rid = assertRestaurantId(input.restaurantId);
  const did = assertDraftId(input.draftId);
  assertAuthUser(input.userId);
  validateMenuImportFile(input.file, input.sourceType);

  try {
    await auth.currentUser!.getIdToken(true);
  } catch (e) {
    throw storageErr("getIdToken", e);
  }

  return uploadToPath({
    path: buildMenuImportStoragePath(rid, did, input.file.name),
    file: input.file,
    sourceType: input.sourceType,
  });
}

export async function uploadMenuImportFiles(input: {
  restaurantId: string;
  draftId: string;
  files: File[];
  userId: string;
}): Promise<{ sources: MenuImportSourceFile[]; downloadUrls: string[] }> {
  const rid = assertRestaurantId(input.restaurantId);
  const did = assertDraftId(input.draftId);
  assertAuthUser(input.userId);
  if (input.files.length < 1) {
    throw new Error("Selecciona al menos una imagen de la carta");
  }
  if (input.files.length > MAX_MENU_IMPORT_SOURCE_FILES) {
    throw new Error(`Puedes subir hasta ${MAX_MENU_IMPORT_SOURCE_FILES} imágenes por importación`);
  }

  for (const file of input.files) validateMenuImportFile(file, "image");

  try {
    await auth.currentUser!.getIdToken(true);
  } catch (e) {
    throw storageErr("getIdToken", e);
  }

  const sources: MenuImportSourceFile[] = [];
  const downloadUrls: string[] = [];
  for (let index = 0; index < input.files.length; index += 1) {
    const file = input.files[index];
    const result = await uploadToPath({
      path: buildMenuImportBatchStoragePath(rid, did, index, file.name),
      file,
      sourceType: "image",
    });
    sources.push({
      storagePath: result.path,
      originalFileName: result.originalFileName,
      sourceType: "image",
      order: index,
    });
    downloadUrls.push(result.downloadUrl);
  }

  return { sources, downloadUrls };
}
