import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import type { ProductCatalogCourse } from "@/lib/carta/menu-course";
import { buildProductStationPatchFromOperationStationType } from "@/lib/operacion/product-operation-station";
import {
  DEFAULT_OPERATION_STATION_SPECS,
  type OperationStationType,
} from "@/lib/operacion/operation-station-types";
import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import { normalizeOperationalStationSelection } from "@/lib/carta/operational-station-options";
import {
  productFamilyFieldsToFirestorePatch,
  type ProductFamilyDenormFields,
} from "@/lib/carta/product-category-family-resolver";
import type { ProductFamilyType } from "@/lib/carta/product-family-types";
import { auth, db } from "@/lib/firebase/client";
import {
  deleteCentralProductImageAtPath,
  uploadCentralProductImage,
} from "@/lib/firebase/central-product-image-storage";
import {
  defaultInventory,
  defaultRecipe,
} from "@/lib/firestore/central-catalog-defaults";
import { readProductSortOrder } from "@/lib/carta/product-sort-order";
import type { TipoProductoVenta } from "@/lib/platos-local";

export type CentralOperationalProductInput = {
  name: string;
  categoryId?: string | null;
  categoryName: string;
  price: number;
  /** Legacy: ?rea de preparaci?n en texto; omitir si se env?a estaci?n operativa. */
  preparationArea?: string;
  operationStationId?: string | null;
  operationStationName?: string | null;
  operationStationType?: OperationStationType | null;
  productFamilyId?: string | null;
  productFamilyName?: string | null;
  productFamilyType?: ProductFamilyType | null;
  tipoVenta: TipoProductoVenta | string;
  active?: boolean;
  visibleOnMenu?: boolean;
  description?: string;
  /** Pase por defecto TPV: null = sin pase; 1?4 = Entrante?Postre. */
  course?: number | null;
  imageUrl?: string;
  imagePath?: string;
};

export type CentralProductPublicationPatch = {
  active?: boolean;
  visibleOnMenu?: boolean;
};

export type CentralProductRecipeIngredientInput = {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  cost?: number;
};

export type CentralProductRecipeInput = {
  enabled: boolean;
  ingredients: CentralProductRecipeIngredientInput[];
};

function requireAuthUid(): string {
  const uid = auth.currentUser?.uid?.trim();
  if (!uid) throw new Error("UNAUTHORIZED: inicia sesi?n para guardar en el cat?logo central");
  return uid;
}

function centralProductRef(restaurantId: string, productId: string) {
  return doc(db, "restaurants", restaurantId.trim(), "products", productId.trim());
}

function resolveStationFieldsForSave(input: {
  preparationArea?: string;
  operationStationId?: string | null;
  operationStationName?: string | null;
  operationStationType?: OperationStationType | null;
}): Record<string, unknown> {
  const oid = input.operationStationId?.trim();
  const oName = input.operationStationName?.trim();
  const oType = input.operationStationType;
  if (oid && oName && oType) {
    const patch = buildProductStationPatchFromOperationStationType(
      oid,
      oName,
      oType,
    );
    return {
      operationStationId: patch.operationStationId,
      operationStationName: patch.operationStationName,
      station: patch.station,
      preparationArea: patch.preparationArea,
    };
  }

  if (input.operationStationId === null) {
    return {
      operationStationId: null,
      operationStationName: null,
      station: "none",
      preparationArea: "none",
    };
  }

  const preparationAreaInput = input.preparationArea?.trim() ?? "";
  if (!preparationAreaInput) return {};

  const norm = normalizeOperationalStationSelection(preparationAreaInput);
  if (norm.isLegacy && norm.legacyRaw) {
    return { preparationArea: norm.legacyRaw, station: norm.legacyRaw };
  }
  return {
    preparationArea: norm.preparationArea,
    station: norm.station,
    operationStationId: null,
    operationStationName: null,
  };
}

function resolveProductFamilyFieldsForSave(
  input: Pick<
    CentralOperationalProductInput,
    "productFamilyId" | "productFamilyName" | "productFamilyType"
  >,
): Record<string, unknown> {
  if (input.productFamilyId === null) {
    return productFamilyFieldsToFirestorePatch({ clearProductFamily: true });
  }
  const id = input.productFamilyId?.trim();
  const name = input.productFamilyName?.trim();
  const type = input.productFamilyType;
  if (id && name && type) {
    return productFamilyFieldsToFirestorePatch({
      productFamilyId: id,
      productFamilyName: name,
      productFamilyType: type,
    });
  }
  return {};
}

function buildOperationalPatch(
  input: CentralOperationalProductInput,
  now: number,
  userId: string,
): Record<string, unknown> {
  const fields = resolveStationFieldsForSave(input);
  const familyFields = resolveProductFamilyFieldsForSave(input);
  const name = input.name.trim();
  const categoryId = input.categoryId?.trim();

  return {
    name,
    normalizedName: normalizeProductName(name),
    categoryName: input.categoryName.trim() || "General",
    ...(categoryId ? { categoryId } : {}),
    ...familyFields,
    price: input.price,
    ...fields,
    tipoVenta: input.tipoVenta,
    visibleOnMenu: input.visibleOnMenu !== false,
    active: input.active !== false,
    updatedAt: now,
    updatedBy: userId,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.course !== undefined ? { course: input.course } : {}),
    ...(input.imageUrl?.trim() && input.imagePath?.trim()
      ? { imageUrl: input.imageUrl.trim(), imagePath: input.imagePath.trim() }
      : {}),
  };
}

function buildPartialOperationalPatch(
  input: Partial<CentralOperationalProductInput>,
  now: number,
  userId: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    updatedAt: now,
    updatedBy: userId,
  };
  if (typeof input.name === "string") {
    const name = input.name.trim();
    patch.name = name;
    patch.normalizedName = normalizeProductName(name);
  }
  if (typeof input.categoryName === "string") {
    patch.categoryName = input.categoryName.trim() || "General";
  }
  if (input.categoryId !== undefined) {
    const cid = input.categoryId?.trim();
    patch.categoryId = cid || null;
  }
  if (
    input.productFamilyId !== undefined ||
    input.productFamilyName !== undefined ||
    input.productFamilyType !== undefined
  ) {
    Object.assign(patch, resolveProductFamilyFieldsForSave(input));
  }
  if (typeof input.price === "number" && Number.isFinite(input.price)) {
    patch.price = input.price;
  }
  if (
    input.operationStationId !== undefined ||
    (typeof input.preparationArea === "string" && input.preparationArea.trim())
  ) {
    Object.assign(patch, resolveStationFieldsForSave(input));
  }
  if (typeof input.tipoVenta === "string") {
    patch.tipoVenta = input.tipoVenta;
  }
  if (input.visibleOnMenu !== undefined) {
    patch.visibleOnMenu = input.visibleOnMenu !== false;
  }
  if (input.active !== undefined) {
    patch.active = input.active !== false;
  }
  if (typeof input.description === "string") {
    const d = input.description.trim();
    if (d) patch.description = d;
  }
  if (input.course !== undefined) {
    patch.course = input.course;
  }
  if (typeof input.imageUrl === "string" && typeof input.imagePath === "string") {
    const imageUrl = input.imageUrl.trim();
    const imagePath = input.imagePath.trim();
    if (imageUrl && imagePath) {
      patch.imageUrl = imageUrl;
      patch.imagePath = imagePath;
    }
  }
  return patch;
}

export function formatCentralCatalogWriteError(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "No tienes permiso para modificar el cat?logo central.";
    }
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return "Error al guardar en el cat?logo central.";
}

async function resolveNextSortOrderForCategory(
  restaurantId: string,
  categoryId: string | null | undefined,
): Promise<number> {
  const rid = restaurantId.trim();
  if (!rid) return 0;
  const cid = categoryId?.trim() || null;
  const coll = collection(db, "restaurants", rid, "products");
  const snap = cid
    ? await getDocs(query(coll, where("categoryId", "==", cid)))
    : await getDocs(coll);

  let max = -1;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const pcid =
      typeof data.categoryId === "string" && data.categoryId.trim()
        ? data.categoryId.trim()
        : null;
    if (cid) {
      if (pcid !== cid) continue;
    } else if (pcid) {
      continue;
    }
    const so =
      readProductSortOrder(data.sortOrder) ??
      readProductSortOrder(data.ordenEnCategoria);
    if (so != null) max = Math.max(max, so);
  }
  return max + 1;
}

/** Crea producto operativo en `restaurants/{restaurantId}/products`. */
export async function createCentralProduct(
  restaurantId: string,
  input: CentralOperationalProductInput,
): Promise<string> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("MISSING_RESTAURANT_ID");
  const userId = requireAuthUid();
  const now = Date.now();
  const sortOrder = await resolveNextSortOrderForCategory(rid, input.categoryId);

  const ref = await addDoc(collection(db, "restaurants", rid, "products"), {
    restaurantId: rid,
    ...buildOperationalPatch(input, now, userId),
    sortOrder,
    inventory: defaultInventory(),
    recipe: defaultRecipe(),
    createdAt: now,
    createdBy: userId,
    source: "manual",
  } as DocumentData);

  return ref.id;
}

/** Asigna el mismo pase (`course`) a varios productos del catálogo central. */
export async function bulkUpdateCentralProductsCourse(
  restaurantId: string,
  productIds: readonly string[],
  course: ProductCatalogCourse,
): Promise<{ updated: number }> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("MISSING_RESTAURANT_ID");
  const userId = requireAuthUid();
  const now = Date.now();

  const ids = [
    ...new Set(
      productIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
  if (ids.length === 0) return { updated: 0 };

  const BATCH_SIZE = 400;
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const chunk = ids.slice(offset, offset + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const productId of chunk) {
      batch.update(centralProductRef(rid, productId), {
        course,
        updatedAt: now,
        updatedBy: userId,
      } as DocumentData);
    }
    await batch.commit();
  }

  return { updated: ids.length };
}

/** Destinos KDS soportados en catálogo (misma resolución que `resolveKdsDestination`). */
export type BulkCatalogKdsDestination = Extract<
  OperationStationType,
  "kitchen" | "bar" | "cocktail"
>;

function firestorePatchForBulkCatalogDestination(
  destination: BulkCatalogKdsDestination,
): Record<string, unknown> {
  const spec = DEFAULT_OPERATION_STATION_SPECS.find((s) => s.type === destination);
  if (!spec) throw new Error("INVALID_DESTINATION");
  const patch = buildProductStationPatchFromOperationStationType(
    spec.id,
    spec.name,
    spec.type,
  );
  return {
    operationStationId: patch.operationStationId,
    operationStationName: patch.operationStationName,
    station: patch.station,
    preparationArea: patch.preparationArea,
  };
}

/** Asigna el mismo destino KDS a varios productos del catálogo central. */
export async function bulkUpdateCentralProductsDestination(
  restaurantId: string,
  productIds: readonly string[],
  destination: BulkCatalogKdsDestination,
): Promise<{ updated: number }> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("MISSING_RESTAURANT_ID");
  const userId = requireAuthUid();
  const now = Date.now();
  const stationPatch = firestorePatchForBulkCatalogDestination(destination);

  const ids = [
    ...new Set(
      productIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
  if (ids.length === 0) return { updated: 0 };

  const BATCH_SIZE = 400;
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const chunk = ids.slice(offset, offset + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const productId of chunk) {
      batch.update(centralProductRef(rid, productId), {
        ...stationPatch,
        updatedAt: now,
        updatedBy: userId,
      } as DocumentData);
    }
    await batch.commit();
  }

  return { updated: ids.length };
}

/** Parche de categoría para asignación masiva (solo `categoryId` + `categoryName`). */
export type BulkCatalogCategoryPatch = {
  categoryId: string | null;
  categoryName: string;
};

/** Asigna la misma categoría de carta a varios productos del catálogo central. */
export async function bulkUpdateCentralProductsCategory(
  restaurantId: string,
  productIds: readonly string[],
  category: BulkCatalogCategoryPatch,
): Promise<{ updated: number }> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("MISSING_RESTAURANT_ID");
  const userId = requireAuthUid();
  const now = Date.now();

  const categoryId = category.categoryId?.trim() || null;
  const categoryName =
    categoryId != null
      ? category.categoryName.trim() || "General"
      : category.categoryName.trim();

  const ids = [
    ...new Set(
      productIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
  if (ids.length === 0) return { updated: 0 };

  const BATCH_SIZE = 400;
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const chunk = ids.slice(offset, offset + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const productId of chunk) {
      batch.update(centralProductRef(rid, productId), {
        categoryId,
        categoryName,
        updatedAt: now,
        updatedBy: userId,
      } as DocumentData);
    }
    await batch.commit();
  }

  return { updated: ids.length };
}

/** Parche de familia de producto para asignación masiva. */
export type BulkCatalogProductFamilyPatch =
  | { clearProductFamily: true }
  | {
      productFamilyId: string;
      productFamilyName: string;
      productFamilyType: ProductFamilyType;
    };

/** Asigna la misma familia de producto a varios ítems del catálogo central. */
export async function bulkUpdateCentralProductsFamily(
  restaurantId: string,
  productIds: readonly string[],
  family: BulkCatalogProductFamilyPatch,
): Promise<{ updated: number }> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("MISSING_RESTAURANT_ID");
  const userId = requireAuthUid();
  const now = Date.now();

  let familyPatch: Record<string, unknown>;
  if ("clearProductFamily" in family) {
    familyPatch = productFamilyFieldsToFirestorePatch({ clearProductFamily: true });
  } else {
    familyPatch = productFamilyFieldsToFirestorePatch({
      productFamilyId: family.productFamilyId.trim(),
      productFamilyName: family.productFamilyName.trim(),
      productFamilyType: family.productFamilyType,
    });
  }

  const ids = [
    ...new Set(
      productIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
  if (ids.length === 0) return { updated: 0 };

  const BATCH_SIZE = 400;
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const chunk = ids.slice(offset, offset + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const productId of chunk) {
      batch.update(centralProductRef(rid, productId), {
        ...familyPatch,
        updatedAt: now,
        updatedBy: userId,
      } as DocumentData);
    }
    await batch.commit();
  }

  return { updated: ids.length };
}

/**
 * Intercambia la posición de un producto con el anterior/siguiente dentro de la misma categoría.
 * Renumeración 0…n-1 en todos los ids de `orderedProductIds` tras el swap (orden estable en TPV).
 */
export async function swapCentralProductSortOrderInCategory(
  restaurantId: string,
  productId: string,
  direction: "up" | "down",
  orderedProductIds: readonly string[],
): Promise<void> {
  const rid = restaurantId.trim();
  const pid = productId.trim();
  if (!rid || !pid) throw new Error("MISSING_IDS");
  const userId = requireAuthUid();
  const now = Date.now();

  const ids = orderedProductIds.map((id) => id.trim()).filter((id) => id.length > 0);
  const index = ids.indexOf(pid);
  if (index < 0) throw new Error("PRODUCT_NOT_IN_LIST");
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= ids.length) return;

  const next = [...ids];
  [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];

  const batch = writeBatch(db);
  for (let sortOrder = 0; sortOrder < next.length; sortOrder += 1) {
    const id = next[sortOrder]!;
    batch.update(centralProductRef(rid, id), {
      sortOrder,
      updatedAt: now,
      updatedBy: userId,
    } as DocumentData);
  }
  await batch.commit();
}

/** Actualiza campos operativos sin pisar metadata de importaci?n/migraci?n. */
export async function updateCentralProduct(
  restaurantId: string,
  productId: string,
  input: Partial<CentralOperationalProductInput>,
): Promise<void> {
  const rid = restaurantId.trim();
  const pid = productId.trim();
  if (!rid || !pid) throw new Error("MISSING_IDS");
  const userId = requireAuthUid();
  const now = Date.now();

  const ref = centralProductRef(rid, pid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("PRODUCT_NOT_FOUND");

  const patch = buildPartialOperationalPatch(input, now, userId);
  await updateDoc(ref, patch as DocumentData);
}

/** Actualiza solo `recipe` sin pisar inventory ni campos operativos. */
export async function updateCentralProductRecipe(
  restaurantId: string,
  productId: string,
  recipe: CentralProductRecipeInput,
): Promise<void> {
  const rid = restaurantId.trim();
  const pid = productId.trim();
  if (!rid || !pid) throw new Error("MISSING_IDS");
  const userId = requireAuthUid();
  const now = Date.now();

  const ref = centralProductRef(rid, pid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("PRODUCT_NOT_FOUND");

  await updateDoc(ref, {
    recipe: {
      enabled: recipe.enabled === true,
      ingredients: recipe.ingredients.map((ing) => ({
        productId: ing.productId.trim(),
        name: ing.name.trim() || ing.productId.trim(),
        quantity: ing.quantity,
        unit: ing.unit,
        ...(ing.cost != null && Number.isFinite(ing.cost) ? { cost: ing.cost } : {}),
      })),
    },
    updatedAt: now,
    updatedBy: userId,
  } as DocumentData);
}

/** Soft-delete operativo: desactiva producto (no hard delete). */
export async function disableCentralProduct(
  restaurantId: string,
  productId: string,
): Promise<void> {
  await setCentralProductPublication(restaurantId, productId, {
    active: false,
    visibleOnMenu: false,
  });
}

/** Sube imagen a Storage y la adjunta al producto central. */
export async function uploadAndAttachCentralProductImage(
  restaurantId: string,
  productId: string,
  file: File,
  previousImagePath?: string,
): Promise<void> {
  const up = await uploadCentralProductImage(restaurantId, productId, file);
  await updateCentralProduct(restaurantId, productId, {
    imageUrl: up.url,
    imagePath: up.path,
  });
  const prev = previousImagePath?.trim();
  if (prev && prev !== up.path) {
    await deleteCentralProductImageAtPath(prev);
  }
}

/** Quita imagen del producto central y borra el fichero en Storage si aplica. */
export async function clearCentralProductImage(
  restaurantId: string,
  productId: string,
  previousImagePath?: string,
): Promise<void> {
  const rid = restaurantId.trim();
  const pid = productId.trim();
  if (!rid || !pid) throw new Error("MISSING_IDS");
  const userId = requireAuthUid();
  const now = Date.now();

  await updateDoc(centralProductRef(rid, pid), {
    imageUrl: deleteField(),
    imagePath: deleteField(),
    updatedAt: now,
    updatedBy: userId,
  } as DocumentData);

  await deleteCentralProductImageAtPath(previousImagePath);
}

/** Borrado definitivo del documento en cat?logo central (solo productos sin hist?rico). */
export async function deleteCentralProductPermanently(
  restaurantId: string,
  productId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  const pid = productId.trim();
  if (!rid || !pid) throw new Error("MISSING_IDS");
  requireAuthUid();
  const ref = centralProductRef(rid, pid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("PRODUCT_NOT_FOUND");
  const data = snap.data() as Record<string, unknown>;
  const imagePath =
    typeof data.imagePath === "string" && data.imagePath.trim() !== ""
      ? data.imagePath.trim()
      : undefined;
  await deleteDoc(ref);
  if (imagePath) {
    await deleteCentralProductImageAtPath(imagePath);
  }
}

/** Actualiza flags de publicaci?n/venta. */
export async function setCentralProductPublication(
  restaurantId: string,
  productId: string,
  flags: CentralProductPublicationPatch,
): Promise<void> {
  const rid = restaurantId.trim();
  const pid = productId.trim();
  if (!rid || !pid) throw new Error("MISSING_IDS");
  const userId = requireAuthUid();
  const now = Date.now();

  const ref = centralProductRef(rid, pid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("PRODUCT_NOT_FOUND");

  const patch: Record<string, unknown> = {
    updatedAt: now,
    updatedBy: userId,
  };
  if (flags.active !== undefined) patch.active = flags.active !== false;
  if (flags.visibleOnMenu !== undefined) {
    patch.visibleOnMenu = flags.visibleOnMenu !== false;
  }

  await updateDoc(ref, patch as DocumentData);
}

/** Reactiva venta (`active`); no altera visibilidad en carta/TPV. */
export async function activateCentralProduct(
  restaurantId: string,
  productId: string,
): Promise<void> {
  await setCentralProductPublication(restaurantId, productId, {
    active: true,
  });
}
