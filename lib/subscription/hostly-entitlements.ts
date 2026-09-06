import type { HostlyPlan } from "@/lib/subscription/hostly-plan";

/**
 * Prestaciones comerciales contratadas por el restaurante.
 *
 * No confundir con `HostlyCapability` de `lib/auth/hostly-capabilities.ts`,
 * que representa permisos operativos de una persona según su rol.
 */
export const HOSTLY_ENTITLEMENTS = {
  catalogImages: [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
  ],
  tpvProductInfo: ["tpv.productInfo.gastronomy"],
  ai: ["ai.managerAnalytics", "ai.sommelierPairing"],
  posMigration: ["migration.products", "migration.full"],
} as const;

export type HostlyEntitlement =
  (typeof HOSTLY_ENTITLEMENTS)[keyof typeof HOSTLY_ENTITLEMENTS][number];

/**
 * Matriz comercial confirmada.
 * - Básico: producto TPV solo clicable; sin ficha gastronómica, IA gerencial, Sommelier ni migración automática.
 * - Pro: ficha gastronómica + Analytics IA + migración de carta/productos; sin maridajes IA ni migración completa.
 * - Ultra: Pro + Sommelier IA, imágenes en lote y migración operativa completa del restaurante.
 */
export const HOSTLY_PLAN_ENTITLEMENTS: Readonly<
  Record<HostlyPlan, readonly HostlyEntitlement[]>
> = {
  basic: [],
  pro: [
    "catalog.image.ai.single",
    "catalog.image.catalogSearch",
    "tpv.productInfo.gastronomy",
    "ai.managerAnalytics",
    "migration.products",
  ],
  ultra: [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
    "tpv.productInfo.gastronomy",
    "ai.managerAnalytics",
    "ai.sommelierPairing",
    "migration.products",
    "migration.full",
  ],
};

export function getHostlyPlanEntitlements(
  plan: HostlyPlan,
): readonly HostlyEntitlement[] {
  return HOSTLY_PLAN_ENTITLEMENTS[plan];
}

export function hasHostlyPlanEntitlement(
  plan: HostlyPlan,
  entitlement: HostlyEntitlement,
): boolean {
  return HOSTLY_PLAN_ENTITLEMENTS[plan].includes(entitlement);
}
