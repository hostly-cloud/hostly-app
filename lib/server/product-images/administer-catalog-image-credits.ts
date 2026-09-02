import type { Firestore } from "firebase-admin/firestore";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";

type CreditPeriodInput = {
  id: string;
  startsAt: number;
  endsAt: number;
  allocation: number;
};

export class CatalogImageCreditAdminError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CatalogImageCreditAdminError";
    this.code = code;
  }
}

function simpleId(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(normalized)) {
    throw new CatalogImageCreditAdminError(
      `INVALID_${label.toUpperCase()}`,
      `${label} no es válido`,
    );
  }
  return normalized;
}

function auditText(value: string, label: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new CatalogImageCreditAdminError(
      `INVALID_${label.toUpperCase()}`,
      `${label} no es válido`,
    );
  }
  return normalized;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CatalogImageCreditAdminError(
      `INVALID_${label.toUpperCase()}`,
      `${label} debe ser un entero no negativo`,
    );
  }
  return value;
}

function signedInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value === 0) {
    throw new CatalogImageCreditAdminError(
      `INVALID_${label.toUpperCase()}`,
      `${label} debe ser un entero distinto de cero`,
    );
  }
  return value;
}

function validPeriod(input: CreditPeriodInput, now: number): CreditPeriodInput {
  const period = {
    id: simpleId(input.id, "period_id"),
    startsAt: nonNegativeInteger(input.startsAt, "period_starts_at"),
    endsAt: nonNegativeInteger(input.endsAt, "period_ends_at"),
    allocation: nonNegativeInteger(input.allocation, "period_allocation"),
  };
  if (period.startsAt >= period.endsAt || period.startsAt > now || period.endsAt <= now) {
    throw new CatalogImageCreditAdminError(
      "INVALID_CREDIT_PERIOD_WINDOW",
      "El periodo debe estar activo en el momento de aplicarlo",
    );
  }
  return period;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

export async function startCatalogImageCreditPeriod(params: {
  db: Firestore;
  restaurantId: string;
  idempotencyKey: string;
  operatorId: string;
  reason: string;
  period: CreditPeriodInput;
  replaceActivePeriod?: boolean;
  now?: number;
}) {
  const restaurantId = simpleId(params.restaurantId, "restaurant_id");
  const idempotencyKey = simpleId(params.idempotencyKey, "idempotency_key");
  const operatorId = auditText(params.operatorId, "operator_id", 160);
  const reason = auditText(params.reason, "reason", 300);
  const now = params.now ?? Date.now();
  const period = validPeriod(params.period, now);
  const restaurantRef = params.db.collection("restaurants").doc(restaurantId);
  const ledgerRef = restaurantRef
    .collection("catalogImageCreditLedger")
    .doc(idempotencyKey);

  return params.db.runTransaction(async (transaction) => {
    const restaurantSnapshot = await transaction.get(restaurantRef);
    const ledgerSnapshot = await transaction.get(ledgerRef);
    if (ledgerSnapshot.exists) {
      const stored = ledgerSnapshot.data() as Record<string, unknown>;
      if (
        stored.type !== "period_started" ||
        stored.periodId !== period.id ||
        stored.allocation !== period.allocation ||
        stored.periodStartsAt !== period.startsAt ||
        stored.periodEndsAt !== period.endsAt ||
        stored.operatorId !== operatorId ||
        stored.reason !== reason
      ) {
        throw new CatalogImageCreditAdminError(
          "CREDIT_IDEMPOTENCY_KEY_CONFLICT",
          "La clave idempotente ya pertenece a otra operación",
        );
      }
      return {
        duplicate: true as const,
        balanceBefore: readNumber(stored.balanceBefore),
        balanceAfter: readNumber(stored.balanceAfter),
        periodId: typeof stored.periodId === "string" ? stored.periodId : period.id,
      };
    }
    if (!restaurantSnapshot.exists) {
      throw new CatalogImageCreditAdminError(
        "RESTAURANT_NOT_FOUND",
        "Restaurante no encontrado",
      );
    }
    const restaurant = restaurantSnapshot.data() as Record<string, unknown>;
    const access = resolveCatalogImageAccessFromRestaurant(restaurant);
    if (access.meteringMode !== "credit_balance" || access.creditBalance == null) {
      throw new CatalogImageCreditAdminError(
        "CREDIT_METERING_NOT_CONFIGURED",
        "El restaurante no tiene activada una configuración válida de saldo",
      );
    }
    if (
      access.creditPeriod &&
      access.creditPeriod.id === period.id
    ) {
      throw new CatalogImageCreditAdminError(
        "CREDIT_PERIOD_ALREADY_EXISTS",
        "El periodo ya existe; reutiliza la clave idempotente original",
      );
    }
    if (
      access.creditPeriod &&
      access.creditPeriod.id !== period.id &&
      access.creditPeriod.endsAt > now &&
      params.replaceActivePeriod !== true
    ) {
      throw new CatalogImageCreditAdminError(
        "ACTIVE_CREDIT_PERIOD_REPLACEMENT_REQUIRED",
        "Existe un periodo activo; confirma expresamente su sustitución",
      );
    }

    const balanceBefore = access.creditBalance;
    transaction.update(restaurantRef, {
      "subscription.catalogImages.creditBalance": period.allocation,
      "subscription.catalogImages.creditPeriod": {
        ...period,
        openedAt: now,
        openedBy: operatorId,
      },
    });
    transaction.create(ledgerRef, {
      restaurantId,
      idempotencyKey,
      type: "period_started",
      periodId: period.id,
      periodStartsAt: period.startsAt,
      periodEndsAt: period.endsAt,
      allocation: period.allocation,
      delta: period.allocation - balanceBefore,
      balanceBefore,
      balanceAfter: period.allocation,
      operatorId,
      reason,
      createdAt: now,
    });
    return {
      duplicate: false as const,
      balanceBefore,
      balanceAfter: period.allocation,
      periodId: period.id,
    };
  });
}

export async function adjustCatalogImageCreditBalance(params: {
  db: Firestore;
  restaurantId: string;
  idempotencyKey: string;
  operatorId: string;
  reason: string;
  delta: number;
  expectedPeriodId?: string;
  now?: number;
}) {
  const restaurantId = simpleId(params.restaurantId, "restaurant_id");
  const idempotencyKey = simpleId(params.idempotencyKey, "idempotency_key");
  const operatorId = auditText(params.operatorId, "operator_id", 160);
  const reason = auditText(params.reason, "reason", 300);
  const delta = signedInteger(params.delta, "credit_delta");
  const expectedPeriodId = params.expectedPeriodId
    ? simpleId(params.expectedPeriodId, "period_id")
    : null;
  const now = params.now ?? Date.now();
  const restaurantRef = params.db.collection("restaurants").doc(restaurantId);
  const ledgerRef = restaurantRef
    .collection("catalogImageCreditLedger")
    .doc(idempotencyKey);

  return params.db.runTransaction(async (transaction) => {
    const restaurantSnapshot = await transaction.get(restaurantRef);
    const ledgerSnapshot = await transaction.get(ledgerRef);
    if (ledgerSnapshot.exists) {
      const stored = ledgerSnapshot.data() as Record<string, unknown>;
      if (
        stored.type !== "balance_adjusted" ||
        stored.delta !== delta ||
        stored.operatorId !== operatorId ||
        stored.reason !== reason ||
        (typeof stored.periodId === "string" ? stored.periodId : null) !==
          expectedPeriodId
      ) {
        throw new CatalogImageCreditAdminError(
          "CREDIT_IDEMPOTENCY_KEY_CONFLICT",
          "La clave idempotente ya pertenece a otra operación",
        );
      }
      return {
        duplicate: true as const,
        balanceBefore: readNumber(stored.balanceBefore),
        balanceAfter: readNumber(stored.balanceAfter),
        periodId: typeof stored.periodId === "string" ? stored.periodId : null,
      };
    }
    if (!restaurantSnapshot.exists) {
      throw new CatalogImageCreditAdminError(
        "RESTAURANT_NOT_FOUND",
        "Restaurante no encontrado",
      );
    }
    const restaurant = restaurantSnapshot.data() as Record<string, unknown>;
    const access = resolveCatalogImageAccessFromRestaurant(restaurant);
    if (access.meteringMode !== "credit_balance" || access.creditBalance == null) {
      throw new CatalogImageCreditAdminError(
        "CREDIT_METERING_NOT_CONFIGURED",
        "El restaurante no tiene activada una configuración válida de saldo",
      );
    }
    if (access.creditPeriod && expectedPeriodId !== access.creditPeriod.id) {
      throw new CatalogImageCreditAdminError(
        expectedPeriodId ? "CREDIT_PERIOD_MISMATCH" : "CREDIT_PERIOD_REQUIRED",
        "Indica el periodo activo para evitar ajustar un saldo equivocado",
      );
    }
    if (!access.creditPeriod && expectedPeriodId) {
      throw new CatalogImageCreditAdminError(
        "CREDIT_PERIOD_MISMATCH",
        "El restaurante todavía no tiene un periodo activo",
      );
    }
    const balanceAfter = access.creditBalance + delta;
    if (!Number.isSafeInteger(balanceAfter) || balanceAfter < 0) {
      throw new CatalogImageCreditAdminError(
        "CREDIT_BALANCE_WOULD_BE_NEGATIVE",
        "El ajuste dejaría un saldo negativo o inválido",
      );
    }

    transaction.update(restaurantRef, {
      "subscription.catalogImages.creditBalance": balanceAfter,
    });
    transaction.create(ledgerRef, {
      restaurantId,
      idempotencyKey,
      type: "balance_adjusted",
      ...(access.creditPeriod ? { periodId: access.creditPeriod.id } : {}),
      delta,
      balanceBefore: access.creditBalance,
      balanceAfter,
      operatorId,
      reason,
      createdAt: now,
    });
    return {
      duplicate: false as const,
      balanceBefore: access.creditBalance,
      balanceAfter,
      periodId: access.creditPeriod?.id ?? null,
    };
  });
}
