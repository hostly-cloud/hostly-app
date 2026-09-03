import {
  subscriptionAccessHasEntitlement,
  type HostlySubscriptionAccess,
} from "@/lib/subscription/hostly-subscription-access";

export type CatalogImageSubscriptionUiAccess = {
  canGenerateSingle: boolean;
  canSearchCatalog: boolean;
  canGenerateBulk: boolean;
};

export function resolveCatalogImageSubscriptionUiAccess(
  access: HostlySubscriptionAccess,
): CatalogImageSubscriptionUiAccess {
  return {
    canGenerateSingle: subscriptionAccessHasEntitlement(
      access,
      "catalog.image.ai.single",
    ),
    canSearchCatalog: subscriptionAccessHasEntitlement(
      access,
      "catalog.image.catalogSearch",
    ),
    canGenerateBulk: subscriptionAccessHasEntitlement(
      access,
      "catalog.image.ai.bulk",
    ),
  };
}
