import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HOSTLY_CATALOG_IMAGE_CREDIT_POLICY } from "@/lib/productos/catalog-image-plan";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";

function simpleId(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(normalized)) {
    throw new Error(`INVALID_CATALOG_IMAGE_CREDIT_${label.toUpperCase()}`);
  }
  return normalized;
}

function actorId(value: string): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!normalized || normalized.length > 160) {
    throw new Error("INVALID_CATALOG_IMAGE_CREDIT_ACTOR_ID");
  }
  return normalized;
}

function reservedCost(data: Record<string, unknown>): number | null {
  return data.creditStatus === "reserved" &&
    typeof data.creditCost === "number" &&
    Number.isSafeInteger(data.creditCost) &&
    data.creditCost >= 0
    ? data.creditCost
    : null;
}

function ledgerId(usageId: string): string {
  return `release_${createHash("sha256").update(usageId).digest("hex")}`;
}

export type CatalogImageCreditReconciliationResult = {
  scanned: number;
  released: number;
  creditsReleased: number;
  skipped: number;
};

export async function reconcileExpiredCatalogImageCreditReservations(params: {
  db: Firestore;
  restaurantId: string;
  actorId: string;
  now?: number;
  limit?: number;
}): Promise<CatalogImageCreditReconciliationResult> {
  const restaurantId = simpleId(params.restaurantId, "restaurant_id");
  const reconciledBy = actorId(params.actorId);
  const now = params.now ?? Date.now();
  const limit = Math.min(
    HOSTLY_CATALOG_IMAGE_CREDIT_POLICY.reconciliationBatchSize,
    Math.max(1, params.limit ?? HOSTLY_CATALOG_IMAGE_CREDIT_POLICY.reconciliationBatchSize),
  );
  const restaurantRef = params.db.collection("restaurants").doc(restaurantId);
  const usageSnapshot = await restaurantRef
    .collection("catalogImageUsage")
    .where("creditLeaseExpiresAt", "<=", now)
    .limit(limit)
    .get();

  const result: CatalogImageCreditReconciliationResult = {
    scanned: usageSnapshot.size,
    released: 0,
    creditsReleased: 0,
    skipped: 0,
  };
  for (const candidate of usageSnapshot.docs) {
    const usageRef = candidate.ref;
    const creditLedgerRef = restaurantRef
      .collection("catalogImageCreditLedger")
      .doc(ledgerId(candidate.id));
    const released = await params.db.runTransaction(async (transaction) => {
      const restaurantSnapshot = await transaction.get(restaurantRef);
      const usage = await transaction.get(usageRef);
      const ledger = await transaction.get(creditLedgerRef);
      if (!restaurantSnapshot.exists || !usage.exists || ledger.exists) return null;
      const restaurant = restaurantSnapshot.data() as Record<string, unknown>;
      const data = usage.data() as Record<string, unknown>;
      const access = resolveCatalogImageAccessFromRestaurant(restaurant);
      const cost = reservedCost(data);
      const leaseExpiresAt =
        typeof data.creditLeaseExpiresAt === "number" &&
        Number.isSafeInteger(data.creditLeaseExpiresAt)
          ? data.creditLeaseExpiresAt
          : null;
      if (
        access.meteringMode !== "credit_balance" ||
        access.creditBalance == null ||
        cost == null ||
        leaseExpiresAt == null ||
        leaseExpiresAt > now ||
        data.status !== "processing" ||
        data.restaurantId !== restaurantId
      ) {
        return null;
      }
      if (cost > 0) {
        transaction.update(restaurantRef, {
          "subscription.catalogImages.creditBalance": FieldValue.increment(cost),
        });
      }
      transaction.update(usageRef, {
        status: "failed",
        result: "reconciled",
        failureReason: "CREDIT_RESERVATION_EXPIRED",
        creditStatus: "released",
        reconciledAt: now,
        reconciledBy,
        updatedAt: now,
        completedAt: now,
      });
      transaction.create(creditLedgerRef, {
        restaurantId,
        idempotencyKey: creditLedgerRef.id,
        type: "expired_reservation_released",
        usageId: usageRef.id,
        ...(typeof data.creditPeriodId === "string"
          ? { periodId: data.creditPeriodId }
          : {}),
        delta: cost,
        balanceBefore: access.creditBalance,
        balanceAfter: access.creditBalance + cost,
        operatorId: reconciledBy,
        reason: "CREDIT_RESERVATION_EXPIRED",
        createdAt: now,
      });
      return cost;
    });
    if (released == null) {
      result.skipped += 1;
    } else {
      result.released += 1;
      result.creditsReleased += released;
    }
  }
  return result;
}
