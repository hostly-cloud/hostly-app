import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import type {
  ProductCommercialIdentity,
  ProductCommercialIdentityInput,
} from "@/lib/productos/product-commercial-identity-contract";
import { normalizeValidGtin } from "@/lib/productos/gtin";
import { normalizeCatalogBarcode } from "@/lib/server/product-images/open-food-facts-exact-product";

const MAX_BRAND_LENGTH = 120;
const MAX_QUANTITY_LENGTH = 60;
const MAX_WINE_TEXT_LENGTH = 140;
const BARCODE_INDEX_COLLECTION = "productBarcodeIndex";

export { isValidGtin } from "@/lib/productos/gtin";

export class ProductCommercialIdentityError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "ProductCommercialIdentityError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function assertSimpleId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("..")) {
    throw new ProductCommercialIdentityError(
      "INVALID_PRODUCT_IDENTITY_ID",
      `${label} inválido`,
      400,
    );
  }
  return trimmed;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function assertMaxLength(value: string, max: number, code: string, label: string) {
  if (value.length > max) {
    throw new ProductCommercialIdentityError(
      code,
      `${label} no puede superar ${max} caracteres`,
      400,
    );
  }
}

export function normalizeProductGtin(value: unknown): string {
  const raw = readString(value);
  if (!raw) return "";
  const normalized = normalizeValidGtin(raw);
  if (!normalized) {
    throw new ProductCommercialIdentityError(
      "INVALID_PRODUCT_GTIN",
      "EAN / GTIN no válido: revisa la longitud y el dígito de control",
      400,
    );
  }
  return normalized;
}

function normalizeWineVintage(value: unknown): string {
  const vintage = readString(value);
  if (!vintage) return "";
  if (!/^(?:19|20)\d{2}$/.test(vintage)) {
    throw new ProductCommercialIdentityError(
      "INVALID_WINE_VINTAGE",
      "La añada debe ser un año válido de cuatro cifras",
      400,
    );
  }
  const year = Number(vintage);
  const maxYear = new Date().getUTCFullYear() + 1;
  if (year < 1900 || year > maxYear) {
    throw new ProductCommercialIdentityError(
      "INVALID_WINE_VINTAGE",
      `La añada debe estar entre 1900 y ${maxYear}`,
      400,
    );
  }
  return vintage;
}

export function normalizeProductCommercialIdentityInput(input: {
  productId: string;
  brand?: unknown;
  quantity?: unknown;
  barcode?: unknown;
  wineProducer?: unknown;
  wineAppellation?: unknown;
  wineVintage?: unknown;
}): ProductCommercialIdentityInput {
  const productId = assertSimpleId(input.productId, "productId");
  const brand = readString(input.brand);
  const quantity = readString(input.quantity);
  const barcode = normalizeProductGtin(input.barcode);
  const wineProducer = readString(input.wineProducer);
  const wineAppellation = readString(input.wineAppellation);
  const wineVintage = normalizeWineVintage(input.wineVintage);

  assertMaxLength(brand, MAX_BRAND_LENGTH, "PRODUCT_BRAND_TOO_LONG", "La marca");
  assertMaxLength(quantity, MAX_QUANTITY_LENGTH, "PRODUCT_QUANTITY_TOO_LONG", "El formato");
  assertMaxLength(
    wineProducer,
    MAX_WINE_TEXT_LENGTH,
    "WINE_PRODUCER_TOO_LONG",
    "La bodega / productor",
  );
  assertMaxLength(
    wineAppellation,
    MAX_WINE_TEXT_LENGTH,
    "WINE_APPELLATION_TOO_LONG",
    "La denominación de origen",
  );

  return {
    productId,
    brand,
    quantity,
    barcode,
    wineProducer,
    wineAppellation,
    wineVintage,
  };
}

function readStoredBarcode(data: Record<string, unknown>): string {
  const raw =
    readString(data.barcode) ||
    readString(data.ean) ||
    readString(data.ean13) ||
    readString(data.gtin);
  return normalizeCatalogBarcode(raw) ?? "";
}

function identityFromDocument(
  productId: string,
  data: Record<string, unknown>,
): ProductCommercialIdentity {
  return {
    productId,
    brand:
      readString(data.brand) ||
      readString(data.brands) ||
      readString(data.marca) ||
      readString(data.manufacturer),
    quantity:
      readString(data.quantity) ||
      readString(data.format) ||
      readString(data.formato) ||
      readString(data.size),
    barcode: readStoredBarcode(data),
    wineProducer:
      readString(data.wineProducer) ||
      readString(data.winery) ||
      readString(data.bodega),
    wineAppellation:
      readString(data.wineAppellation) ||
      readString(data.appellation) ||
      readString(data.denominacionOrigen),
    wineVintage:
      readString(data.wineVintage) ||
      readString(data.vintage) ||
      readString(data.anada),
  };
}

export async function readProductCommercialIdentity(params: {
  db: Firestore;
  restaurantId: string;
  productId: string;
}): Promise<ProductCommercialIdentity> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const productId = assertSimpleId(params.productId, "productId");
  const ref = params.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("products")
    .doc(productId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new ProductCommercialIdentityError(
      "PRODUCT_NOT_FOUND",
      "Producto no encontrado",
      404,
    );
  }
  return identityFromDocument(productId, snap.data() as Record<string, unknown>);
}

function barcodeIndexOwner(data: Record<string, unknown> | undefined): string {
  return readString(data?.productId);
}

export async function updateProductCommercialIdentity(params: {
  db: Firestore;
  restaurantId: string;
  userId: string;
  input: ProductCommercialIdentityInput;
}): Promise<ProductCommercialIdentity> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const userId = params.userId.trim();
  if (!userId) {
    throw new ProductCommercialIdentityError("UNAUTHORIZED", "Usuario requerido", 401);
  }
  const input = normalizeProductCommercialIdentityInput(params.input);
  const restaurantRef = params.db.collection("restaurants").doc(restaurantId);
  const productRef = restaurantRef.collection("products").doc(input.productId);

  await params.db.runTransaction(async (transaction) => {
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists) {
      throw new ProductCommercialIdentityError(
        "PRODUCT_NOT_FOUND",
        "Producto no encontrado",
        404,
      );
    }

    const productData = productSnap.data() as Record<string, unknown>;
    const previousBarcode = readStoredBarcode(productData);
    const nextBarcode = input.barcode;
    const previousIndexRef = previousBarcode
      ? restaurantRef.collection(BARCODE_INDEX_COLLECTION).doc(previousBarcode)
      : null;
    const nextIndexRef = nextBarcode
      ? restaurantRef.collection(BARCODE_INDEX_COLLECTION).doc(nextBarcode)
      : null;

    const refsToRead = new Map<string, DocumentReference>();
    if (previousIndexRef) refsToRead.set(previousIndexRef.path, previousIndexRef);
    if (nextIndexRef) refsToRead.set(nextIndexRef.path, nextIndexRef);
    const indexSnaps = new Map<string, DocumentSnapshot>();
    for (const [path, ref] of refsToRead) {
      indexSnaps.set(path, await transaction.get(ref));
    }

    if (nextIndexRef) {
      const existing = indexSnaps.get(nextIndexRef.path);
      const owner = existing?.exists
        ? barcodeIndexOwner(existing.data() as Record<string, unknown>)
        : "";
      if (owner && owner !== input.productId) {
        throw new ProductCommercialIdentityError(
          "PRODUCT_GTIN_ALREADY_ASSIGNED",
          "Este EAN / GTIN ya está asignado a otro producto de este restaurante",
          409,
        );
      }
    }

    const now = Date.now();
    transaction.update(productRef, {
      brand: input.brand || FieldValue.delete(),
      quantity: input.quantity || FieldValue.delete(),
      barcode: nextBarcode || FieldValue.delete(),
      wineProducer: input.wineProducer || FieldValue.delete(),
      wineAppellation: input.wineAppellation || FieldValue.delete(),
      wineVintage: input.wineVintage || FieldValue.delete(),
      ean: FieldValue.delete(),
      ean13: FieldValue.delete(),
      gtin: FieldValue.delete(),
      updatedAt: now,
      updatedBy: userId,
    });

    if (nextIndexRef) {
      transaction.set(nextIndexRef, {
        productId: input.productId,
        barcode: nextBarcode,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    if (previousIndexRef && previousBarcode !== nextBarcode) {
      const previousSnap = indexSnaps.get(previousIndexRef.path);
      const previousOwner = previousSnap?.exists
        ? barcodeIndexOwner(previousSnap.data() as Record<string, unknown>)
        : "";
      if (previousOwner === input.productId) {
        transaction.delete(previousIndexRef);
      }
    }
  });

  return input;
}
