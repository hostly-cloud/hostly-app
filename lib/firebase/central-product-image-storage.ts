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
    throw new Error("[Storage/central-product] restaurantId inválido");
  }
  return rid;
}

function assertProductId(productId: string): string {
  const pid = productId.trim();
  if (!pid || pid.includes("/") || pid.includes("..")) {
    throw new Error("[Storage/central-product] productId inválido");
  }
  return pid;
}

function sanitizeFileName(originalName: string): string {
  const base =
    typeof originalName === "string" && originalName.trim() !== ""
      ? originalName.trim()
      : "imagen";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

/** Catálogo central: `restaurants/{restaurantId}/products/{productId}/{file}`. */
export function buildCentralProductImagePath(
  restaurantId: string,
  productId: string,
  originalName: string,
): string {
  const rid = assertRestaurantId(restaurantId);
  const pid = assertProductId(productId);
  const safeName = sanitizeFileName(originalName);
  return `restaurants/${rid}/products/${pid}/${Date.now()}-${safeName}`;
}

export async function uploadCentralProductImage(
  restaurantId: string,
  productId: string,
  file: File,
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

  validateProductImageFile(file);
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error("La imagen supera 3 MB");
  }

  const path = buildCentralProductImagePath(restaurantId, productId, file.name);
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
    return { path, url };
  } catch (e) {
    throw storageErr("uploadCentralProductImage", e);
  }
}

export async function deleteCentralProductImageAtPath(
  path: string | undefined,
): Promise<void> {
  const trimmed = path?.trim();
  if (!trimmed) return;
  try {
    await deleteObject(ref(storage, trimmed));
  } catch {
    /* ignorar si ya no existe */
  }
}
