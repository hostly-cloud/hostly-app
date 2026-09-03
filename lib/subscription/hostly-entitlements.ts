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
} as const;

export type HostlyEntitlement =
  (typeof HOSTLY_ENTITLEMENTS)[keyof typeof HOSTLY_ENTITLEMENTS][number];

/**
 * Solo contiene diferencias comerciales ya decididas y activas en Hostly.
 * Nuevos módulos deben añadirse cuando su pertenencia a un plan esté definida,
 * no por anticipación.
 */
export const HOSTLY_PLAN_ENTITLEMENTS: Readonly<
  Record<HostlyPlan, readonly HostlyEntitlement[]>
> = {
  basic: [],
  pro: ["catalog.image.ai.single", "catalog.image.catalogSearch"],
  ultra: [
    "catalog.image.ai.single",
    "catalog.image.ai.bulk",
    "catalog.image.catalogSearch",
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
