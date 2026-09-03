import { FirebaseError } from "firebase/app";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/lib/firebase/client";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  validateProductImageCandidate,
} from "@/lib/firebase/product-image-contract";

export { MAX_PRODUCT_IMAGE_BYTES } from "@/lib/firebase/product-image-contract";
const UPLOAD_TIMEOUT_MS = 120_000;
const PRODUCT_IMAGE_TARGET_BYTES = Math.floor(MAX_PRODUCT_IMAGE_BYTES * 0.9);
const PRODUCT_IMAGE_MAX_EDGE = 1600;
const RESIZABLE_PRODUCT_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function storageErr(phase: string, e: unknown): Error {
  if (e instanceof FirebaseError) {
    return new Error(`[Storage/${phase}] ${e.code}: ${e.message}`);
  }
  if (e instanceof Error) return new Error(`[Storage/${phase}] ${e.message}`);
  return new Error(`[Storage/${phase}] ${String(e)}`);
}

function notReadableMessage(e: unknown): string | null {
  if (e instanceof DOMException && e.name === "NotReadableError") {
    return "No se pudo leer la imagen en este dispositivo (archivo bloqueado o sin permiso). Prueba desde Galería, otra foto, o guardar la imagen antes en Descargas.";
  }
  const t =
    e instanceof Error
      ? e.message
      : e instanceof DOMException
        ? e.message
        : String(e);
  if (/could not be read|permission problems|NotReadableError/i.test(t)) {
    return "No se pudo leer la imagen en el móvil. Vuelve a elegirla desde la galería o usa un archivo guardado en el teléfono (evita “recientes” del selector si falla).";
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[Storage/${label}] timeout tras ${ms}ms (revisa red, CORS o reglas)`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se pudo preparar la imagen para subirla"));
      },
      type,
      quality,
    );
  });
}

async function normalizeLargeProductImage(selected: File): Promise<File> {
  if (selected.size <= MAX_PRODUCT_IMAGE_BYTES) return selected;

  const sourceType = selected.type.trim().toLowerCase();
  if (!RESIZABLE_PRODUCT_IMAGE_TYPES.has(sourceType)) {
    validateProductImageCandidate(selected);
    return selected;
  }
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    validateProductImageCandidate(selected);
    return selected;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(selected);
  } catch (e) {
    const readable = notReadableMessage(e);
    throw new Error(
      readable ??
        "La foto es demasiado grande y este navegador no ha podido optimizarla. Prueba con otra imagen o una captura de pantalla.",
    );
  }

  try {
    const sourceMaxEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, PRODUCT_IMAGE_MAX_EDGE / Math.max(sourceMaxEdge, 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("No se pudo preparar la imagen para subirla");
    }
    context.drawImage(bitmap, 0, 0, width, height);

    const outputType = sourceType === "image/png" ? "image/webp" : sourceType;
    let bestBlob: Blob | null = null;
    for (const quality of [0.88, 0.8, 0.72, 0.64, 0.56]) {
      const blob = await canvasToBlob(canvas, outputType, quality);
      bestBlob = blob;
      if (blob.size <= PRODUCT_IMAGE_TARGET_BYTES) break;
    }

    if (!bestBlob || bestBlob.size > MAX_PRODUCT_IMAGE_BYTES) {
      throw new Error(
        "La foto sigue siendo demasiado grande después de optimizarla. Prueba con otra imagen o una captura de pantalla.",
      );
    }

    const baseName = selected.name.replace(/\.[^.]+$/, "") || "imagen";
    const extension = outputType === "image/webp" ? "webp" : "jpg";
    return new File([bestBlob], `${baseName}.${extension}`, {
      type: outputType,
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

/**
 * Copia estable en RAM: leer el `File` del picker en el mismo tick que `onChange`
 * (evita que Android revoque el URI antes del submit). Si una foto de móvil supera
 * el límite de Storage, la reducimos antes de validar el borrador estable.
 */
export async function createStableImageFile(selected: File): Promise<File> {
  console.log("[MOBILE IMAGE] file selected", selected.name, selected.type, selected.size);

  let normalized: File;
  try {
    normalized = await normalizeLargeProductImage(selected);
  } catch (e) {
    const r = notReadableMessage(e);
    throw new Error(r ?? (e instanceof Error ? e.message : String(e)));
  }

  validateProductImageCandidate(normalized);
  let buffer: ArrayBuffer;
  try {
    buffer = await normalized.arrayBuffer();
  } catch (e) {
    const r = notReadableMessage(e);
    throw new Error(r ?? (e instanceof Error ? e.message : String(e)));
  }
  const stableFile = new File([buffer], normalized.name, {
    type:
      normalized.type && normalized.type.startsWith("image/")
        ? normalized.type
        : "image/jpeg",
  });
  console.log("[MOBILE IMAGE] stable copy created", stableFile.name, stableFile.size);
  return stableFile;
}

export function validateProductImageFile(file: File): void {
  console.log("[IMAGE] validate start", file.name, file.type, file.size);
  validateProductImageCandidate(file);
  console.log("[IMAGE] validate ok", file.name, file.type, file.size);
}

export function buildProductImagePath(userId: string, originalName: string): string {
  const base =
    typeof originalName === "string" && originalName.trim() !== ""
      ? originalName.trim()
      : "imagen";
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return `productos/${userId}/${Date.now()}-${safe}`;
}

export async function uploadProductImage(
  userId: string,
  file: File,
): Promise<{ path: string; url: string }> {
  try {
    const au = auth.currentUser;
    if (!au) {
      throw new Error("[Storage/auth] No hay usuario autenticado (auth.currentUser es null)");
    }
    if (au.uid !== userId) {
      throw new Error(
        `[Storage/auth] UID distinto: auth=${au.uid}, esperado=${userId}`,
      );
    }
    try {
      await au.getIdToken(true);
    } catch (e) {
      throw storageErr("getIdToken", e);
    }

    validateProductImageFile(file);
    const path = buildProductImagePath(userId, file.name);
    const storageRef = ref(storage, path);
    const contentType =
      file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";

    console.log("[MOBILE IMAGE] upload start", path);
    try {
      await withTimeout(
        uploadBytes(storageRef, file, { contentType }),
        UPLOAD_TIMEOUT_MS,
        "uploadBytes",
      );
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      console.log("[MOBILE IMAGE] upload error", m);
      const readable = notReadableMessage(e);
      if (readable) throw new Error(readable);
      throw storageErr("uploadBytes", e);
    }
    console.log("[MOBILE IMAGE] upload success", path);

    console.log("[IMAGE] download url start", path);
    let url: string;
    try {
      url = await withTimeout(
        getDownloadURL(storageRef),
        UPLOAD_TIMEOUT_MS,
        "getDownloadURL",
      );
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      console.log("[MOBILE IMAGE] upload error", m);
      throw storageErr("getDownloadURL", e);
    }
    console.log("[IMAGE] download url success", path);
    return { path, url };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.log("[MOBILE IMAGE] upload error", m);
    if (e instanceof Error) throw e;
    throw new Error(m);
  }
}

export async function deleteProductImageAtPath(path: string | undefined): Promise<void> {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // ignorar si ya no existe
  }
}
