import type { Firestore } from "firebase-admin/firestore";
import { HOSTLY_CATALOG_IMAGE_CREDIT_POLICY } from "@/lib/productos/catalog-image-plan";
import type {
  CatalogImageCreditAccountSummary,
  CatalogImageCreditUsageItem,
} from "@/lib/productos/catalog-image-credit-contract";
import { resolveCatalogImageAccessFromRestaurant } from "@/lib/server/product-images/resolve-catalog-image-access";

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveCredit(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

export async function readCatalogImageCreditSummary(params: {
  db: Firestore;
  restaurantId: string;
}): Promise<CatalogImageCreditAccountSummary> {
  const restaurantRef = params.db.collection("restaurants").doc(params.restaurantId);
  const [restaurantSnapshot, usageSnapshot] = await Promise.all([
    restaurantRef.get(),
    restaurantRef
      .collection("catalogImageUsage")
      .orderBy("createdAt", "desc")
      .limit(HOSTLY_CATALOG_IMAGE_CREDIT_POLICY.usageSummaryLimit)
      .get(),
  ]);
  const access = resolveCatalogImageAccessFromRestaurant(
    restaurantSnapshot.exists
      ? (restaurantSnapshot.data() as Record<string, unknown>)
      : null,
  );
  const currentPeriodId = access.creditPeriod?.id ?? null;
  const usage = {
    operations: 0,
    succeeded: 0,
    failed: 0,
    blocked: 0,
    consumedCredits: 0,
    reservedCredits: 0,
    releasedCredits: 0,
  };
  const recentUsage: CatalogImageCreditUsageItem[] = [];

  for (const document of usageSnapshot.docs) {
    const data = document.data() as Record<string, unknown>;
    if (data.restaurantId !== params.restaurantId) continue;
    if (currentPeriodId && data.creditPeriodId !== currentPeriodId) continue;
    usage.operations += 1;
    if (data.status === "succeeded") usage.succeeded += 1;
    if (data.status === "failed") usage.failed += 1;
    if (data.creditStatus === "blocked") usage.blocked += 1;
    const creditCost = positiveCredit(data.creditCost);
    if (data.creditStatus === "consumed") usage.consumedCredits += creditCost;
    if (data.creditStatus === "reserved") usage.reservedCredits += creditCost;
    if (data.creditStatus === "released") usage.releasedCredits += creditCost;
    if (recentUsage.length < 20) {
      recentUsage.push({
        id: document.id,
        operation: string(data.operation) ?? "unknown",
        productId: string(data.productId),
        status: string(data.status) ?? "unknown",
        result: string(data.result),
        creditStatus: string(data.creditStatus),
        creditCost: number(data.creditCost),
        provider: string(data.provider),
        model: string(data.model),
        costUsd: number(data.costUsd),
        createdAt: number(data.createdAt),
        completedAt: number(data.completedAt),
      });
    }
  }

  return { access, period: access.creditPeriod, usage, recentUsage };
}
