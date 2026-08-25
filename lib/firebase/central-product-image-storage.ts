import { FirebaseError } from "firebase/app";
import { doc, runTransaction, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  buildManualProductImageEnrichment,
  buildPendingAutomaticProductImageEnrichment,
  canAutomaticallyReplaceProductImage,
  readProductImageEnrichment,
  type ProductImageSource,
} from "@/lib/carta/product-image-enrichment";
import { auth, db, storage } from "@/lib/firebase/client";
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

function centralProductRef(restaurantId: string, productId: string) {
  return doc(db, "restaurants", restaurantId, "products", productId);
}

function readStoredImagePath(data: Record<string, unknown>): string | undefined {
  return typeof data.imagePath === "string" && data.imagePath.trim()
    ? data.imagePath.trim()
    : undefined;
}

function readStoredImageUrl(data: Record<string, unknown>): string | undefined {
  return typeof data.imageUrl === "string" && data.imageUrl.trim()
    ? data.imageUrl.trim()
    : undefined;
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

async function uploadCentralProductImageFile(
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

/**
 * Vía manual actual. Además de subir el archivo, registra procedencia manual,
 * aprobación y bloqueo para que ningún enriquecimiento automático pueda pisarlo.
 */
export async function uploadCentralProductImage(
  restaurantId: string,
  productId: string,
  file: File,
): Promise<{ path: string; url: string }> {
  const rid = assertRestaurantId(restaurantId);
  const pid = assertProductId(productId);
  const au = auth.currentUser;
  if (!au) throw new Error("[Storage/auth] No hay usuario autenticado");

  const up = await uploadCentralProductImageFile(rid, pid, file);
  try {
    const now = Date.now();
    await updateDoc(centralProductRef(rid, pid), {
      imageUrl: up.url,
      imagePath: up.path,
      imageEnrichment: buildManualProductImageEnrichment({
        reviewedAt: now,
        reviewedBy: au.uid,
      }),
      updatedAt: now,
      updatedBy: au.uid,
    });
    return up;
  } catch (e) {
    await deleteCentralProductImageAtPath(up.path);
    throw e;
  }
}

export type AutomaticCentralProductImageInput = {
  source: Exclude<ProductImageSource, "manual">;
  confidence?: number;
  provider?: string;
  externalReference?: string;
};

export type AutomaticCentralProductImageResult =
  | { attached: true; path: string; url: string; replacedImagePath?: string }
  | { attached: false; reason: "protected_existing_image" };

/**
 * Única vía admitida para imágenes automáticas.
 *
 * El archivo se sube primero y la decisión final de reemplazo se toma dentro de
 * una transacción Firestore. Si mientras tanto un usuario sube o aprueba una
 * foto, la transacción observa ese estado y descarta la automática.
 */
export async function uploadAndAttachAutomaticCentralProductImage(
  restaurantId: string,
  productId: string,
  file: File,
  input: AutomaticCentralProductImageInput,
): Promise<AutomaticCentralProductImageResult> {
  const rid = assertRestaurantId(restaurantId);
  const pid = assertProductId(productId);
  const au = auth.currentUser;
  if (!au) throw new Error("[Storage/auth] No hay usuario autenticado");

  const productRef = centralProductRef(rid, pid);

  const initialSnap = await runTransaction(db, async (transaction) =>
    transaction.get(productRef),
  );
  if (!initialSnap.exists()) throw new Error("PRODUCT_NOT_FOUND");
  const initialData = initialSnap.data() as Record<string, unknown>;
  if (
    !canAutomaticallyReplaceProductImage({
      imageUrl: readStoredImageUrl(initialData),
      imagePath: readStoredImagePath(initialData),
      imageEnrichment: readProductImageEnrichment(initialData.imageEnrichment),
    })
  ) {
    return { attached: false, reason: "protected_existing_image" };
  }

  const up = await uploadCentralProductImageFile(rid, pid, file);
  let replacedImagePath: string | undefined;
  try {
    const attached = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(productRef);
      if (!snap.exists()) throw new Error("PRODUCT_NOT_FOUND");
      const data = snap.data() as Record<string, unknown>;
      const currentImagePath = readStoredImagePath(data);
      const allowed = canAutomaticallyReplaceProductImage({
        imageUrl: readStoredImageUrl(data),
        imagePath: currentImagePath,
        imageEnrichment: readProductImageEnrichment(data.imageEnrichment),
      });
      if (!allowed) return false;

      const now = Date.now();
      transaction.update(productRef, {
        imageUrl: up.url,
        imagePath: up.path,
        imageEnrichment: buildPendingAutomaticProductImageEnrichment({
          ...input,
          generatedAt: now,
        }),
        updatedAt: now,
        updatedBy: au.uid,
      });
      replacedImagePath = currentImagePath;
      return true;
    });

    if (!attached) {
      await deleteCentralProductImageAtPath(up.path);
      return { attached: false, reason: "protected_existing_image" };
    }
  } catch (e) {
    await deleteCentralProductImageAtPath(up.path);
    throw e;
  }

  if (replacedImagePath && replacedImagePath !== up.path) {
    await deleteCentralProductImageAtPath(replacedImagePath);
  }

  return {
    attached: true,
    path: up.path,
    url: up.url,
    ...(replacedImagePath ? { replacedImagePath } : {}),
  };
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
