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
  ai: ["ai.sommelierPairing"],
} as const;

export type HostlyEntitlement =
  (typeof HOSTLY_ENTITLEMENTS)[keyof typeof HOSTLY_ENTITLEMENTS][number];

/**
 * Matriz comercial confirmada.
 * - Básico: producto TPV solo clicable; sin ficha gastronómica ni Sommelier.
 * - Pro: ficha gastronómica (alérgenos + perfil de vino), sin maridajes IA.
 * - Ultra: Pro + Sommelier IA bidireccional sobre productos reales del tenant.
 */
export const HOSTLY_PLAN_ENTITLEMENTS: Readonly<
  Record<HostlyPlan, readonly HostlyEntitlement[]>
> = {
  basic: [],
  pro: [
    "catalog.image.ai.single",
    "catalog.image.catalogSearch",
    "tpv.productInfo.gastronomy",
  ],
  ultra: [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
    "tpv.productInfo.gastronomy",
    "ai.sommelierPairing",
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
