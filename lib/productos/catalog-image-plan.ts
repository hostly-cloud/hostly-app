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

export type CatalogImageMeteringMode = "usage_recorded";

export type CatalogImageAccess = {
  effectivePlan: HostlyCatalogImagePlan;
  source: CatalogImagePlanSource;
  capabilities: CatalogImageCapability[];
  meteringMode: CatalogImageMeteringMode;
};

/**
 * Política comercial centralizada. Los límites cuantitativos se añadirán aquí
 * cuando exista un ledger de créditos; no deben repartirse por la interfaz.
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
 * Los créditos y precios permanecen sin fijar hasta que exista facturación.
 */
export type HostlyCatalogImageBulkPolicy = {
  maxConcurrentItemsPerJob: number;
  maxAttemptsPerItem: number;
  maxReviewItemsPerRequest: number;
  leaseDurationMs: number;
  aiGenerationCreditsPerItem: number | null;
  catalogSearchCreditsPerItem: number | null;
};

export const HOSTLY_CATALOG_IMAGE_BULK_POLICY: Readonly<HostlyCatalogImageBulkPolicy> = {
  maxConcurrentItemsPerJob: 1,
  maxAttemptsPerItem: 3,
  maxReviewItemsPerRequest: 50,
  leaseDurationMs: 2 * 60 * 1000,
  aiGenerationCreditsPerItem: null,
  catalogSearchCreditsPerItem: null,
};

export function hasCatalogImageCapability(
  access: CatalogImageAccess,
  capability: CatalogImageCapability,
): boolean {
  return access.capabilities.includes(capability);
}

export function catalogImagePlanLabel(
  plan: HostlyCatalogImagePlan,
): string {
  return plan === "basic" ? "Básico" : plan === "pro" ? "Pro" : "Ultra";
}
