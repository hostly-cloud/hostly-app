import type { Firestore } from "firebase-admin/firestore";
import {
  HOSTLY_CATALOG_IMAGE_PLAN_POLICY,
  type CatalogImageAccess,
  type CatalogImageCreditCosts,
  type CatalogImageCreditPeriod,
} from "@/lib/productos/catalog-image-plan";
import { resolveHostlySubscriptionAccessFromRestaurant } from "@/lib/server/subscription/resolve-hostly-subscription-access";

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

const UNCONFIGURED_CREDIT_COSTS: CatalogImageCreditCosts = {
  aiSingle: null,
  aiBulk: null,
  catalogSearch: null,
};

function readCreditPeriod(value: unknown): CatalogImageCreditPeriod | null {
  const period = readObject(value);
  const id = typeof period?.id === "string" ? period.id.trim() : "";
  const startsAt = readNonNegativeInteger(period?.startsAt);
  const endsAt = readNonNegativeInteger(period?.endsAt);
  const allocation = readNonNegativeInteger(period?.allocation);
  if (
    !/^[A-Za-z0-9_-]{1,120}$/.test(id) ||
    startsAt == null ||
    endsAt == null ||
    allocation == null ||
    startsAt >= endsAt
  ) {
    return null;
  }
  return { id, startsAt, endsAt, allocation };
}

export function resolveCatalogImageAccessFromRestaurant(
  restaurant: Record<string, unknown> | null,
): CatalogImageAccess {
  const subscription = readObject(restaurant?.subscription);
  const { effectivePlan, source } =
    resolveHostlySubscriptionAccessFromRestaurant(restaurant);
  const catalogImages = readObject(subscription?.catalogImages);
  const creditCosts = readObject(catalogImages?.creditCosts);
  const meteringMode =
    catalogImages?.meteringMode === "credit_balance"
      ? "credit_balance"
      : "usage_recorded";

  return {
    effectivePlan,
    source,
    capabilities: [...HOSTLY_CATALOG_IMAGE_PLAN_POLICY[effectivePlan]],
    meteringMode,
    creditBalance:
      meteringMode === "credit_balance"
        ? readNonNegativeInteger(catalogImages?.creditBalance)
        : null,
    creditCosts:
      meteringMode === "credit_balance"
        ? {
            aiSingle: readNonNegativeInteger(creditCosts?.aiSingle),
            aiBulk: readNonNegativeInteger(creditCosts?.aiBulk),
            catalogSearch: readNonNegativeInteger(creditCosts?.catalogSearch),
          }
        : { ...UNCONFIGURED_CREDIT_COSTS },
    creditPeriod:
      meteringMode === "credit_balance"
        ? readCreditPeriod(catalogImages?.creditPeriod)
        : null,
  };
}

export async function resolveCatalogImageAccess(params: {
  db: Firestore;
  restaurantId: string;
}): Promise<CatalogImageAccess> {
  const restaurantId = params.restaurantId.trim();
  if (!restaurantId || restaurantId.includes("/") || restaurantId.includes("..")) {
    return resolveCatalogImageAccessFromRestaurant(null);
  }

  const snapshot = await params.db.collection("restaurants").doc(restaurantId).get();
  const data = snapshot.exists
    ? (snapshot.data() as Record<string, unknown>)
    : null;
  return resolveCatalogImageAccessFromRestaurant(data);
}
