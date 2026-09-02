export const CATALOG_IMAGE_CAPABILITIES = [
  "catalog.image.ai.single",
  "catalog.image.ai.bulk",
  "catalog.image.catalogSearch",
] as const;

export type CatalogImageCapability =
  (typeof CATALOG_IMAGE_CAPABILITIES)[number];

export const HOSTLY_CATALOG_IMAGE_PLANS = ["basic", "pro", "ultra"] as const;

export type HostlyCatalogImagePlan =
  (typeof HOSTLY_CATALOG_IMAGE_PLANS)[number];

export type CatalogImagePlanSource =
  | "subscription"
  | "legacy_field"
  | "legacy_compatibility";

export type CatalogImageMeteringMode = "usage_recorded" | "credit_balance";

export type CatalogImageCreditCosts = {
  aiSingle: number | null;
  aiBulk: number | null;
  catalogSearch: number | null;
};

export type CatalogImageAccess = {
  effectivePlan: HostlyCatalogImagePlan;
  source: CatalogImagePlanSource;
  capabilities: CatalogImageCapability[];
  meteringMode: CatalogImageMeteringMode;
  creditBalance: number | null;
  creditCosts: CatalogImageCreditCosts;
};

export type CatalogImageCreditDecision =
  | { status: "unmetered"; creditCost: null }
  | {
      status: "available";
      creditCost: number;
      creditBalanceBefore: number;
      creditBalanceAfter: number;
    }
  | { status: "configuration_required"; creditCost: number | null }
  | {
      status: "insufficient";
      creditCost: number;
      creditBalance: number;
    };

/**
 * Política comercial centralizada. Los precios y las asignaciones cuantitativas
 * se configuran por tenant bajo la autoridad server-only de `subscription`.
 */
export const HOSTLY_CATALOG_IMAGE_PLAN_POLICY: Readonly<
  Record<HostlyCatalogImagePlan, readonly CatalogImageCapability[]>
> = {
  basic: [],
  pro: ["catalog.image.ai.single", "catalog.image.catalogSearch"],
  ultra: [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
  ],
};

/**
 * Configuración operativa y comercial centralizada para trabajos masivos.
 * Los importes de créditos no viven aquí: esta política solo acota la cola.
 */
export type HostlyCatalogImageBulkPolicy = {
  maxConcurrentItemsPerJob: number;
  maxAttemptsPerItem: number;
  maxReviewItemsPerRequest: number;
  leaseDurationMs: number;
};

export const HOSTLY_CATALOG_IMAGE_BULK_POLICY: Readonly<HostlyCatalogImageBulkPolicy> = {
  maxConcurrentItemsPerJob: 1,
  maxAttemptsPerItem: 3,
  maxReviewItemsPerRequest: 50,
  leaseDurationMs: 2 * 60 * 1000,
};

export function hasCatalogImageCapability(
  access: CatalogImageAccess,
  capability: CatalogImageCapability,
): boolean {
  return access.capabilities.includes(capability);
}

export function catalogImageCreditCost(
  access: CatalogImageAccess,
  capability: CatalogImageCapability,
): number | null {
  return capability === "catalog.image.ai.single"
    ? access.creditCosts.aiSingle
    : capability === "catalog.image.ai.bulk"
      ? access.creditCosts.aiBulk
      : access.creditCosts.catalogSearch;
}

export function evaluateCatalogImageCreditDecision(
  access: CatalogImageAccess,
  capability: CatalogImageCapability,
): CatalogImageCreditDecision {
  if (access.meteringMode === "usage_recorded") {
    return { status: "unmetered", creditCost: null };
  }
  const creditCost = catalogImageCreditCost(access, capability);
  if (creditCost == null || access.creditBalance == null) {
    return { status: "configuration_required", creditCost };
  }
  if (access.creditBalance < creditCost) {
    return {
      status: "insufficient",
      creditCost,
      creditBalance: access.creditBalance,
    };
  }
  return {
    status: "available",
    creditCost,
    creditBalanceBefore: access.creditBalance,
    creditBalanceAfter: access.creditBalance - creditCost,
  };
}

export function catalogImagePlanLabel(
  plan: HostlyCatalogImagePlan,
): string {
  return plan === "basic" ? "Básico" : plan === "pro" ? "Pro" : "Ultra";
}
