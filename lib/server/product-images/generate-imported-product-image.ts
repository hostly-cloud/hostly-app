import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  buildPendingAutomaticProductImageEnrichment,
  canAutomaticallyReplaceProductImage,
  readProductImageEnrichment,
} from "@/lib/carta/product-image-enrichment";
import { getHostlyStorageBucket } from "@/lib/firebase/admin";

const OPENAI_IMAGE_TIMEOUT_MS = 90_000;
const MAX_GENERATED_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_PROVIDER = "openai";

export type ProductImageGenerationSkipReason =
  | "not_imported"
  | "not_food"
  | "invalid_product_name"
  | "protected_existing_image";

export type ProductImageGenerationEligibility =
  | {
      eligible: true;
      name: string;
      categoryName: string;
      description?: string;
    }
  | {
      eligible: false;
      reason: ProductImageGenerationSkipReason;
    };

export type GenerateImportedProductImageResult =
  | {
      outcome: "generated";
      productId: string;
      imageUrl: string;
      imagePath: string;
      model: string;
      replacedImagePath?: string;
    }
  | {
      outcome: "skipped";
      productId: string;
      reason: ProductImageGenerationSkipReason;
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

/**
 * Primera fase deliberadamente conservadora:
 * - solo productos nacidos de Menu Import;
 * - solo `tipoVenta: plato`;
 * - nunca sustituye imágenes manuales, aprobadas o legacy protegidas.
 */
export function evaluateImportedProductImageEligibility(
  data: Record<string, unknown>,
): ProductImageGenerationEligibility {
  if (!readString(data, "importedFromMenuDraftId")) {
    return { eligible: false, reason: "not_imported" };
  }

  if (data.tipoVenta !== "plato" || data.productFamilyType === "drink") {
    return { eligible: false, reason: "not_food" };
  }

  const name = readString(data, "name") ?? "";
  if (name.length < 3) {
    return { eligible: false, reason: "invalid_product_name" };
  }

  if (!canAutomaticallyReplaceProductImage(readImageState(data))) {
    return { eligible: false, reason: "protected_existing_image" };
  }

  return {
    eligible: true,
    name: name.slice(0, 140),
    categoryName: (readString(data, "categoryName") ?? "Plato").slice(0, 100),
    ...(readString(data, "description")
      ? { description: readString(data, "description")!.slice(0, 360) }
      : {}),
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

function readImageQuality(): "low" | "medium" | "high" | "auto" {
  const raw = process.env.HOSTLY_OPENAI_IMAGE_QUALITY?.trim().toLowerCase();
  if (raw === "medium" || raw === "high" || raw === "auto") return raw;
  return "low";
}

async function generateImageWithOpenAi(prompt: string): Promise<{
  bytes: Buffer;
  model: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new GenerateImportedProductImageError(
      "IMAGE_GENERATION_NOT_CONFIGURED",
      "OPENAI_API_KEY no configurada",
      503,
    );
  }

  const model = process.env.HOSTLY_OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: "1024x1024",
        quality: readImageQuality(),
        background: "opaque",
        output_format: "webp",
        moderation: "auto",
      }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new GenerateImportedProductImageError(
        "IMAGE_PROVIDER_FAILED",
        `OpenAI image generation failed (${response.status})`,
        502,
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw new GenerateImportedProductImageError(
        "IMAGE_PROVIDER_INVALID_RESPONSE",
        "OpenAI devolvió una respuesta inválida",
        502,
      );
    }

    const base64 = (
      body as { data?: Array<{ b64_json?: unknown }> }
    )?.data?.[0]?.b64_json;
    if (typeof base64 !== "string" || !base64.trim()) {
      throw new GenerateImportedProductImageError(
        "IMAGE_PROVIDER_EMPTY_RESPONSE",
        "OpenAI no devolvió imagen",
        502,
      );
    }

    const bytes = Buffer.from(base64, "base64");
    if (bytes.length === 0 || bytes.length > MAX_GENERATED_IMAGE_BYTES) {
      throw new GenerateImportedProductImageError(
        "IMAGE_PROVIDER_INVALID_IMAGE",
        "La imagen generada no tiene un tamaño válido",
        502,
      );
    }

    return { bytes, model };
  } catch (error) {
    if (error instanceof GenerateImportedProductImageError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GenerateImportedProductImageError(
        "IMAGE_PROVIDER_TIMEOUT",
        "La generación de imagen agotó el tiempo disponible",
        504,
      );
    }
    throw new GenerateImportedProductImageError(
      "IMAGE_PROVIDER_FAILED",
      "No se pudo generar la imagen",
      502,
    );
  } finally {
    clearTimeout(timer);
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
  if (!trimmed || !trimmed.startsWith(productImagePrefix(restaurantId, productId))) return;
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
  const imagePath = `${productImagePrefix(restaurantId, productId)}ai/${Date.now()}-${randomUUID()}.webp`;
  const file = bucket.file(imagePath);

  try {
    await file.save(bytes, {
      resumable: false,
      metadata: {
        contentType: "image/webp",
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
  )}/o/${encodeURIComponent(imagePath)}?alt=media&token=${encodeURIComponent(token)}`;

  return { imagePath, imageUrl };
}

export async function generateImportedProductImage(params: {
  db: Firestore;
  restaurantId: string;
  productId: string;
  userId: string;
}): Promise<GenerateImportedProductImageResult> {
  const restaurantId = assertSimpleId(params.restaurantId, "restaurantId");
  const productId = assertSimpleId(params.productId, "productId");
  const userId = params.userId.trim();
  if (!userId) {
    throw new GenerateImportedProductImageError("UNAUTHORIZED", "Usuario requerido", 401);
  }

  const productRef = params.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("products")
    .doc(productId);

  const initialSnap = await productRef.get();
  if (!initialSnap.exists) {
    throw new GenerateImportedProductImageError(
      "PRODUCT_NOT_FOUND",
      "Producto no encontrado",
      404,
    );
  }

  const initialData = initialSnap.data() as Record<string, unknown>;
  const initialEligibility = evaluateImportedProductImageEligibility(initialData);
  if (!initialEligibility.eligible) {
    return { outcome: "skipped", productId, reason: initialEligibility.reason };
  }

  const prompt = buildImportedProductImagePrompt(initialEligibility);
  const generated = await generateImageWithOpenAi(prompt);
  const stored = await saveGeneratedImage(restaurantId, productId, generated.bytes);

  let replacedImagePath: string | undefined;
  try {
    const finalResult = await params.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(productRef);
      if (!snap.exists) {
        throw new GenerateImportedProductImageError(
          "PRODUCT_NOT_FOUND",
          "Producto no encontrado",
          404,
        );
      }

      const data = snap.data() as Record<string, unknown>;
      const eligibility = evaluateImportedProductImageEligibility(data);
      if (!eligibility.eligible) {
        return { attached: false as const, reason: eligibility.reason };
      }

      replacedImagePath = readString(data, "imagePath");
      const now = Date.now();
      transaction.update(productRef, {
        imageUrl: stored.imageUrl,
        imagePath: stored.imagePath,
        imageEnrichment: buildPendingAutomaticProductImageEnrichment({
          source: "ai_generated",
          confidence: 0.65,
          provider: IMAGE_PROVIDER,
          externalReference: generated.model,
          generatedAt: now,
        }),
        updatedAt: now,
        updatedBy: userId,
      });

      return { attached: true as const };
    });

    if (!finalResult.attached) {
      await deleteStoragePathSafely(restaurantId, productId, stored.imagePath);
      return { outcome: "skipped", productId, reason: finalResult.reason };
    }
  } catch (error) {
    await deleteStoragePathSafely(restaurantId, productId, stored.imagePath);
    throw error;
  }

  if (replacedImagePath && replacedImagePath !== stored.imagePath) {
    await deleteStoragePathSafely(restaurantId, productId, replacedImagePath);
  }

  return {
    outcome: "generated",
    productId,
    imageUrl: stored.imageUrl,
    imagePath: stored.imagePath,
    model: generated.model,
    ...(replacedImagePath ? { replacedImagePath } : {}),
  };
}
