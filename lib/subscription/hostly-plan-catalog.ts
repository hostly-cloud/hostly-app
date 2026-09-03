import type { HostlyPlan } from "@/lib/subscription/hostly-plan";

export type HostlyPlanCatalogEntry = {
  id: HostlyPlan;
  label: string;
  order: number;
  status: "defined";
  featureAssignmentStatus: "pending";
  pricingStatus: "pending";
};

/**
 * Catálogo comercial estable de Hostly.
 *
 * Los planes existen como identidad comercial, pero su matriz final de funciones
 * y sus precios se decidirán cuando el producto esté suficientemente cerrado.
 * No añadir aquí capacidades, límites ni importes provisionales.
 */
export const HOSTLY_PLAN_CATALOG = [
  {
    id: "basic",
    label: "Básico",
    order: 1,
    status: "defined",
    featureAssignmentStatus: "pending",
    pricingStatus: "pending",
  },
  {
    id: "pro",
    label: "Pro",
    order: 2,
    status: "defined",
    featureAssignmentStatus: "pending",
    pricingStatus: "pending",
  },
  {
    id: "ultra",
    label: "Ultra",
    order: 3,
    status: "defined",
    featureAssignmentStatus: "pending",
    pricingStatus: "pending",
  },
] as const satisfies readonly HostlyPlanCatalogEntry[];

export function getHostlyPlanCatalogEntry(
  plan: HostlyPlan,
): (typeof HOSTLY_PLAN_CATALOG)[number] {
  const entry = HOSTLY_PLAN_CATALOG.find((candidate) => candidate.id === plan);
  if (!entry) {
    throw new Error(`HOSTLY_PLAN_CATALOG_MISSING:${plan}`);
  }
  return entry;
}
