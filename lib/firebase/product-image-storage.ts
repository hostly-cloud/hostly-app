import { FirebaseError } from "firebase/app";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/lib/firebase/client";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  validateProductImageCandidate,
} from "@/lib/firebase/product-image-contract";

export { MAX_PRODUCT_IMAGE_BYTES } from "@/lib/firebase/product-image-contract";
const UPLOAD_TIMEOUT_MS = 120_000;

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

/**
 * Copia estable en RAM: leer el `File` del picker en el mismo tick que `onChange`
 * (evita que Android revoque el URI antes del submit).
 */
export async function createStableImageFile(selected: File): Promise<File> {
  console.log("[MOBILE IMAGE] file selected", selected.name, selected.type, selected.size);
  validateProductImageCandidate(selected);
  let buffer: ArrayBuffer;
  try {
    buffer = await selected.arrayBuffer();
  } catch (e) {
    const r = notReadableMessage(e);
    throw new Error(r ?? (e instanceof Error ? e.message : String(e)));
  }
  const stableFile = new File([buffer], selected.name, {
    type:
      selected.type && selected.type.startsWith("image/")
        ? selected.type
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
