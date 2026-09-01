import type { Firestore } from "firebase-admin/firestore";
import {
  HOSTLY_CATALOG_IMAGE_PLAN_POLICY,
  HOSTLY_CATALOG_IMAGE_PLANS,
  type CatalogImageAccess,
  type HostlyCatalogImagePlan,
} from "@/lib/productos/catalog-image-plan";

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizePlan(value: unknown): HostlyCatalogImagePlan | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (HOSTLY_CATALOG_IMAGE_PLANS as readonly string[]).includes(normalized)
    ? (normalized as HostlyCatalogImagePlan)
    : null;
}

/**
 * `subscription.plan` es el contrato canónico futuro. `billing.plan` y `plan`
 * se leen únicamente como aliases de transición para no romper tenants previos.
 */
export function resolveCatalogImageAccessFromRestaurant(
  restaurant: Record<string, unknown> | null,
): CatalogImageAccess {
  const subscription = readObject(restaurant?.subscription);
  const billing = readObject(restaurant?.billing);
  const subscriptionPlan = normalizePlan(subscription?.plan);
  const legacyPlan =
    normalizePlan(billing?.plan) ?? normalizePlan(restaurant?.plan);
  const configuredPlan = subscriptionPlan ?? legacyPlan;

  const effectivePlan = configuredPlan ?? "pro";
  return {
    effectivePlan,
    source: subscriptionPlan
      ? "subscription"
      : legacyPlan
        ? "legacy_field"
        : "legacy_compatibility",
    capabilities: [...HOSTLY_CATALOG_IMAGE_PLAN_POLICY[effectivePlan]],
    meteringMode: "usage_recorded",
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
