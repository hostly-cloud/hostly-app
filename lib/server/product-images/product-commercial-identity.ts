import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type {
  ProductCommercialIdentity,
  ProductCommercialIdentityInput,
} from "@/lib/productos/product-commercial-identity-contract";
import { normalizeCatalogBarcode } from "@/lib/server/product-images/open-food-facts-exact-product";

const MAX_BRAND_LENGTH = 120;
const MAX_QUANTITY_LENGTH = 60;
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);
const BARCODE_INDEX_COLLECTION = "productBarcodeIndex";

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

/**
 * GS1 check-digit validation for GTIN-8, UPC-A/GTIN-12, EAN-13/GTIN-13 and
 * GTIN-14. This intentionally validates structure, not whether GS1 allocated
 * the company prefix.
 */
export function isValidGtin(value: string): boolean {
  if (!/^\d+$/.test(value) || !GTIN_LENGTHS.has(value.length)) return false;
  const data = value.slice(0, -1);
  const checkDigit = Number(value.at(-1));
  let sum = 0;
  let weight = 3;
  for (let index = data.length - 1; index >= 0; index -= 1) {
    sum += Number(data[index]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  const expected = (10 - (sum % 10)) % 10;
  return checkDigit === expected;
}

export function normalizeProductGtin(value: unknown): string {
  const raw = readString(value);
  if (!raw) return "";
  const normalized = normalizeCatalogBarcode(raw);
  if (!normalized || !isValidGtin(normalized)) {
    throw new ProductCommercialIdentityError(
      "INVALID_PRODUCT_GTIN",
      "EAN / GTIN no válido: revisa la longitud y el dígito de control",
      400,
    );
  }
  return normalized;
}

export function normalizeProductCommercialIdentityInput(input: {
  productId: string;
  brand?: unknown;
  quantity?: unknown;
  barcode?: unknown;
}): ProductCommercialIdentityInput {
  const productId = assertSimpleId(input.productId, "productId");
  const brand = readString(input.brand);
  const quantity = readString(input.quantity);
  const barcode = normalizeProductGtin(input.barcode);

  if (brand.length > MAX_BRAND_LENGTH) {
    throw new ProductCommercialIdentityError(
      "PRODUCT_BRAND_TOO_LONG",
      `La marca no puede superar ${MAX_BRAND_LENGTH} caracteres`,
      400,
    );
  }
  if (quantity.length > MAX_QUANTITY_LENGTH) {
    throw new ProductCommercialIdentityError(
      "PRODUCT_QUANTITY_TOO_LONG",
      `El formato no puede superar ${MAX_QUANTITY_LENGTH} caracteres`,
      400,
    );
  }

  return { productId, brand, quantity, barcode };
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

    const refsToRead = new Map<string, typeof nextIndexRef>();
    if (previousIndexRef) refsToRead.set(previousIndexRef.path, previousIndexRef);
    if (nextIndexRef) refsToRead.set(nextIndexRef.path, nextIndexRef);
    const indexSnaps = new Map<string, Awaited<ReturnType<typeof transaction.get>>>();
    for (const [path, ref] of refsToRead) {
      if (!ref) continue;
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
      // Remove legacy aliases when the identity is deliberately rewritten so
      // a stale alias cannot silently resurrect a cleared/changed barcode.
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

    if (
      previousIndexRef &&
      previousBarcode !== nextBarcode
    ) {
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
