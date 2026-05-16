import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
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

export type ProductInventoryDocument = {
  enabled: boolean;
  unit: "kg" | "g" | "l" | "ml" | "ud";
  currentStock: number;
  minStock: number;
  costPerUnit: number;
  supplierName?: string;
  /**
   * Future-ready inventory image URL/path. Upload/AI photo ingestion is not
   * implemented in this phase; this field only reserves the product contract.
   */
  image?: string;
};

export type ProductRecipeIngredientDocument = {
  productId?: string;
  name?: string;
  unit?: string;
  quantity?: number;
  cost?: number;
};

export type ProductRecipeDocument = {
  enabled: boolean;
  ingredients: ProductRecipeIngredientDocument[];
};

export type ProductDocument = {
  id: string;
  name: string;
  categoryId: string | null;
  price: number | null;
  active: boolean;
  station: string | null;
  type: string | null;
  inventory: ProductInventoryDocument;
  recipe: ProductRecipeDocument;
  createdAt?: number;
  updatedAt?: number;
};

export type ProductInventoryWrite = {
  name: string | null;
  categoryId?: string | null;
  station?: string | null;
  active?: boolean;
  unit: "kg" | "g" | "l" | "ml" | "ud" | string;
  currentStock: number;
  minStock: number;
  costPerUnit: number;
  supplierName?: string;
  image?: string;
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

function readUpdatedAtMs(data: Record<string, unknown>): number | undefined {
  const c = data.updatedAt;
  if (typeof c === "number" && Number.isFinite(c)) return c;
  if (c instanceof Timestamp) return c.toMillis();
  return undefined;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function readFiniteNumberWithDefault(value: unknown, fallback = 0): number {
  const n = readFiniteNumber(value);
  return n == null ? fallback : n;
}

function normalizeInventoryUnit(value: unknown): ProductInventoryDocument["unit"] {
  if (
    value === "kg" ||
    value === "g" ||
    value === "l" ||
    value === "ml" ||
    value === "ud"
  ) {
    return value;
  }
  return "ud";
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

function centralProductsCollection(restaurantId: string) {
  return collection(db, "restaurants", restaurantId, "products");
}

function legacyInventoryProductsCollection(restaurantId: string) {
  return collection(db, "restaurants", restaurantId, "inventoryProducts");
}

function defaultInventory(): ProductInventoryDocument {
  return {
    enabled: false,
    unit: "ud",
    currentStock: 0,
    minStock: 0,
    costPerUnit: 0,
  };
}

function defaultRecipe(): ProductRecipeDocument {
  return {
    enabled: false,
    ingredients: [],
  };
}

function normalizeProductInventory(
  raw: Record<string, unknown>,
): ProductInventoryDocument {
  const supplierName =
    typeof raw.supplierName === "string" && raw.supplierName.trim() !== ""
      ? raw.supplierName.trim()
      : undefined;
  const image =
    typeof raw.image === "string" && raw.image.trim() !== ""
      ? raw.image.trim()
      : undefined;

  return {
    enabled: raw.enabled === true,
    unit: normalizeInventoryUnit(raw.unit),
    currentStock: readFiniteNumberWithDefault(raw.currentStock),
    minStock: readFiniteNumberWithDefault(raw.minStock ?? raw.minimumStock),
    costPerUnit: readFiniteNumberWithDefault(raw.costPerUnit ?? raw.averageCost),
    ...(supplierName ? { supplierName } : {}),
    ...(image ? { image } : {}),
  };
}

function mapCentralDocToProductDocument(
  snap: QueryDocumentSnapshot<DocumentData>,
): ProductDocument {
  const data = snap.data() as Record<string, unknown>;
  const inventoryRaw =
    data.inventory && typeof data.inventory === "object"
      ? (data.inventory as Record<string, unknown>)
      : {};
  const recipeRaw =
    data.recipe && typeof data.recipe === "object"
      ? (data.recipe as Record<string, unknown>)
      : {};

  const name =
    typeof data.name === "string" && data.name.trim() !== ""
      ? data.name.trim()
      : typeof data.nombre === "string" && data.nombre.trim() !== ""
        ? data.nombre.trim()
        : "Sin nombre";
  const station =
    typeof data.station === "string" && data.station.trim() !== ""
      ? data.station.trim()
      : typeof data.preparationArea === "string" && data.preparationArea.trim() !== ""
        ? data.preparationArea.trim()
        : null;
  const categoryId =
    typeof data.categoryId === "string" && data.categoryId.trim() !== ""
      ? data.categoryId.trim()
      : null;
  const type =
    typeof data.type === "string" && data.type.trim() !== ""
      ? data.type.trim()
      : null;
  const active = typeof data.active === "boolean" ? data.active : true;
  const price =
    readFiniteNumber(data.price) ??
    readFiniteNumber(data.precio) ??
    null;

  const ingredients = Array.isArray(recipeRaw.ingredients)
    ? (recipeRaw.ingredients as ProductRecipeIngredientDocument[])
    : [];

  return {
    id: snap.id,
    name,
    categoryId,
    price,
    active,
    station,
    type,
    inventory: normalizeProductInventory(inventoryRaw),
    recipe: {
      enabled: recipeRaw.enabled === true,
      ingredients,
    },
    createdAt: readCreatedAtMs(data),
    updatedAt: readUpdatedAtMs(data),
  };
}

export function listenCentralProducts(
  restaurantId: string,
  onData: (items: ProductDocument[]) => void,
  onListenError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  if (!rid || !auth.currentUser) {
    onData([]);
    return () => {};
  }

  return onSnapshot(
    query(centralProductsCollection(rid)),
    (snap) => {
      const list = snap.docs.map(mapCentralDocToProductDocument);
      list.sort((a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
      );
      onData(list);
    },
    (error) => {
      onListenError?.(error);
      onData([]);
    },
  );
}

function mapLegacyInventoryDocToProductDocument(
  snap: QueryDocumentSnapshot<DocumentData>,
): ProductDocument {
  const data = snap.data() as Record<string, unknown>;
  const name =
    typeof data.nombre === "string" && data.nombre.trim() !== ""
      ? data.nombre.trim()
      : "Sin nombre";
  const unit =
    typeof data.unidad === "string" && data.unidad.trim() !== ""
      ? data.unidad.trim()
      : "ud";

  return {
    id: snap.id,
    name,
    categoryId: null,
    price: null,
    active: true,
    station: null,
    type: null,
    inventory: {
      enabled: true,
      unit: normalizeInventoryUnit(unit),
      currentStock: readFiniteNumberWithDefault(data.stock_actual),
      minStock: readFiniteNumberWithDefault(data.stock_minimo),
      costPerUnit: readFiniteNumberWithDefault(data.coste_unitario),
    },
    recipe: defaultRecipe(),
  };
}

export function listenProductsForInventory(
  restaurantId: string,
  onData: (items: ProductDocument[]) => void,
  onListenError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  if (!rid || !auth.currentUser) {
    onData([]);
    return () => {};
  }

  let centralItems: ProductDocument[] = [];
  let legacyItems: ProductDocument[] = [];
  let centralReady = false;
  let legacyReady = false;

  const emit = () => {
    if (!centralReady || !legacyReady) return;
    const merged = new Map<string, ProductDocument>();
    const centralIds = new Set(centralItems.map((item) => item.id));
    for (const item of legacyItems) {
      if (!centralIds.has(item.id)) merged.set(item.id, item);
    }
    for (const item of centralItems) {
      if (item.inventory.enabled) merged.set(item.id, item);
    }
    const list = [...merged.values()];
    list.sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
    );
    onData(list);
  };

  const unsubs: Unsubscribe[] = [];
  unsubs.push(
    onSnapshot(
      query(centralProductsCollection(rid)),
      (snap) => {
        centralItems = snap.docs.map(mapCentralDocToProductDocument);
        centralReady = true;
        emit();
      },
      (error) => {
        onListenError?.(error);
        centralItems = [];
        centralReady = true;
        emit();
      },
    ),
  );
  unsubs.push(
    onSnapshot(
      query(legacyInventoryProductsCollection(rid)),
      (snap) => {
        legacyItems = snap.docs.map(mapLegacyInventoryDocToProductDocument);
        legacyReady = true;
        emit();
      },
      (error) => {
        onListenError?.(error);
        legacyItems = [];
        legacyReady = true;
        emit();
      },
    ),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

function centralInventoryPayload(
  restaurantId: string,
  payload: ProductInventoryWrite,
): DocumentData {
  const name = payload.name?.trim() || "Sin nombre";
  const categoryId = payload.categoryId?.trim() || null;
  const station = payload.station?.trim() || null;
  return {
    restaurantId,
    name,
    categoryId,
    station,
    active: payload.active ?? true,
    inventory: {
      enabled: true,
      unit: normalizeInventoryUnit(payload.unit),
      currentStock: payload.currentStock,
      minStock: payload.minStock,
      costPerUnit: payload.costPerUnit,
      ...(payload.supplierName?.trim()
        ? { supplierName: payload.supplierName.trim() }
        : {}),
      ...(payload.image?.trim() ? { image: payload.image.trim() } : {}),
    },
    recipe: defaultRecipe(),
    updatedAt: serverTimestamp(),
  } as DocumentData;
}

export async function upsertProductInventory(
  restaurantId: string,
  productId: string | null,
  payload: ProductInventoryWrite,
): Promise<string> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("upsertProductInventory: restaurantId no disponible");

  try {
    if (productId?.trim()) {
      const id = productId.trim();
      await setDoc(
        doc(db, "restaurants", rid, "products", id),
        centralInventoryPayload(rid, payload),
        { merge: true },
      );
      return id;
    }

    const ref = doc(centralProductsCollection(rid));
    await setDoc(ref, {
      ...centralInventoryPayload(rid, payload),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function disableProductInventory(
  restaurantId: string,
  productId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  const id = productId.trim();
  if (!rid) throw new Error("disableProductInventory: restaurantId no disponible");
  if (!id) throw new Error("disableProductInventory: productId no disponible");

  try {
    await setDoc(
      doc(db, "restaurants", rid, "products", id),
      {
        restaurantId: rid,
        inventory: {
          ...defaultInventory(),
          enabled: false,
        },
        updatedAt: serverTimestamp(),
      } as DocumentData,
      { merge: true },
    );
  } catch (e) {
    rethrowWithMessage(e);
  }
}
