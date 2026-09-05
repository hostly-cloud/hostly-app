import type { HostlyPlan } from "@/lib/subscription/hostly-plan";
import { hasHostlyPlanEntitlement } from "@/lib/subscription/hostly-entitlements";

export type TpvProductInfoAccess = {
  canOpenGastronomy: boolean;
  canSeeAllergens: boolean;
  canSeeWineProfile: boolean;
  canSeeAiPairings: boolean;
};

/**
 * Contrato comercial de la ficha rápida de producto en TPV.
 * La UI consume este helper; no debe reimplementar la matriz de planes.
 */
export function resolveTpvProductInfoAccess(plan: HostlyPlan): TpvProductInfoAccess {
  const canOpenGastronomy = hasHostlyPlanEntitlement(
    plan,
    "tpv.productInfo.gastronomy",
  );
  const canSeeAiPairings = hasHostlyPlanEntitlement(
    plan,
    "ai.sommelierPairing",
  );
  return {
    canOpenGastronomy,
    canSeeAllergens: canOpenGastronomy,
    canSeeWineProfile: canOpenGastronomy,
    canSeeAiPairings,
  };
}
