import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  evaluateCatalogImageCreditDecision,
  hasCatalogImageCapability,
  type CatalogImageCapability,
} from "@/lib/productos/catalog-image-plan";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";

export class CatalogImageMeteringError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "CatalogImageMeteringError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function assertIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(normalized)) {
    throw new CatalogImageMeteringError(
      "INVALID_IMAGE_IDEMPOTENCY_KEY",
      "Identificador idempotente inválido",
      400,
    );
  }
  return normalized;
}

export async function reserveCatalogImageOperation(params: {
  db: Firestore;
  restaurantId: string;
  productId: string;
  userId: string;
  idempotencyKey: string;
  capability: CatalogImageCapability;
  operation: string;
  provider: string;
  jobId?: string;
}) {
  const idempotencyKey = assertIdempotencyKey(params.idempotencyKey);
  const restaurantRef = params.db
    .collection("restaurants")
    .doc(params.restaurantId);
  const usageRef = restaurantRef
    .collection("catalogImageUsage")
    .doc(idempotencyKey);
  const acquisition = await params.db.runTransaction(async (transaction) => {
    const restaurantSnapshot = await transaction.get(restaurantRef);
    const usageSnapshot = await transaction.get(usageRef);
    if (usageSnapshot.exists) return { duplicate: true as const };
    const access = resolveCatalogImageAccessFromRestaurant(
      restaurantSnapshot.exists
        ? (restaurantSnapshot.data() as Record<string, unknown>)
        : null,
    );
    if (!hasCatalogImageCapability(access, params.capability)) {
      throw new CatalogImageMeteringError(
        "CATALOG_IMAGE_PLAN_REQUIRED",
        "El plan actual no permite esta operación de imagen",
        403,
      );
    }
    const decision = evaluateCatalogImageCreditDecision(
      access,
      params.capability,
    );
    const now = Date.now();
    const base = {
      restaurantId: params.restaurantId,
      productId: params.productId,
      userId: params.userId,
      idempotencyKey,
      ...(params.jobId ? { jobId: params.jobId } : {}),
      capability: params.capability,
      operation: params.operation,
      provider: params.provider,
      effectivePlan: access.effectivePlan,
      planSource: access.source,
      meteringMode: access.meteringMode,
      createdAt: now,
      updatedAt: now,
    };
    if (
      decision.status === "configuration_required" ||
      decision.status === "insufficient"
    ) {
      const failureReason =
        decision.status === "insufficient"
          ? "CATALOG_IMAGE_CREDITS_EXHAUSTED"
          : "CATALOG_IMAGE_CREDIT_CONFIGURATION_REQUIRED";
      transaction.create(usageRef, {
        ...base,
        status: "failed",
        result: "blocked",
        failureReason,
        creditStatus: "blocked",
        ...(decision.creditCost != null
          ? { creditCost: decision.creditCost }
          : {}),
        ...(access.creditBalance != null
          ? { creditBalanceBefore: access.creditBalance }
          : {}),
        completedAt: now,
      });
      return { duplicate: false as const, failureReason };
    }
    if (decision.status === "available") {
      transaction.update(restaurantRef, {
        "subscription.catalogImages.creditBalance":
          decision.creditBalanceAfter,
      });
    }
    transaction.create(usageRef, {
      ...base,
      status: "processing",
      ...(decision.status === "available"
        ? {
            creditStatus: "reserved",
            creditCost: decision.creditCost,
            creditBalanceBefore: decision.creditBalanceBefore,
            creditBalanceAfter: decision.creditBalanceAfter,
          }
        : {}),
    });
    return { duplicate: false as const };
  });

  if ("failureReason" in acquisition && acquisition.failureReason) {
    throw new CatalogImageMeteringError(
      acquisition.failureReason,
      acquisition.failureReason === "CATALOG_IMAGE_CREDITS_EXHAUSTED"
        ? "No quedan créditos suficientes para esta operación"
        : "La configuración de créditos de imágenes está incompleta",
      acquisition.failureReason === "CATALOG_IMAGE_CREDITS_EXHAUSTED"
        ? 402
        : 503,
    );
  }
  if (acquisition.duplicate) {
    throw new CatalogImageMeteringError(
      "CATALOG_IMAGE_DUPLICATE_REQUEST",
      "Esta operación ya se ha procesado",
      409,
    );
  }
  return { restaurantRef, usageRef };
}

export async function finalizeCatalogImageOperation(params: {
  db: Firestore;
  restaurantId: string;
  idempotencyKey: string;
  result: string;
  succeeded: boolean;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}) {
  const idempotencyKey = assertIdempotencyKey(params.idempotencyKey);
  const restaurantRef = params.db
    .collection("restaurants")
    .doc(params.restaurantId);
  const usageRef = restaurantRef
    .collection("catalogImageUsage")
    .doc(idempotencyKey);
  await params.db.runTransaction(async (transaction) => {
    const usageSnapshot = await transaction.get(usageRef);
    if (!usageSnapshot.exists) return;
    const usage = usageSnapshot.data() as Record<string, unknown>;
    const reservedCost =
      usage.creditStatus === "reserved" &&
      typeof usage.creditCost === "number" &&
      Number.isSafeInteger(usage.creditCost) &&
      usage.creditCost >= 0
        ? usage.creditCost
        : null;
    if (!params.succeeded && reservedCost != null && reservedCost > 0) {
      transaction.update(restaurantRef, {
        "subscription.catalogImages.creditBalance":
          FieldValue.increment(reservedCost),
      });
    }
    const now = Date.now();
    transaction.update(usageRef, {
      status: params.succeeded ? "succeeded" : "failed",
      result: params.result,
      ...(params.failureReason ? { failureReason: params.failureReason } : {}),
      ...(params.metadata ?? {}),
      ...(reservedCost != null
        ? { creditStatus: params.succeeded ? "consumed" : "released" }
        : {}),
      updatedAt: now,
      completedAt: now,
    });
  });
}
