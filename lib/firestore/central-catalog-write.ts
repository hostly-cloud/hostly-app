import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import { normalizeOperationalStationSelection } from "@/lib/carta/operational-station-options";
import {
  buildProductStationPatchFromOperationStationType,
} from "@/lib/operacion/product-operation-station";
import {
  productFamilyFieldsToFirestorePatch,
  type ProductFamilyDenormFields,
} from "@/lib/carta/product-category-family-resolver";
import type { ProductFamilyType } from "@/lib/carta/product-family-types";
import type { OperationStationType } from "@/lib/operacion/operation-station-types";
import { auth, db } from "@/lib/firebase/client";
import {
  defaultInventory,
  defaultRecipe,
} from "@/lib/firestore/central-catalog-defaults";
import type { TipoProductoVenta } from "@/lib/platos-local";

export type CentralOperationalProductInput = {
  name: string;
  categoryId?: string | null;
  categoryName: string;
  price: number;
  /** Legacy: área de preparación en texto; omitir si se envía estación operativa. */
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
  if (!uid) throw new Error("UNAUTHORIZED: inicia sesión para guardar en el catálogo central");
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
  return patch;
}

export function formatCentralCatalogWriteError(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "No tienes permiso para modificar el catálogo central.";
    }
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return "Error al guardar en el catálogo central.";
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

  const ref = await addDoc(collection(db, "restaurants", rid, "products"), {
    restaurantId: rid,
    ...buildOperationalPatch(input, now, userId),
    inventory: defaultInventory(),
    recipe: defaultRecipe(),
    createdAt: now,
    createdBy: userId,
    source: "manual",
  } as DocumentData);

  return ref.id;
}

/** Actualiza campos operativos sin pisar metadata de importación/migración. */
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

/** Actualiza flags de publicación/venta. */
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
