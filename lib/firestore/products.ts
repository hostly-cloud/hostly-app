import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  deleteProductImageAtPath,
  uploadProductImage,
} from "@/lib/firebase/product-image-storage";
import type { UserRestaurantRole } from "@/lib/firestore/user-restaurant-profile";
import type { Product } from "@/types/product";

export const ONLY_OWNER_CAN_DELETE = "ONLY_OWNER_CAN_DELETE";

export type ProductWrite = {
  nombre: string;
  categoria: string;
  precio: number | null;
  preparationArea: string;
};

function rethrowWithMessage(e: unknown): never {
  if (e instanceof FirebaseError) {
    throw new Error(`${e.code}: ${e.message}`);
  }
  if (e instanceof Error) throw e;
  throw new Error(String(e));
}

function readCreatedAtMs(data: Record<string, unknown>): number | undefined {
  const c = data.createdAt;
  if (typeof c === "number" && Number.isFinite(c)) return c;
  if (c instanceof Timestamp) return c.toMillis();
  return undefined;
}

export const UNAUTHORIZED_PRODUCT_ACCESS = "UNAUTHORIZED_PRODUCT_ACCESS";

/**
 * Valida tenant: `restaurantId` del documento debe coincidir con el activo, o bien
 * documento legado sin `restaurantId` con `userId` igual al tenant (dueño antiguo).
 */
function assertProductRestaurantAccess(
  data: Record<string, unknown>,
  activeRestaurantId: string,
): void {
  const rid = activeRestaurantId.trim();
  const docRid =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  if (docRid !== "") {
    if (docRid === rid) return;
    throw new Error(UNAUTHORIZED_PRODUCT_ACCESS);
  }
  const uid = typeof data.userId === "string" ? data.userId.trim() : "";
  if (uid === rid) return;
  throw new Error(UNAUTHORIZED_PRODUCT_ACCESS);
}

function mapDocToProduct(d: QueryDocumentSnapshot): Product {
  const data = d.data() as Record<string, unknown>;
  const rawNombre = data.nombre;
  const nombre =
    rawNombre !== undefined &&
    rawNombre !== null &&
    String(rawNombre).trim() !== ""
      ? String(rawNombre).trim()
      : "Sin nombre";
  const categoriaRaw =
    data.categoria !== undefined && data.categoria !== null
      ? String(data.categoria).trim()
      : "";
  const categoria = categoriaRaw || "Sin categoría";
  const rawPrecio = data.precio;
  const precio =
    typeof rawPrecio === "number" && Number.isFinite(rawPrecio)
      ? rawPrecio
      : Number.NaN;
  const createdAt = readCreatedAtMs(data);
  const userId =
    typeof data.userId === "string" && data.userId.trim() !== ""
      ? data.userId.trim()
      : undefined;
  const restaurantIdRaw = data.restaurantId;
  const restaurantId =
    typeof restaurantIdRaw === "string" && restaurantIdRaw.trim() !== ""
      ? restaurantIdRaw.trim()
      : undefined;
  const imageUrlRaw = data.imageUrl;
  const imageUrl =
    typeof imageUrlRaw === "string" && imageUrlRaw.trim() !== ""
      ? imageUrlRaw.trim()
      : undefined;
  const imagePathRaw = data.imagePath;
  const imagePath =
    typeof imagePathRaw === "string" && imagePathRaw.trim() !== ""
      ? imagePathRaw.trim()
      : undefined;
  const categoryIdRaw = data.categoryId;
  const categoryId =
    typeof categoryIdRaw === "string" && categoryIdRaw.trim() !== ""
      ? categoryIdRaw.trim()
      : undefined;
  const preparationAreaRaw = data.preparationArea;
  const preparationArea =
    typeof preparationAreaRaw === "string" && preparationAreaRaw.trim() !== ""
      ? preparationAreaRaw.trim()
      : "cocina";
  return {
    id: d.id,
    nombre,
    categoria,
    categoryId,
    precio,
    preparationArea,
    createdAt,
    userId,
    restaurantId,
    imageUrl,
    imagePath,
  };
}

function isMissingFirestoreIndexError(e: unknown): boolean {
  if (e instanceof FirebaseError) {
    if (e.code === "failed-precondition") return true;
    if (/index/i.test(String(e.message))) return true;
  }
  return false;
}

/**
 * Productos del tenant: principalmente `restaurantId == activeRestaurantId`.
 * Fallback legado: `userId == activeRestaurantId` (sin `restaurantId` o vacío).
 */
export async function getProducts(activeRestaurantId: string): Promise<Product[]> {
  if (!activeRestaurantId) {
    throw new Error("MISSING_RESTAURANT_ID");
  }
  if (!activeRestaurantId.trim()) return [];
  const rid = activeRestaurantId.trim();
  const col = collection(db, "productos");
  const merged = new Map<string, QueryDocumentSnapshot>();

  const withOrder = query(col, where("restaurantId", "==", rid), orderBy("createdAt", "desc"));
  try {
    const snap = await getDocs(withOrder);
    for (const d of snap.docs) merged.set(d.id, d);
  } catch (e) {
    if (!isMissingFirestoreIndexError(e)) throw e;
    const basic = query(col, where("restaurantId", "==", rid));
    const snap = await getDocs(basic);
    for (const d of snap.docs) merged.set(d.id, d);
  }

  const byUserSnap = await getDocs(query(col, where("userId", "==", rid)));
  for (const d of byUserSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const r =
      typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
    if (r !== "" && r !== rid) continue;
    merged.set(d.id, d);
  }

  const list = [...merged.values()].map(mapDocToProduct);
  list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return list;
}

export async function addProduct(
  data: ProductWrite,
  activeRestaurantId: string,
  authUserId: string,
  imageFile?: File | null,
): Promise<void> {
  console.log("[PRODUCTS] addProduct start");
  if (!activeRestaurantId.trim()) {
    throw new Error("addProduct: restaurantId no disponible");
  }
  const uid = String(authUserId ?? "").trim();
  if (!uid) {
    throw new Error("addProduct: userId (auth) no disponible");
  }
  const rid = activeRestaurantId.trim();
  let imageUrl: string | undefined;
  let imagePath: string | undefined;
  let uploadedPath: string | undefined;
  try {
    if (imageFile) {
      console.log("[PRODUCTS] uploading image");
      const up = await uploadProductImage(rid, imageFile);
      imageUrl = up.url;
      imagePath = up.path;
      uploadedPath = up.path;
      console.log("[PRODUCTS] image uploaded");
    }
    const payload: Record<string, unknown> = {
      nombre: data.nombre,
      categoria: data.categoria,
      precio: data.precio,
      preparationArea: data.preparationArea,
      userId: uid,
      restaurantId: rid,
      createdAt: serverTimestamp(),
    };
    if (imageUrl && imagePath) {
      payload.imageUrl = imageUrl;
      payload.imagePath = imagePath;
    }
    if (!activeRestaurantId) {
      throw new Error("MISSING_RESTAURANT_ID");
    }
    console.log("[PRODUCTS] firestore save start");
    try {
      await addDoc(collection(db, "productos"), payload as DocumentData);
    } catch (e) {
      rethrowWithMessage(e);
    }
    console.log("[PRODUCTS] firestore save success");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("[PRODUCTS] addProduct error", msg);
    if (uploadedPath) {
      await deleteProductImageAtPath(uploadedPath);
    }
    throw e instanceof Error ? e : new Error(msg);
  }
}

export async function updateProduct(
  id: string,
  data: ProductWrite,
  activeRestaurantId: string,
  imageFile?: File | null,
): Promise<void> {
  if (!activeRestaurantId) {
    throw new Error("MISSING_RESTAURANT_ID");
  }
  if (!activeRestaurantId.trim()) {
    throw new Error("updateProduct: restaurantId no disponible");
  }
  const rid = activeRestaurantId.trim();
  const ref = doc(db, "productos", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Producto no encontrado");
  const existing = snap.data() as Record<string, unknown>;
  assertProductRestaurantAccess(existing, rid);
  const needsRestaurantBackfill =
    !(typeof existing.restaurantId === "string" && existing.restaurantId.trim() !== "");

  const prevPath =
    typeof existing.imagePath === "string" && existing.imagePath.trim() !== ""
      ? existing.imagePath.trim()
      : undefined;

  let newUploadedPath: string | undefined;
  try {
    if (imageFile) {
      let up: { path: string; url: string };
      try {
        up = await uploadProductImage(rid, imageFile);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log("[PRODUCTS] updateProduct error", msg);
        throw new Error(msg);
      }
      newUploadedPath = up.path;
      console.log("[PRODUCTS] firestore save start");
      try {
        const patch: Record<string, unknown> = {
          nombre: data.nombre,
          categoria: data.categoria,
          precio: data.precio,
          preparationArea: data.preparationArea,
          imageUrl: up.url,
          imagePath: up.path,
        };
        if (needsRestaurantBackfill) patch.restaurantId = rid;
        await updateDoc(ref, patch as DocumentData);
      } catch (e) {
        await deleteProductImageAtPath(newUploadedPath);
        rethrowWithMessage(e);
      }
      console.log("[PRODUCTS] firestore save success");
      if (prevPath && prevPath !== up.path) {
        await deleteProductImageAtPath(prevPath);
      }
    } else {
      console.log("[PRODUCTS] firestore save start");
      try {
        const patch: Record<string, unknown> = {
          nombre: data.nombre,
          categoria: data.categoria,
          precio: data.precio,
          preparationArea: data.preparationArea,
        };
        if (needsRestaurantBackfill) patch.restaurantId = rid;
        await updateDoc(ref, patch as DocumentData);
      } catch (e) {
        rethrowWithMessage(e);
      }
      console.log("[PRODUCTS] firestore save success");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("[PRODUCTS] updateProduct error", msg);
    throw e instanceof Error ? e : new Error(msg);
  }
}

export async function deleteProduct(
  id: string,
  activeRestaurantId: string,
  actorRole: UserRestaurantRole,
): Promise<void> {
  if (!activeRestaurantId) {
    throw new Error("MISSING_RESTAURANT_ID");
  }
  if (actorRole !== "owner") {
    throw new Error(ONLY_OWNER_CAN_DELETE);
  }
  if (!activeRestaurantId.trim()) {
    throw new Error("deleteProduct: restaurantId no disponible");
  }
  const rid = activeRestaurantId.trim();
  const ref = doc(db, "productos", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Producto no encontrado");
  const existing = snap.data() as Record<string, unknown>;
  assertProductRestaurantAccess(existing, rid);
  const imagePath =
    typeof existing.imagePath === "string" && existing.imagePath.trim() !== ""
      ? existing.imagePath.trim()
      : undefined;
  if (imagePath) {
    await deleteProductImageAtPath(imagePath);
  }
  await deleteDoc(ref);
}
