import { FirebaseError } from "firebase/app";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/lib/firebase/client";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  validateProductImageFile,
} from "@/lib/firebase/product-image-storage";

const UPLOAD_TIMEOUT_MS = 120_000;

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

function assertRestaurantId(restaurantId: string): string {
  const rid = restaurantId.trim();
  if (!rid || rid.includes("/") || rid.includes("..")) {
    throw new Error("[Storage/restaurant-logo] restaurantId inválido");
  }
  return rid;
}

function logoExtension(file: File): string {
  const type = file.type?.toLowerCase() ?? "";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return "jpg";
}

/** `restaurant-logos/{restaurantId}/logo.{ext}` */
export function buildRestaurantLogoStoragePath(restaurantId: string, file: File): string {
  const rid = assertRestaurantId(restaurantId);
  return `restaurant-logos/${rid}/logo.${logoExtension(file)}`;
}

export async function deleteRestaurantLogoAtPath(path: string | undefined): Promise<void> {
  const trimmed = path?.trim();
  if (!trimmed) return;
  try {
    await deleteObject(ref(storage, trimmed));
  } catch {
    /* ignorar si ya no existe */
  }
}

export async function uploadRestaurantLogo(
  restaurantId: string,
  file: File,
  previousPath?: string,
): Promise<{ path: string; url: string }> {
  const au = auth.currentUser;
  if (!au) {
    throw new Error("[Storage/auth] No hay usuario autenticado");
  }
  try {
    await au.getIdToken(true);
  } catch (e) {
    throw storageErr("getIdToken", e);
  }

  if (
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
      file.type.toLowerCase(),
    )
  ) {
    throw new Error("El logo debe ser JPEG, PNG, WebP o GIF");
  }
  validateProductImageFile(file);
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error("La imagen supera 3 MB");
  }

  const path = buildRestaurantLogoStoragePath(restaurantId, file);
  const storageRef = ref(storage, path);
  const contentType =
    file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";

  try {
    await withTimeout(
      uploadBytes(storageRef, file, { contentType }),
      UPLOAD_TIMEOUT_MS,
      "uploadBytes",
    );
    const url = await withTimeout(
      getDownloadURL(storageRef),
      UPLOAD_TIMEOUT_MS,
      "getDownloadURL",
    );
    const prev = previousPath?.trim();
    if (prev && prev !== path) {
      await deleteRestaurantLogoAtPath(prev);
    }
    return { path, url };
  } catch (e) {
    throw storageErr("uploadRestaurantLogo", e);
  }
}
