import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { normalizeOperationalStationSelection } from "@/lib/carta/operational-station-options";
import { isProductKind, type ProductKind } from "@/lib/carta/product-kind-options";
import {
  buildProductStationPatchFromOperationStationType,
  buildProductStationPatchFromSelectValue,
} from "@/lib/operacion/product-operation-station";
import type { ProductFamilyType } from "@/lib/carta/product-family-types";
import { readProductCatalogCourseFromRecord } from "@/lib/carta/menu-course";
import {
  productFamilyFieldsToFirestorePatch,
  type ProductFamilyDenormFields,
} from "@/lib/carta/product-category-family-resolver";
import {
  isOperationStationType,
  type OperationStationType,
} from "@/lib/operacion/operation-station-types";
import { auth, db } from "@/lib/firebase/client";
import {
  deleteProductImageAtPath,
  uploadProductImage,
} from "@/lib/firebase/product-image-storage";
import type { UserRestaurantRole } from "@/lib/firestore/user-restaurant-profile";
import type {
  PurchaseUnit,
  UnitCostBaseUnit,
} from "@/lib/inventory/inventory-cost";
import {
  normalizePurchaseUnit,
  readStoredUnitCostUnit,
} from "@/lib/inventory/inventory-cost";
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
  /** Umbral crítico operativo; omitir o 0 = sin umbral configurado. */
  minStock?: number;
  costPerUnit: number;
  /** Coste total de la compra (p. ej. botella 18 €). */
  purchaseCost?: number;
  /** Cantidad en unidad de compra (p. ej. 700 ml). */
  purchaseQuantity?: number;
  purchaseUnit?: PurchaseUnit;
  /** Coste por unidad base calculado (€/ml, €/g o €/ud). */
  unitCost?: number;
  unitCostUnit?: UnitCostBaseUnit;
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
  /** Denormalizado desde categoría de carta (import / catálogo central). */
  categoryName?: string | null;
  price: number | null;
  active: boolean;
  station: string | null;
  /** Área operativa explícita en documento central (p. ej. cocina, barra). */
  preparationArea?: string | null;
  /** Estación operativa configurable (`operationStations`). */
  operationStationId?: string | null;
  operationStationName?: string | null;
  operationStationType?: OperationStationType | null;
  type: string | null;
  /** `plato` | `bebida` en catálogo central. */
  tipoVenta?: string | null;
  /** Clasificación inventario: bebida / comida / otro (distinto de tipoVenta y estación). */
  productKind?: ProductKind | null;
  /** Denormalizado desde categoría de carta (`productFamilies`). */
  productFamilyId?: string | null;
  productFamilyName?: string | null;
  productFamilyType?: ProductFamilyType | null;
  visibleOnMenu?: boolean;
  /** Grupos de modificadores asignados directamente al producto (opcional). */
  modifierGroupIds?: string[] | null;
  /** Pase por defecto TPV (1–4). `null` = sin pase; ausente = legacy. */
  course?: number | null;
  inventory: ProductInventoryDocument;
  recipe: ProductRecipeDocument;
  createdAt?: number;
  updatedAt?: number;
};

export type ProductInventoryWrite = {
  name: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  station?: string | null;
  operationStationId?: string | null;
  operationStationName?: string | null;
  operationStationType?: OperationStationType | null;
  productKind?: ProductKind | null;
  productFamilyId?: string | null;
  productFamilyName?: string | null;
  productFamilyType?: ProductFamilyType | null;
  active?: boolean;
  /** Precio de venta (catálogo central); omitir en merge para no pisar el valor existente. */
  price?: number | null;
  /** p. ej. `inventory` para artículos gestionados solo por stock. */
  type?: string | null;
  unit: "kg" | "g" | "l" | "ml" | "ud" | string;
  currentStock: number;
  minStock?: number;
  costPerUnit: number;
  purchaseCost?: number;
  purchaseQuantity?: number;
  purchaseUnit?: PurchaseUnit;
  unitCost?: number;
  unitCostUnit?: UnitCostBaseUnit;
  supplierName?: string;
  image?: string;
};

export type StockMovementListItem = {
  id: string;
  type: string;
  previousStock: number;
  newStock: number;
  delta: number;
  unit: string;
  reason: string | null;
  source: string;
  receiptId: string | null;
  createdAtMs: number | null;
  createdBy: string | null;
};

export type InventoryReceiptItemInput = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  costPerUnit: number | null;
};

export type ApplyInventoryReceiptInput = {
  restaurantId: string;
  createdBy: string | null;
  supplierName: string | null;
  notes: string | null;
  items: InventoryReceiptItemInput[];
};

export type ApplyInventoryReceiptResult = {
  receiptId: string;
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

/** Alinea unidades de Compras/Stock local (`uds`) con el inventario central (`ud`). */
function normalizeReceiptItemUnit(unitRaw: unknown): ProductInventoryDocument["unit"] {
  if (unitRaw === "uds") return "ud";
  return normalizeInventoryUnit(unitRaw);
}

type AggregatedReceiptLine = {
  productId: string;
  productName: string;
  quantity: number;
  unit: ProductInventoryDocument["unit"];
  costPerUnit: number | null;
};

function aggregateInventoryReceiptItems(
  items: InventoryReceiptItemInput[],
): AggregatedReceiptLine[] {
  const map = new Map<string, AggregatedReceiptLine>();
  for (const raw of items) {
    const productId = raw.productId.trim();
    if (!productId) {
      throw new Error("applyInventoryReceipt: productId vacío");
    }
    const qty = readFiniteNumber(raw.quantity);
    if (qty == null || qty <= 0) {
      throw new Error(`applyInventoryReceipt: cantidad inválida (${productId})`);
    }
    const name = (raw.productName ?? "").trim() || "Sin nombre";
    const unit = normalizeReceiptItemUnit(raw.unit ?? "ud");
    let costPerUnit: number | null = null;
    if (raw.costPerUnit != null) {
      const c = readFiniteNumber(raw.costPerUnit);
      if (c != null && c >= 0) costPerUnit = c;
    }
    const prev = map.get(productId);
    if (prev) {
      prev.quantity += qty;
      if (!prev.productName || prev.productName === "Sin nombre") prev.productName = name;
      if (costPerUnit != null) prev.costPerUnit = costPerUnit;
    } else {
      map.set(productId, {
        productId,
        productName: name,
        quantity: qty,
        unit,
        costPerUnit,
      });
    }
  }
  return [...map.values()];
}

/**
 * Registra una recepción de inventario: documento en `inventoryReceipts`, incremento atómico de
 * `inventory.currentStock` por producto y movimiento `type: "receipt"` en `stockMovements`.
 */
export async function applyInventoryReceipt(
  input: ApplyInventoryReceiptInput,
): Promise<ApplyInventoryReceiptResult> {
  const rid = input.restaurantId.trim();
  if (!rid) throw new Error("applyInventoryReceipt: restaurantId requerido");
  if (!input.items.length) throw new Error("applyInventoryReceipt: sin líneas");
  if (!auth.currentUser) throw new Error("applyInventoryReceipt: sin sesión");

  const aggregated = aggregateInventoryReceiptItems(input.items);
  const receiptRef = doc(collection(db, "restaurants", rid, "inventoryReceipts"));
  const receiptId = receiptRef.id;
  const supplierReason =
    input.supplierName?.trim() ? input.supplierName.trim() : null;
  const notesTrim = input.notes?.trim() ? input.notes.trim() : null;

  await runTransaction(db, async (transaction) => {
    const lines: { line: AggregatedReceiptLine; snap: DocumentSnapshot<DocumentData> }[] = [];

    for (const line of aggregated) {
      const pref = doc(db, "restaurants", rid, "products", line.productId);
      const snap = await transaction.get(pref);
      if (!snap.exists()) {
        throw new Error(
          `Producto no encontrado en inventario central: ${line.productId}. Vincula el id del producto Firestore en Compras.`,
        );
      }
      const data = snap.data() as Record<string, unknown>;
      assertProductRestaurantAccess(data, rid);
      lines.push({ line, snap });
    }

    const receiptItems = aggregated.map((a) => ({
      productId: a.productId,
      productName: a.productName,
      quantity: a.quantity,
      unit: a.unit,
      costPerUnit: a.costPerUnit,
    }));

    let totalCost = 0;
    for (const a of aggregated) {
      if (a.costPerUnit != null) totalCost += a.quantity * a.costPerUnit;
    }

    transaction.set(receiptRef, {
      supplierName: supplierReason,
      notes: notesTrim,
      createdAt: serverTimestamp(),
      createdBy: input.createdBy,
      items: receiptItems,
      totalCost,
    } as DocumentData);

    for (const { line, snap } of lines) {
      const data = snap.data() as Record<string, unknown>;
      const previousStock = readInventoryCurrentStockFromDoc(data);
      const newStock = previousStock + line.quantity;
      const productRef = doc(db, "restaurants", rid, "products", line.productId);
      const movementRef = doc(
        collection(db, "restaurants", rid, "products", line.productId, "stockMovements"),
      );

      const patch: Record<string, unknown> = {
        "inventory.currentStock": newStock,
        updatedAt: serverTimestamp(),
      };
      if (line.costPerUnit != null) {
        patch["inventory.costPerUnit"] = line.costPerUnit;
      }

      transaction.update(productRef, patch as DocumentData);

      transaction.set(movementRef, {
        type: "receipt",
        previousStock,
        newStock,
        delta: line.quantity,
        unit: line.unit,
        reason: supplierReason,
        source: "inventory_receipt",
        receiptId,
        createdAt: serverTimestamp(),
        createdBy: input.createdBy,
      } as DocumentData);
    }
  });

  return { receiptId };
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
  const minStock = readFiniteNumber(raw.minStock ?? raw.minimumStock);
  const purchaseCost = readFiniteNumber(raw.purchaseCost);
  const purchaseQuantity = readFiniteNumber(raw.purchaseQuantity);
  const purchaseUnit = normalizePurchaseUnit(raw.purchaseUnit);
  const unitCost = readFiniteNumber(raw.unitCost);
  const unitCostUnit = readStoredUnitCostUnit(raw.unitCostUnit);

  return {
    enabled: raw.enabled === true,
    unit: normalizeInventoryUnit(raw.unit),
    currentStock: readFiniteNumberWithDefault(raw.currentStock),
    ...(minStock != null ? { minStock } : {}),
    costPerUnit: readFiniteNumberWithDefault(raw.costPerUnit ?? raw.averageCost),
    ...(purchaseCost != null && purchaseCost > 0 ? { purchaseCost } : {}),
    ...(purchaseQuantity != null && purchaseQuantity > 0
      ? { purchaseQuantity }
      : {}),
    ...(purchaseUnit ? { purchaseUnit } : {}),
    ...(unitCost != null && unitCost > 0 ? { unitCost } : {}),
    ...(unitCostUnit ? { unitCostUnit } : {}),
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
  const categoryName =
    typeof data.categoryName === "string" && data.categoryName.trim() !== ""
      ? data.categoryName.trim()
      : typeof data.categoria === "string" && data.categoria.trim() !== ""
        ? data.categoria.trim()
        : null;
  const preparationArea =
    typeof data.preparationArea === "string" && data.preparationArea.trim() !== ""
      ? data.preparationArea.trim()
      : null;
  const operationStationId =
    typeof data.operationStationId === "string" && data.operationStationId.trim() !== ""
      ? data.operationStationId.trim()
      : null;
  const operationStationName =
    typeof data.operationStationName === "string" &&
    data.operationStationName.trim() !== ""
      ? data.operationStationName.trim()
      : null;
  const tipoVenta =
    typeof data.tipoVenta === "string" && data.tipoVenta.trim() !== ""
      ? data.tipoVenta.trim()
      : null;
  const productKindRaw = data.productKind;
  const productKind = isProductKind(productKindRaw) ? productKindRaw : null;
  const productFamilyId =
    typeof data.productFamilyId === "string" && data.productFamilyId.trim() !== ""
      ? data.productFamilyId.trim()
      : null;
  const productFamilyName =
    typeof data.productFamilyName === "string" &&
    data.productFamilyName.trim() !== ""
      ? data.productFamilyName.trim()
      : null;
  const productFamilyTypeRaw = data.productFamilyType;
  const productFamilyType =
    productFamilyTypeRaw === "food" ||
    productFamilyTypeRaw === "drink" ||
    productFamilyTypeRaw === "other"
      ? productFamilyTypeRaw
      : null;
  const visibleOnMenu =
    typeof data.visibleOnMenu === "boolean" ? data.visibleOnMenu : undefined;
  const modifierGroupIdsRaw = data.modifierGroupIds;
  const modifierGroupIds = Array.isArray(modifierGroupIdsRaw)
    ? modifierGroupIdsRaw
        .filter((id): id is string => typeof id === "string" && id.trim() !== "")
        .map((id) => id.trim())
    : [];
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

  const catalogCourse = readProductCatalogCourseFromRecord(data);

  return {
    id: snap.id,
    name,
    categoryId,
    categoryName,
    price,
    active,
    station,
    preparationArea,
    ...(operationStationId ? { operationStationId } : {}),
    ...(operationStationName ? { operationStationName } : {}),
    ...(isOperationStationType(data.operationStationType)
      ? { operationStationType: data.operationStationType }
      : {}),
    type,
    tipoVenta,
    ...(productKind ? { productKind } : {}),
    ...(productFamilyId ? { productFamilyId } : {}),
    ...(productFamilyName ? { productFamilyName } : {}),
    ...(productFamilyType ? { productFamilyType } : {}),
    ...(modifierGroupIds.length > 0 ? { modifierGroupIds } : {}),
    ...(catalogCourse !== undefined ? { course: catalogCourse } : {}),
    ...(visibleOnMenu !== undefined ? { visibleOnMenu } : {}),
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
    },
  );
}

/** Lectura puntual del catálogo central (Escandallos, dashboard) sin listener duplicado. */
export async function fetchCentralProductsOnce(
  restaurantId: string,
): Promise<{ docs: ProductDocument[]; error: string | null }> {
  const rid = restaurantId.trim();
  if (!rid || !auth.currentUser) {
    return { docs: [], error: null };
  }
  try {
    const snap = await getDocs(query(centralProductsCollection(rid)));
    const list = snap.docs.map(mapCentralDocToProductDocument);
    list.sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
    );
    return { docs: list, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "CENTRAL_PRODUCTS_FETCH_FAILED";
    return { docs: [], error: message };
  }
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
      ...(readFiniteNumber(data.stock_minimo) != null
        ? { minStock: readFiniteNumber(data.stock_minimo) as number }
        : {}),
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

  /** Inventario depende del snapshot central; legacy solo enriquece si hay permiso/datos. */
  const emit = () => {
    if (!centralReady) return;
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
        emit();
      },
      (_error: unknown) => {
        legacyItems = [];
        emit();
      },
    ),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

function readInventoryCurrentStockFromDoc(
  data: Record<string, unknown> | undefined,
): number {
  if (!data) return 0;
  const inv =
    data.inventory && typeof data.inventory === "object"
      ? (data.inventory as Record<string, unknown>)
      : {};
  return readFiniteNumberWithDefault(inv.currentStock, 0);
}

function mapStockMovementSnapshot(
  snap: QueryDocumentSnapshot<DocumentData>,
): StockMovementListItem {
  const d = snap.data() as Record<string, unknown>;
  const createdAt = d.createdAt;
  let createdAtMs: number | null = null;
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    createdAtMs = createdAt;
  } else if (createdAt instanceof Timestamp) {
    createdAtMs = createdAt.toMillis();
  }
  const createdBy =
    typeof d.createdBy === "string" && d.createdBy.trim() !== ""
      ? d.createdBy.trim()
      : null;
  const reason =
    d.reason === null || d.reason === undefined
      ? null
      : typeof d.reason === "string"
        ? d.reason
        : null;
  const unit =
    typeof d.unit === "string" && d.unit.trim() !== "" ? d.unit.trim() : "ud";
  const type =
    typeof d.type === "string" && d.type.trim() !== ""
      ? d.type.trim()
      : "manual_adjustment";
  const source =
    typeof d.source === "string" && d.source.trim() !== ""
      ? d.source.trim()
      : "inventory_panel";

  const receiptId =
    typeof d.receiptId === "string" && d.receiptId.trim() !== ""
      ? d.receiptId.trim()
      : null;

  return {
    id: snap.id,
    type,
    previousStock: readFiniteNumberWithDefault(d.previousStock, 0),
    newStock: readFiniteNumberWithDefault(d.newStock, 0),
    delta: readFiniteNumberWithDefault(d.delta, 0),
    unit,
    reason,
    source,
    receiptId,
    createdAtMs,
    createdBy,
  };
}

/**
 * Últimos movimientos de stock del producto (tiempo real).
 */
export function listenLatestStockMovements(
  restaurantId: string,
  productId: string,
  onData: (items: StockMovementListItem[]) => void,
  options?: { limit?: number; onError?: (e: unknown) => void },
): Unsubscribe {
  const rid = restaurantId.trim();
  const pid = productId.trim();
  const lim = Math.min(Math.max(options?.limit ?? 5, 1), 50);
  if (!rid || !pid || !auth.currentUser) {
    onData([]);
    return () => {};
  }

  const col = collection(db, "restaurants", rid, "products", pid, "stockMovements");
  const q = query(col, orderBy("createdAt", "desc"), limit(lim));

  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map(mapStockMovementSnapshot));
    },
    (error) => {
      options?.onError?.(error);
      onData([]);
    },
  );
}

function buildCentralInventoryStationFields(
  payload: ProductInventoryWrite,
): Record<string, unknown> {
  const oid = payload.operationStationId?.trim();
  const oName = payload.operationStationName?.trim();
  const oType = payload.operationStationType;

  if (oid && oName && oType) {
    const patch = buildProductStationPatchFromOperationStationType(
      oid,
      oName,
      oType,
    );
    const fields: Record<string, unknown> = {
      station: patch.station,
      preparationArea: patch.preparationArea,
      operationStationId: patch.operationStationId,
      operationStationName: patch.operationStationName,
    };
    return fields;
  }

  const stationRaw = payload.station?.trim() || null;
  if (!stationRaw) return {};

  const patch = buildProductStationPatchFromSelectValue(stationRaw, []);
  if (patch.clearOperationStation && patch.station === "none") {
    return {
      station: "none",
      preparationArea: "none",
      operationStationId: null,
      operationStationName: null,
    };
  }
  if (patch.operationStationId) {
    return {
      station: patch.station,
      preparationArea: patch.preparationArea,
      operationStationId: patch.operationStationId,
      operationStationName: patch.operationStationName,
    };
  }
  const stationNorm = normalizeOperationalStationSelection(stationRaw);
  if (stationNorm.isLegacy && stationNorm.legacyRaw) {
    return {
      station: stationNorm.legacyRaw,
      preparationArea: stationNorm.legacyRaw,
    };
  }
  return {
    station: stationNorm.station,
    preparationArea: stationNorm.preparationArea,
    operationStationId: null,
    operationStationName: null,
  };
}

function buildCentralInventoryProductFamilyFields(
  payload: ProductInventoryWrite,
): Record<string, unknown> {
  if (
    payload.productFamilyId !== undefined ||
    payload.productFamilyName !== undefined ||
    payload.productFamilyType !== undefined
  ) {
    const denorm: ProductFamilyDenormFields =
      payload.productFamilyId === null
        ? { clearProductFamily: true }
        : payload.productFamilyId &&
            payload.productFamilyName &&
            payload.productFamilyType
          ? {
              productFamilyId: payload.productFamilyId.trim(),
              productFamilyName: payload.productFamilyName.trim(),
              productFamilyType: payload.productFamilyType,
            }
          : { clearProductFamily: true };
    return productFamilyFieldsToFirestorePatch(denorm);
  }
  return {};
}

function centralInventoryPayload(
  restaurantId: string,
  payload: ProductInventoryWrite,
): DocumentData {
  const name = payload.name?.trim() || "Sin nombre";
  const categoryId = payload.categoryId?.trim() || null;
  const categoryName =
    payload.categoryName !== undefined
      ? payload.categoryName?.trim() || null
      : undefined;
  const doc: Record<string, unknown> = {
    restaurantId,
    name,
    categoryId,
    ...(categoryName !== undefined ? { categoryName } : {}),
    ...buildCentralInventoryStationFields(payload),
    ...buildCentralInventoryProductFamilyFields(payload),
    ...(payload.productKind && isProductKind(payload.productKind)
      ? { productKind: payload.productKind }
      : {}),
    active: payload.active ?? true,
    inventory: {
      enabled: true,
      unit: normalizeInventoryUnit(payload.unit),
      currentStock: payload.currentStock,
      ...(payload.minStock != null && Number.isFinite(payload.minStock)
        ? { minStock: payload.minStock }
        : {}),
      costPerUnit: payload.costPerUnit,
      ...(payload.purchaseCost != null &&
      Number.isFinite(payload.purchaseCost) &&
      payload.purchaseCost > 0
        ? { purchaseCost: payload.purchaseCost }
        : {}),
      ...(payload.purchaseQuantity != null &&
      Number.isFinite(payload.purchaseQuantity) &&
      payload.purchaseQuantity > 0
        ? { purchaseQuantity: payload.purchaseQuantity }
        : {}),
      ...(payload.purchaseUnit ? { purchaseUnit: payload.purchaseUnit } : {}),
      ...(payload.unitCost != null &&
      Number.isFinite(payload.unitCost) &&
      payload.unitCost > 0
        ? { unitCost: payload.unitCost }
        : {}),
      ...(payload.unitCostUnit ? { unitCostUnit: payload.unitCostUnit } : {}),
      ...(payload.supplierName?.trim()
        ? { supplierName: payload.supplierName.trim() }
        : {}),
      ...(payload.image?.trim() ? { image: payload.image.trim() } : {}),
    },
    recipe: defaultRecipe(),
    updatedAt: serverTimestamp(),
  };
  if (payload.price !== undefined) {
    doc.price =
      payload.price === null ? null : readFiniteNumberWithDefault(payload.price, 0);
  }
  if (payload.type !== undefined) {
    doc.type =
      typeof payload.type === "string" && payload.type.trim() !== ""
        ? payload.type.trim()
        : null;
  }
  return doc as DocumentData;
}

export async function upsertProductInventory(
  restaurantId: string,
  productId: string | null,
  payload: ProductInventoryWrite,
): Promise<string> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("upsertProductInventory: restaurantId no disponible");

  const newStock = readFiniteNumberWithDefault(payload.currentStock, 0);
  const unitStr = String(normalizeInventoryUnit(payload.unit));

  try {
    if (productId?.trim()) {
      const id = productId.trim();
      const productRef = doc(db, "restaurants", rid, "products", id);
      let previousStock = 0;
      const snap = await getDoc(productRef);
      if (snap.exists()) {
        previousStock = readInventoryCurrentStockFromDoc(
          snap.data() as Record<string, unknown>,
        );
      }

      const batch = writeBatch(db);
      batch.set(productRef, centralInventoryPayload(rid, payload), { merge: true });

      if (previousStock !== newStock) {
        const movRef = doc(
          collection(db, "restaurants", rid, "products", id, "stockMovements"),
        );
        batch.set(movRef, {
          type: "manual_adjustment",
          previousStock,
          newStock,
          delta: newStock - previousStock,
          unit: unitStr,
          reason: null,
          source: "inventory_panel",
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid ?? null,
        } as DocumentData);
      }

      await batch.commit();
      return id;
    }

    const productRef = doc(centralProductsCollection(rid));
    const previousStock = 0;
    const batch = writeBatch(db);
    batch.set(productRef, {
      ...centralInventoryPayload(rid, payload),
      createdAt: serverTimestamp(),
    });

    if (previousStock !== newStock) {
      const movRef = doc(
        collection(
          db,
          "restaurants",
          rid,
          "products",
          productRef.id,
          "stockMovements",
        ),
      );
      batch.set(movRef, {
        type: "manual_adjustment",
        previousStock,
        newStock,
        delta: newStock - previousStock,
        unit: unitStr,
        reason: null,
        source: "inventory_panel",
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid ?? null,
      } as DocumentData);
    }

    await batch.commit();
    return productRef.id;
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

export {
  activateCentralProduct,
  bulkUpdateCentralProductsCourse,
  bulkUpdateCentralProductsDestination,
  bulkUpdateCentralProductsCategory,
  bulkUpdateCentralProductsFamily,
  type BulkCatalogCategoryPatch,
  type BulkCatalogProductFamilyPatch,
  type BulkCatalogKdsDestination,
  createCentralProduct,
  deleteCentralProductPermanently,
  disableCentralProduct,
  formatCentralCatalogWriteError,
  setCentralProductPublication,
  updateCentralProduct,
  updateCentralProductRecipe,
  type CentralOperationalProductInput,
  type CentralProductPublicationPatch,
  type CentralProductRecipeInput,
} from "@/lib/firestore/central-catalog-write";
