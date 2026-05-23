import { FirebaseError } from "firebase/app";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/lib/firebase/client";

export const MAX_MENU_IMPORT_FILE_BYTES = 12 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 120_000;

const ALLOWED_IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i;
const ALLOWED_PDF_EXT = /\.pdf$/i;

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
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
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
  const byImageType = file.type.startsWith("image/");
  const byPdfType = file.type === "application/pdf";
  const byImageName = ALLOWED_IMAGE_EXT.test(file.name);
  const byPdfName = ALLOWED_PDF_EXT.test(file.name);

  if (sourceType === "image") {
    if (!byImageType && !byImageName) {
      throw new Error("El archivo debe ser una imagen (PNG, JPEG, WebP…)");
    }
  } else if (sourceType === "pdf") {
    if (!byPdfType && !byPdfName && !byImageType && !byImageName) {
      throw new Error("El archivo debe ser PDF o captura de imagen");
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

export type UploadMenuImportFileResult = {
  path: string;
  downloadUrl: string;
  originalFileName: string;
};

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

  const originalFileName = sanitizeFileName(input.file.name);
  const path = buildMenuImportStoragePath(rid, did, originalFileName);
  const storageRef = ref(storage, path);

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
    return { path, downloadUrl, originalFileName };
  } catch (e) {
    throw storageErr("uploadMenuImportFile", e);
  }
}
