import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type {
  ProductCommercialIdentity,
  ProductCommercialIdentityInput,
} from "@/lib/productos/product-commercial-identity-contract";
import { normalizeCatalogBarcode } from "@/lib/server/product-images/open-food-facts-exact-product";

const MAX_BRAND_LENGTH = 120;
const MAX_QUANTITY_LENGTH = 60;

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

export function normalizeProductCommercialIdentityInput(input: {
  productId: string;
  brand?: unknown;
  quantity?: unknown;
  barcode?: unknown;
}): ProductCommercialIdentityInput {
  const productId = assertSimpleId(input.productId, "productId");
  const brand = readString(input.brand);
  const quantity = readString(input.quantity);
  const barcodeRaw = readString(input.barcode);

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

  const barcode = barcodeRaw ? normalizeCatalogBarcode(barcodeRaw) : null;
  if (barcodeRaw && !barcode) {
    throw new ProductCommercialIdentityError(
      "INVALID_PRODUCT_BARCODE",
      "EAN / GTIN no válido",
      400,
    );
  }

  return {
    productId,
    brand,
    quantity,
    barcode: barcode ?? "",
  };
}

function identityFromDocument(
  productId: string,
  data: Record<string, unknown>,
): ProductCommercialIdentity {
  const barcode =
    normalizeCatalogBarcode(
      readString(data.barcode) ||
        readString(data.ean) ||
        readString(data.ean13) ||
        readString(data.gtin),
    ) ?? "";
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
    barcode,
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
  const ref = params.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("products")
    .doc(input.productId);

  await params.db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      throw new ProductCommercialIdentityError(
        "PRODUCT_NOT_FOUND",
        "Producto no encontrado",
        404,
      );
    }
    const now = Date.now();
    transaction.update(ref, {
      brand: input.brand || FieldValue.delete(),
      quantity: input.quantity || FieldValue.delete(),
      barcode: input.barcode || FieldValue.delete(),
      updatedAt: now,
      updatedBy: userId,
    });
  });

  return input;
}
