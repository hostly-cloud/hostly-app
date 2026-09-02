import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { generateImage, NoImageGeneratedError } from "ai";
import {
  buildPendingAutomaticProductImageEnrichment,
  canAutomaticallyReplaceProductImage,
  readProductImageEnrichment,
} from "@/lib/carta/product-image-enrichment";
import {
  inferTipoVentaFromCartaText,
  parseTipoVentaLoose,
} from "@/lib/carta/product-sale-contract";
import { getHostlyStorageBucket } from "@/lib/firebase/admin";
import type {
  CatalogImageAccess,
  CatalogImageCapability,
} from "@/lib/productos/catalog-image-plan";

const AI_IMAGE_TIMEOUT_MS = 90_000;
const MAX_GENERATED_IMAGE_BYTES = 8 * 1024 * 1024;
const GENERATION_LOCK_MS = 3 * 60 * 1000;
const IMAGE_PROVIDER = "vercel-ai-gateway";
const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-lite-image";

export type ProductImageGenerationSkipReason =
  | "not_food"
  | "branded_or_beverage"
  | "invalid_product_name"
  | "protected_existing_image"
  | "generation_in_progress"
  | "duplicate_request";

export type ProductImageGenerationEligibility =
  | {
      eligible: true;
      name: string;
      categoryName: string;
      description?: string;
    }
  | {
      eligible: false;
      reason: Exclude<
        ProductImageGenerationSkipReason,
        "generation_in_progress" | "duplicate_request"
      >;
    };

export type GenerateImportedProductImageResult =
  | {
      outcome: "generated";
      productId: string;
      imageUrl: string;
      imagePath: string;
      model: string;
      provider?: string;
      idempotencyKey?: string;
      costUsd?: number;
      replacedImagePath?: string;
    }
  | {
      outcome: "skipped";
      productId: string;
      reason: ProductImageGenerationSkipReason;
      idempotencyKey?: string;
    };

export class GenerateImportedProductImageError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "GenerateImportedProductImageError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

type ProductImageGenerationLock = {
  requestId: string;
  startedAt: number;
  startedBy?: string;
};

type CatalogImageUsageStatus =
  | "processing"
  | "succeeded"
  | "skipped"
  | "failed";

function usageRecordBase(params: {
  restaurantId: string;
  productId: string;
  userId: string;
  idempotencyKey: string;
  access: CatalogImageAccess;
  status: CatalogImageUsageStatus;
  now: number;
  operation?: "catalog_image_ai_single" | "catalog_image_ai_bulk";
  capability?: CatalogImageCapability;
  jobId?: string;
}) {
  return {
    restaurantId: params.restaurantId,
    productId: params.productId,
    userId: params.userId,
    idempotencyKey: params.idempotencyKey,
    operation: params.operation ?? "catalog_image_ai_single",
    capability: params.capability ?? "catalog.image.ai.single",
    ...(params.jobId ? { jobId: params.jobId } : {}),
    effectivePlan: params.access.effectivePlan,
    planSource: params.access.source,
    meteringMode: params.access.meteringMode,
    provider: IMAGE_PROVIDER,
    status: params.status,
    createdAt: params.now,
    updatedAt: params.now,
  };
}

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 500) : undefined;
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Esta primera fase no genera envases, etiquetas ni productos comerciales.
 * Incluso si un ítem llega mal clasificado como plato, estas señales lo bloquean.
 */
export function looksLikeBrandedOrBeverageProduct(
  name: string,
  categoryName: string,
): boolean {
  const text = normalizeMatchText(`${categoryName} ${name}`);
  return /\b(coca cola|fanta|sprite|pepsi|heineken|mahou|estrella damm|san miguel|corona|red bull|monster|aquarius|nestea|schweppes|tonicas?|cervezas?|beers?|vinos?|wines?|rioja|ribera del duero|cavas?|champagnes?|proseccos?|whisk(?:y|ey)s?|vodkas?|rones?|rums?|gins?|ginebras?|vermuts?|vermouths?|licores?|refrescos?|sodas?|aguas? minerales?|zumos?|juices?|cafes?|coffees?|cocktails?|cocteles?)\b/.test(
    text,
  );
}

function readImageState(data: Record<string, unknown>) {
  return {
    imageUrl: readString(data, "imageUrl"),
    imagePath: readString(data, "imagePath"),
    imageEnrichment: readProductImageEnrichment(data.imageEnrichment),
  };
}

function readGenerationLock(value: unknown): ProductImageGenerationLock | null {
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

/**
 * Generación deliberadamente conservadora:
 * - solo `tipoVenta: plato`;
 * - excluye bebidas/marcas aunque hayan sido clasificadas incorrectamente;
 * - nunca sustituye imágenes manuales, aprobadas o legacy protegidas.
 */
export function evaluateImportedProductImageEligibility(
  data: Record<string, unknown>,
  descriptionOverride?: string,
): ProductImageGenerationEligibility {
  const name = readString(data, "name") ?? "";
  if (name.length < 3) {
    return { eligible: false, reason: "invalid_product_name" };
  }

  const categoryName = readString(data, "categoryName") ?? "Plato";
  const tipoVenta =
    parseTipoVentaLoose(data.tipoVenta) ??
    inferTipoVentaFromCartaText(categoryName, name);
  if (tipoVenta !== "plato" || data.productFamilyType === "drink") {
    return { eligible: false, reason: "not_food" };
  }

  if (looksLikeBrandedOrBeverageProduct(name, categoryName)) {
    return { eligible: false, reason: "branded_or_beverage" };
  }

  if (!canAutomaticallyReplaceProductImage(readImageState(data))) {
    return { eligible: false, reason: "protected_existing_image" };
  }

  const description =
    normalizeDescription(descriptionOverride) ??
    normalizeDescription(data.descripcion) ??
    normalizeDescription(data.description);
  return {
    eligible: true,
    name: name.slice(0, 140),
    categoryName: categoryName.slice(0, 100),
    ...(description ? { description: description.slice(0, 360) } : {}),
  };
}

export function buildImportedProductImagePrompt(input: {
  name: string;
  categoryName: string;
  description?: string;
}): string {
  return [
    "Create a realistic professional restaurant menu photograph of one generic plated dish.",
    `Dish name from the restaurant menu: ${input.name}`,
    `Menu category: ${input.categoryName}`,
    ...(input.description ? [`Menu description: ${input.description}`] : []),
    "Represent only what can reasonably be inferred from the menu wording; if details are ambiguous, use a conservative presentation.",
    "No text, no typography, no logos, no brand marks, no packaging, no labels, no menus, no people and no hands.",
    "Do not depict wine bottles, branded drinks or commercial product packaging.",
    "One appetizing plated serving, clean neutral restaurant setting, natural premium food photography, soft realistic lighting, three-quarter or slightly top-down angle, square composition.",
  ].join("\n");
}

function readProviderStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = "statusCode" in error ? error.statusCode : null;
  if (typeof status === "number" && Number.isFinite(status)) return status;
  return "cause" in error ? readProviderStatus(error.cause) : null;
}

function readGatewayCostUsd(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const gateway = (value as Record<string, unknown>).gateway;
  if (!gateway || typeof gateway !== "object") return undefined;
  const raw = gateway as Record<string, unknown>;
  for (const key of ["cost", "gatewayCost"]) {
    const parsed = Number(raw[key]);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

async function generateImageWithAiGateway(
  prompt: string,
  userId: string,
): Promise<{
  bytes: Buffer;
  model: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  costUsd?: number;
}> {
  const model =
    process.env.HOSTLY_AI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;

  try {
    const result = await generateImage({
      model,
      prompt,
      n: 1,
      aspectRatio: "1:1",
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(AI_IMAGE_TIMEOUT_MS),
      providerOptions: {
        gateway: {
          user: userId,
          tags: ["feature:product-image", "review:required"],
          disallowPromptTraining: true,
        },
      },
    });
    const mediaType = result.image.mediaType;
    if (
      mediaType !== "image/png" &&
      mediaType !== "image/jpeg" &&
      mediaType !== "image/webp"
    ) {
      throw new GenerateImportedProductImageError(
        "IMAGE_PROVIDER_INVALID_IMAGE",
        "El proveedor devolvió un formato de imagen no permitido",
        502,
      );
    }
    const bytes = Buffer.from(result.image.uint8Array);
    if (bytes.length === 0 || bytes.length > MAX_GENERATED_IMAGE_BYTES) {
      throw new GenerateImportedProductImageError(
        "IMAGE_PROVIDER_INVALID_IMAGE",
        "La imagen generada no tiene un tamaño válido",
        502,
      );
    }

    const costUsd = readGatewayCostUsd(result.providerMetadata);
    return { bytes, model, mediaType, ...(costUsd != null ? { costUsd } : {}) };
  } catch (error) {
    if (error instanceof GenerateImportedProductImageError) throw error;
    const status = readProviderStatus(error);
    if (status === 401 || status === 403) {
      throw new GenerateImportedProductImageError(
        "IMAGE_GENERATION_NOT_CONFIGURED",
        "AI Gateway no está disponible para este proyecto",
        503,
      );
    }
    if (status === 402) {
      throw new GenerateImportedProductImageError(
        "IMAGE_GENERATION_BUDGET_EXCEEDED",
        "Se ha alcanzado el presupuesto de generación de imágenes",
        503,
      );
    }
    if (status === 429) {
      throw new GenerateImportedProductImageError(
        "IMAGE_PROVIDER_RATE_LIMITED",
        "El proveedor ha limitado temporalmente las generaciones",
        429,
      );
    }
    if (
      (error instanceof Error && error.name === "AbortError") ||
      status === 408 ||
      status === 504
    ) {
      throw new GenerateImportedProductImageError(
        "IMAGE_PROVIDER_TIMEOUT",
        "La generación de imagen agotó el tiempo disponible",
        504,
      );
    }
    throw new GenerateImportedProductImageError(
      NoImageGeneratedError.isInstance(error)
        ? "IMAGE_PROVIDER_EMPTY_RESPONSE"
        : "IMAGE_PROVIDER_FAILED",
      "No se pudo generar la imagen",
      502,
    );
  }
}

function assertSimpleId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("..")) {
    throw new GenerateImportedProductImageError(
      "INVALID_IMAGE_GENERATION_ID",
      `${label} inválido`,
      400,
    );
  }
  return trimmed;
}

function productImagePrefix(restaurantId: string, productId: string): string {
  return `restaurants/${restaurantId}/products/${productId}/`;
}

async function deleteStoragePathSafely(
  restaurantId: string,
  productId: string,
  path: string | undefined,
): Promise<void> {
  const trimmed = path?.trim();
  if (
    !trimmed ||
    !trimmed.startsWith(productImagePrefix(restaurantId, productId))
  ) {
    return;
  }
  const bucket = getHostlyStorageBucket();
  if (!bucket) return;
  try {
    await bucket.file(trimmed).delete();
  } catch {
    // Cleanup is best-effort; product state already remains consistent.
  }
}

async function saveGeneratedImage(
  restaurantId: string,
  productId: string,
  bytes: Buffer,
  mediaType: "image/png" | "image/jpeg" | "image/webp",
): Promise<{ imagePath: string; imageUrl: string }> {
  const bucket = getHostlyStorageBucket();
  if (!bucket) {
    throw new GenerateImportedProductImageError(
      "IMAGE_STORAGE_NOT_CONFIGURED",
      "Firebase Storage Admin no está configurado",
      503,
    );
  }

  const token = randomUUID();
  const extension =
    mediaType === "image/png"
      ? "png"
      : mediaType === "image/jpeg"
        ? "jpg"
        : "webp";
  const imagePath = `${productImagePrefix(
    restaurantId,
    productId,
  )}ai/${Date.now()}-${randomUUID()}.${extension}`;
  const file = bucket.file(imagePath);

  try {
    await file.save(bytes, {
      resumable: false,
      metadata: {
        contentType: mediaType,
        cacheControl: "public,max-age=31536000,immutable",
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });
  } catch {
    throw new GenerateImportedProductImageError(
      "IMAGE_STORAGE_WRITE_FAILED",
      "No se pudo guardar la imagen generada",
      502,
    );
  }

  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    bucket.name,
  )}/o/${encodeURIComponent(imagePath)}?alt=media&token=${encodeURIComponent(
    token,
  )}`;

  return { imagePath, imageUrl };
}

async function releaseGenerationLockSafely(params: {
  db: Firestore;
  productRef: FirebaseFirestore.DocumentReference;
  usageRef: FirebaseFirestore.DocumentReference;
  requestId: string;
  userId: string;
  error: unknown;
  model?: string;
  costUsd?: number;
}): Promise<void> {
  try {
    await params.db.runTransaction(async (transaction) => {
      const productSnap = await transaction.get(params.productRef);
      const usageSnap = await transaction.get(params.usageRef);
      const now = Date.now();
      if (productSnap.exists) {
        const data = productSnap.data() as Record<string, unknown>;
        const lock = readGenerationLock(data.imageGenerationInProgress);
        if (lock?.requestId === params.requestId) {
          transaction.update(params.productRef, {
            imageGenerationInProgress: FieldValue.delete(),
            updatedAt: now,
            updatedBy: params.userId,
          });
        }
      }
      if (usageSnap.exists) {
        const errorCode =
          params.error &&
          typeof params.error === "object" &&
          "code" in params.error &&
          typeof params.error.code === "string"
            ? params.error.code
            : "IMAGE_GENERATION_FAILED";
        transaction.update(params.usageRef, {
          status: "failed",
          result: "failed",
          failureReason: errorCode,
          ...(params.model ? { model: params.model } : {}),
          ...(params.costUsd != null ? { costUsd: params.costUsd } : {}),
          updatedAt: now,
          completedAt: now,
        });
      }
    });
  } catch {
    // A stale lock expires after GENERATION_LOCK_MS and never protects an image.
  }
}

export async function generateImportedProductImage(params: {
  db: Firestore;
  restaurantId: string;
  productId: string;
  userId: string;
  idempotencyKey: string;
  access: CatalogImageAccess;
  description?: string;
  usageOperation?: "catalog_image_ai_single" | "catalog_image_ai_bulk";
  usageCapability?: CatalogImageCapability;
  jobId?: string;
}): Promise<GenerateImportedProductImageResult> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const productId = assertSimpleId(params.productId, "productId");
  const userId = params.userId.trim();
  if (!userId) {
    throw new GenerateImportedProductImageError(
      "UNAUTHORIZED",
      "Usuario requerido",
      401,
    );
  }
  const idempotencyKey = params.idempotencyKey.trim();
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)) {
    throw new GenerateImportedProductImageError(
      "INVALID_IMAGE_IDEMPOTENCY_KEY",
      "Identificador idempotente inválido",
      400,
    );
  }

  const productRef = params.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("products")
    .doc(productId);
  const usageRef = params.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("catalogImageUsage")
    .doc(idempotencyKey);
  const requestId = idempotencyKey;

  const acquisition = await params.db.runTransaction(async (transaction) => {
    const productSnap = await transaction.get(productRef);
    const usageSnap = await transaction.get(usageRef);
    if (usageSnap.exists) {
      return {
        acquired: false as const,
        reason: "duplicate_request" as const,
      };
    }
    if (!productSnap.exists) {
      throw new GenerateImportedProductImageError(
        "PRODUCT_NOT_FOUND",
        "Producto no encontrado",
        404,
      );
    }

    const data = productSnap.data() as Record<string, unknown>;
    const now = Date.now();
    const eligibility = evaluateImportedProductImageEligibility(
      data,
      params.description,
    );
    if (!eligibility.eligible) {
      transaction.create(
        usageRef,
        {
          ...usageRecordBase({
            restaurantId,
            productId,
            userId,
            idempotencyKey,
            access: params.access,
            status: "skipped",
            now,
            operation: params.usageOperation,
            capability: params.usageCapability,
            jobId: params.jobId,
          }),
          result: "skipped",
          failureReason: eligibility.reason,
          completedAt: now,
        },
      );
      return { acquired: false as const, reason: eligibility.reason };
    }

    const lock = readGenerationLock(data.imageGenerationInProgress);
    if (lock && now - lock.startedAt < GENERATION_LOCK_MS) {
      transaction.create(
        usageRef,
        {
          ...usageRecordBase({
            restaurantId,
            productId,
            userId,
            idempotencyKey,
            access: params.access,
            status: "skipped",
            now,
            operation: params.usageOperation,
            capability: params.usageCapability,
            jobId: params.jobId,
          }),
          result: "skipped",
          failureReason: "generation_in_progress",
          completedAt: now,
        },
      );
      return {
        acquired: false as const,
        reason: "generation_in_progress" as const,
      };
    }

    transaction.update(productRef, {
      imageGenerationInProgress: {
        requestId,
        startedAt: now,
        startedBy: userId,
      },
      updatedAt: now,
      updatedBy: userId,
    });
    transaction.create(
      usageRef,
      usageRecordBase({
        restaurantId,
        productId,
        userId,
        idempotencyKey,
        access: params.access,
        status: "processing",
        now,
        operation: params.usageOperation,
        capability: params.usageCapability,
        jobId: params.jobId,
      }),
    );

    return { acquired: true as const, eligibility };
  });

  if (!acquisition.acquired) {
    return {
      outcome: "skipped",
      productId,
      reason: acquisition.reason,
      idempotencyKey,
    };
  }

  let stored:
    | {
        imagePath: string;
        imageUrl: string;
      }
    | undefined;
  let generatedMetadata:
    | {
        model: string;
        costUsd?: number;
      }
    | undefined;

  try {
    const prompt = buildImportedProductImagePrompt(acquisition.eligibility);
    const generated = await generateImageWithAiGateway(prompt, userId);
    generatedMetadata = {
      model: generated.model,
      ...(generated.costUsd != null ? { costUsd: generated.costUsd } : {}),
    };
    stored = await saveGeneratedImage(
      restaurantId,
      productId,
      generated.bytes,
      generated.mediaType,
    );

    let replacedImagePath: string | undefined;
    const finalResult = await params.db.runTransaction(async (transaction) => {
      const productSnap = await transaction.get(productRef);
      const usageSnap = await transaction.get(usageRef);
      if (!productSnap.exists) {
        throw new GenerateImportedProductImageError(
          "PRODUCT_NOT_FOUND",
          "Producto no encontrado",
          404,
        );
      }
      if (!usageSnap.exists) {
        throw new GenerateImportedProductImageError(
          "IMAGE_USAGE_RECORD_NOT_FOUND",
          "No se encontró el registro de consumo de la generación",
          409,
        );
      }

      const data = productSnap.data() as Record<string, unknown>;
      const lock = readGenerationLock(data.imageGenerationInProgress);
      if (!lock || lock.requestId !== requestId) {
        const now = Date.now();
        transaction.update(usageRef, {
          status: "skipped",
          result: "skipped",
          failureReason: "generation_in_progress",
          model: generated.model,
          ...(generated.costUsd != null ? { costUsd: generated.costUsd } : {}),
          updatedAt: now,
          completedAt: now,
        });
        return {
          attached: false as const,
          reason: "generation_in_progress" as const,
        };
      }

      const eligibility = evaluateImportedProductImageEligibility(data);
      if (!eligibility.eligible) {
        const now = Date.now();
        transaction.update(productRef, {
          imageGenerationInProgress: FieldValue.delete(),
          updatedAt: now,
          updatedBy: userId,
        });
        transaction.update(usageRef, {
          status: "skipped",
          result: "skipped",
          failureReason: eligibility.reason,
          model: generated.model,
          ...(generated.costUsd != null ? { costUsd: generated.costUsd } : {}),
          updatedAt: now,
          completedAt: now,
        });
        return { attached: false as const, reason: eligibility.reason };
      }

      replacedImagePath = readString(data, "imagePath");
      const now = Date.now();
      transaction.update(productRef, {
        imageUrl: stored!.imageUrl,
        imagePath: stored!.imagePath,
        imageEnrichment: buildPendingAutomaticProductImageEnrichment({
          source: "ai_generated",
          confidence: 0.65,
          provider: IMAGE_PROVIDER,
          externalReference: generated.model,
          generatedAt: now,
          costUsd: generated.costUsd,
        }),
        imageGenerationInProgress: FieldValue.delete(),
        updatedAt: now,
        updatedBy: userId,
      });
      transaction.update(usageRef, {
        status: "succeeded",
        result: "generated",
        model: generated.model,
        ...(generated.costUsd != null ? { costUsd: generated.costUsd } : {}),
        imagePath: stored!.imagePath,
        updatedAt: now,
        completedAt: now,
      });

      return { attached: true as const };
    });

    if (!finalResult.attached) {
      await deleteStoragePathSafely(restaurantId, productId, stored.imagePath);
      return {
        outcome: "skipped",
        productId,
        reason: finalResult.reason,
        idempotencyKey,
      };
    }

    if (replacedImagePath && replacedImagePath !== stored.imagePath) {
      await deleteStoragePathSafely(
        restaurantId,
        productId,
        replacedImagePath,
      );
    }

    return {
      outcome: "generated",
      productId,
      imageUrl: stored.imageUrl,
      imagePath: stored.imagePath,
      model: generated.model,
      provider: IMAGE_PROVIDER,
      idempotencyKey,
      ...(generated.costUsd != null ? { costUsd: generated.costUsd } : {}),
      ...(replacedImagePath ? { replacedImagePath } : {}),
    };
  } catch (error) {
    if (stored) {
      await deleteStoragePathSafely(restaurantId, productId, stored.imagePath);
    }
    await releaseGenerationLockSafely({
      db: params.db,
      productRef,
      usageRef,
      requestId,
      userId,
      error,
      ...(generatedMetadata?.model ? { model: generatedMetadata.model } : {}),
      ...(generatedMetadata?.costUsd != null
        ? { costUsd: generatedMetadata.costUsd }
        : {}),
    });
    throw error;
  }
}
