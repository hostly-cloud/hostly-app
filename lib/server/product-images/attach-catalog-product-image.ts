import { randomUUID } from "node:crypto";
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import {
  buildPendingAutomaticProductImageEnrichment,
  canAutomaticallyReplaceProductImage,
  readProductImageEnrichment,
} from "@/lib/carta/product-image-enrichment";
import { getHostlyStorageBucket } from "@/lib/firebase/admin";
import type { CatalogProductImageAttachResult } from "@/lib/productos/catalog-product-image-contract";
import {
  getOpenFoodFactsCandidateByCode,
  isAllowedOpenFoodFactsImageUrl,
} from "@/lib/server/product-images/open-food-facts-catalog";
import { catalogMatchContextFromProduct } from "@/lib/server/product-images/search-catalog-product-images";

const CATALOG_ATTACH_LOCK_MS = 2 * 60 * 1000;
const CATALOG_IMAGE_TIMEOUT_MS = 15_000;
const MAX_CATALOG_IMAGE_BYTES = 8 * 1024 * 1024;

type CatalogAttachLock = {
  requestId: string;
  startedAt: number;
  startedBy?: string;
};

export class AttachCatalogProductImageError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "AttachCatalogProductImageError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function assertSimpleId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("..")) {
    throw new AttachCatalogProductImageError(
      "INVALID_CATALOG_ATTACH_ID",
      `${label} inválido`,
      400,
    );
  }
  return trimmed;
}

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readImageState(data: Record<string, unknown>) {
  return {
    imageUrl: readString(data, "imageUrl"),
    imagePath: readString(data, "imagePath"),
    imageEnrichment: readProductImageEnrichment(data.imageEnrichment),
  };
}

function readCatalogAttachLock(value: unknown): CatalogAttachLock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const requestId =
    typeof raw.requestId === "string" ? raw.requestId.trim() : "";
  const startedAt =
    typeof raw.startedAt === "number" && Number.isFinite(raw.startedAt)
      ? raw.startedAt
      : null;
  if (!requestId || startedAt == null) return null;
  const startedBy =
    typeof raw.startedBy === "string" && raw.startedBy.trim()
      ? raw.startedBy.trim()
      : undefined;
  return { requestId, startedAt, ...(startedBy ? { startedBy } : {}) };
}

function productImagePrefix(restaurantId: string, productId: string): string {
  return `restaurants/${restaurantId}/products/${productId}/`;
}

function openFoodFactsUserAgent(): string {
  return (
    process.env.HOSTLY_OPENFOODFACTS_USER_AGENT?.trim() ||
    "Hostly/1.0 (contact@hostlyapp.app)"
  );
}

function extensionFromContentType(contentType: string): "jpg" | "png" | "webp" {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export async function downloadOpenFoodFactsImage(params: {
  imageUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<{ bytes: Buffer; contentType: string; extension: "jpg" | "png" | "webp" }> {
  if (!isAllowedOpenFoodFactsImageUrl(params.imageUrl)) {
    throw new AttachCatalogProductImageError(
      "CATALOG_IMAGE_URL_NOT_ALLOWED",
      "La URL de imagen del catálogo no está permitida",
      400,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CATALOG_IMAGE_TIMEOUT_MS);
  try {
    const response = await (params.fetchImpl ?? fetch)(params.imageUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg",
        "User-Agent": openFoodFactsUserAgent(),
      },
    });

    if (!response.ok) {
      throw new AttachCatalogProductImageError(
        "CATALOG_IMAGE_DOWNLOAD_FAILED",
        `No se pudo descargar la imagen (${response.status})`,
        502,
      );
    }
    if (!isAllowedOpenFoodFactsImageUrl(response.url || params.imageUrl)) {
      throw new AttachCatalogProductImageError(
        "CATALOG_IMAGE_REDIRECT_NOT_ALLOWED",
        "El catálogo redirigió la imagen a un dominio no permitido",
        502,
      );
    }

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      throw new AttachCatalogProductImageError(
        "CATALOG_IMAGE_TYPE_NOT_ALLOWED",
        "El catálogo devolvió un formato de imagen no permitido",
        502,
      );
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_CATALOG_IMAGE_BYTES) {
      throw new AttachCatalogProductImageError(
        "CATALOG_IMAGE_TOO_LARGE",
        "La imagen del catálogo supera el tamaño permitido",
        413,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_CATALOG_IMAGE_BYTES) {
      throw new AttachCatalogProductImageError(
        "CATALOG_IMAGE_INVALID_SIZE",
        "La imagen del catálogo no tiene un tamaño válido",
        502,
      );
    }

    return {
      bytes,
      contentType,
      extension: extensionFromContentType(contentType),
    };
  } catch (error) {
    if (error instanceof AttachCatalogProductImageError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AttachCatalogProductImageError(
        "CATALOG_IMAGE_DOWNLOAD_TIMEOUT",
        "La descarga de la imagen agotó el tiempo disponible",
        504,
      );
    }
    throw new AttachCatalogProductImageError(
      "CATALOG_IMAGE_DOWNLOAD_FAILED",
      "No se pudo descargar la imagen del catálogo",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function saveCatalogImage(params: {
  restaurantId: string;
  productId: string;
  externalReference: string;
  bytes: Buffer;
  contentType: string;
  extension: "jpg" | "png" | "webp";
}): Promise<{ imagePath: string; imageUrl: string }> {
  const bucket = getHostlyStorageBucket();
  if (!bucket) {
    throw new AttachCatalogProductImageError(
      "IMAGE_STORAGE_NOT_CONFIGURED",
      "Firebase Storage Admin no está configurado",
      503,
    );
  }

  const token = randomUUID();
  const imagePath = `${productImagePrefix(
    params.restaurantId,
    params.productId,
  )}catalog/${Date.now()}-${params.externalReference}-${randomUUID()}.${params.extension}`;
  const file = bucket.file(imagePath);

  try {
    await file.save(params.bytes, {
      resumable: false,
      metadata: {
        contentType: params.contentType,
        cacheControl: "public,max-age=31536000,immutable",
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
  } catch {
    throw new AttachCatalogProductImageError(
      "CATALOG_IMAGE_STORAGE_WRITE_FAILED",
      "No se pudo guardar la imagen del catálogo",
      502,
    );
  }

  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    bucket.name,
  )}/o/${encodeURIComponent(imagePath)}?alt=media&token=${encodeURIComponent(token)}`;
  return { imagePath, imageUrl };
}

async function deleteStoragePathSafely(params: {
  restaurantId: string;
  productId: string;
  imagePath: string | undefined;
}): Promise<void> {
  const path = params.imagePath?.trim();
  if (!path || !path.startsWith(productImagePrefix(params.restaurantId, params.productId))) {
    return;
  }
  const bucket = getHostlyStorageBucket();
  if (!bucket) return;
  try {
    await bucket.file(path).delete();
  } catch {
    // Best-effort cleanup. Firestore remains the source of truth.
  }
}

async function releaseCatalogAttachLockSafely(params: {
  db: Firestore;
  productRef: DocumentReference;
  requestId: string;
  userId: string;
}): Promise<void> {
  try {
    await params.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(params.productRef);
      if (!snap.exists) return;
      const data = snap.data() as Record<string, unknown>;
      const lock = readCatalogAttachLock(data.catalogImageAttachInProgress);
      if (!lock || lock.requestId !== params.requestId) return;
      transaction.update(params.productRef, {
        catalogImageAttachInProgress: FieldValue.delete(),
        updatedAt: Date.now(),
        updatedBy: params.userId,
      });
    });
  } catch {
    // A stale lock expires after CATALOG_ATTACH_LOCK_MS.
  }
}

export async function attachCatalogProductImage(params: {
  db: Firestore;
  restaurantId: string;
  productId: string;
  externalReference: string;
  userId: string;
  providerFetch?: typeof fetch;
  imageFetch?: typeof fetch;
}): Promise<CatalogProductImageAttachResult> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const productId = assertSimpleId(params.productId, "productId");
  const externalReference = params.externalReference.trim();
  const userId = params.userId.trim();
  if (!/^\d{4,24}$/.test(externalReference)) {
    throw new AttachCatalogProductImageError(
      "INVALID_CATALOG_REFERENCE",
      "Referencia de catálogo inválida",
      400,
    );
  }
  if (!userId) {
    throw new AttachCatalogProductImageError("UNAUTHORIZED", "Usuario requerido", 401);
  }

  const productRef = params.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("products")
    .doc(productId);
  const requestId = randomUUID();

  const acquisition = await params.db.runTransaction(async (transaction) => {
    const snap = await transaction.get(productRef);
    if (!snap.exists) {
      throw new AttachCatalogProductImageError(
        "PRODUCT_NOT_FOUND",
        "Producto no encontrado",
        404,
      );
    }
    const data = snap.data() as Record<string, unknown>;
    if (!canAutomaticallyReplaceProductImage(readImageState(data))) {
      throw new AttachCatalogProductImageError(
        "PRODUCT_IMAGE_PROTECTED",
        "La imagen actual está protegida y no se puede sustituir",
        409,
      );
    }

    const now = Date.now();
    const currentLock = readCatalogAttachLock(data.catalogImageAttachInProgress);
    if (currentLock && now - currentLock.startedAt < CATALOG_ATTACH_LOCK_MS) {
      throw new AttachCatalogProductImageError(
        "CATALOG_IMAGE_ATTACH_IN_PROGRESS",
        "Ya se está adjuntando una imagen de catálogo para este producto",
        409,
      );
    }

    const context = catalogMatchContextFromProduct(data);
    if (!context.name) {
      throw new AttachCatalogProductImageError(
        "INVALID_PRODUCT_NAME",
        "El producto necesita un nombre válido",
        409,
      );
    }

    transaction.update(productRef, {
      catalogImageAttachInProgress: {
        requestId,
        startedAt: now,
        startedBy: userId,
      },
      updatedAt: now,
      updatedBy: userId,
    });
    return { context, originalName: context.name };
  });

  let stored: { imagePath: string; imageUrl: string } | null = null;
  try {
    const candidate = await getOpenFoodFactsCandidateByCode({
      code: externalReference,
      context: acquisition.context,
      fetchImpl: params.providerFetch,
    });
    const downloaded = await downloadOpenFoodFactsImage({
      imageUrl: candidate.imageUrl,
      fetchImpl: params.imageFetch,
    });
    stored = await saveCatalogImage({
      restaurantId,
      productId,
      externalReference,
      ...downloaded,
    });

    let replacedImagePath: string | undefined;
    await params.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(productRef);
      if (!snap.exists) {
        throw new AttachCatalogProductImageError(
          "PRODUCT_NOT_FOUND",
          "Producto no encontrado",
          404,
        );
      }
      const data = snap.data() as Record<string, unknown>;
      const lock = readCatalogAttachLock(data.catalogImageAttachInProgress);
      if (!lock || lock.requestId !== requestId) {
        throw new AttachCatalogProductImageError(
          "CATALOG_IMAGE_ATTACH_CONFLICT",
          "El estado del producto cambió durante la selección",
          409,
        );
      }
      if (!canAutomaticallyReplaceProductImage(readImageState(data))) {
        throw new AttachCatalogProductImageError(
          "PRODUCT_IMAGE_PROTECTED",
          "La imagen quedó protegida antes de terminar la operación",
          409,
        );
      }

      const currentContext = catalogMatchContextFromProduct(data);
      if (currentContext.name !== acquisition.originalName) {
        throw new AttachCatalogProductImageError(
          "PRODUCT_CHANGED_DURING_CATALOG_ATTACH",
          "El nombre del producto cambió durante la selección",
          409,
        );
      }

      replacedImagePath = readString(data, "imagePath");
      const now = Date.now();
      transaction.update(productRef, {
        imageUrl: stored!.imageUrl,
        imagePath: stored!.imagePath,
        imageEnrichment: buildPendingAutomaticProductImageEnrichment({
          source: "catalog_exact",
          confidence: candidate.confidence,
          provider: candidate.provider,
          externalReference: candidate.externalReference,
          matchedAt: now,
          sourceUrl: candidate.sourceUrl,
          imageSourceUrl: candidate.imageUrl,
          license: candidate.license,
          attribution: candidate.attribution,
          matchedProductName: candidate.productName,
          matchedBrand: candidate.brand ?? undefined,
          matchedQuantity: candidate.quantity ?? undefined,
          matchWarnings: candidate.warnings,
        }),
        catalogImageAttachInProgress: FieldValue.delete(),
        updatedAt: now,
        updatedBy: userId,
      });
    });

    if (replacedImagePath && replacedImagePath !== stored.imagePath) {
      await deleteStoragePathSafely({
        restaurantId,
        productId,
        imagePath: replacedImagePath,
      });
    }

    return {
      productId,
      imageUrl: stored.imageUrl,
      imagePath: stored.imagePath,
      candidate,
    };
  } catch (error) {
    if (stored) {
      await deleteStoragePathSafely({
        restaurantId,
        productId,
        imagePath: stored.imagePath,
      });
    }
    await releaseCatalogAttachLockSafely({
      db: params.db,
      productRef,
      requestId,
      userId,
    });
    throw error;
  }
}
