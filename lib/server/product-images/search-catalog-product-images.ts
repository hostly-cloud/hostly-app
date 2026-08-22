import type { Firestore } from "firebase-admin/firestore";
import type { CatalogProductImageSearchResult } from "@/lib/productos/catalog-product-image-contract";
import {
  searchOpenFoodFactsCatalog,
  type CatalogProductMatchContext,
} from "@/lib/server/product-images/open-food-facts-catalog";

export class SearchCatalogProductImagesError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "SearchCatalogProductImagesError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function assertSimpleId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("..")) {
    throw new SearchCatalogProductImagesError(
      "INVALID_CATALOG_SEARCH_ID",
      `${label} inválido`,
      400,
    );
  }
  return trimmed;
}

function readString(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function catalogMatchContextFromProduct(
  data: Record<string, unknown>,
): CatalogProductMatchContext {
  return {
    name: readString(data, ["name", "nombre"]) ?? "",
    categoryName: readString(data, ["categoryName", "categoria"]),
    description: readString(data, ["description", "descripcion"]),
    brand: readString(data, ["brand", "brands", "marca", "manufacturer"]),
    quantity: readString(data, ["quantity", "format", "formato", "size"]),
    barcode: readString(data, ["barcode", "ean", "ean13", "gtin"]),
  };
}

export async function searchCatalogProductImages(params: {
  db: Firestore;
  restaurantId: string;
  productId: string;
  query: string;
  fetchImpl?: typeof fetch;
}): Promise<CatalogProductImageSearchResult> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const productId = assertSimpleId(params.productId, "productId");
  const query = params.query.trim();

  const productRef = params.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("products")
    .doc(productId);
  const snap = await productRef.get();
  if (!snap.exists) {
    throw new SearchCatalogProductImagesError(
      "PRODUCT_NOT_FOUND",
      "Producto no encontrado",
      404,
    );
  }

  const context = catalogMatchContextFromProduct(
    snap.data() as Record<string, unknown>,
  );
  if (!context.name) {
    throw new SearchCatalogProductImagesError(
      "INVALID_PRODUCT_NAME",
      "El producto necesita un nombre antes de buscar una imagen",
      409,
    );
  }

  return searchOpenFoodFactsCatalog({
    query: query || context.name,
    context,
    fetchImpl: params.fetchImpl,
  });
}
