import type { HostlyPlan } from "@/lib/subscription/hostly-plan";

export const HOSTLY_COMMERCIAL_PROPOSAL_VERSION = "2026-09-04.v1" as const;

export type HostlyCommercialProposalStatus = "proposed";

export type HostlyPlanCommercialProposal = {
  id: HostlyPlan;
  label: string;
  tagline: string;
  targetCustomer: string;
  recommended: boolean;
  monthlyPriceCents: number;
  annualPriceCents: number;
  employeeSeats: number | null;
  aiProductImagesMonthly: number;
  aiMenuImportsMonthly: number;
  aiProductImageBulk: boolean;
  multiLocationAnalytics: boolean;
  prioritySupport: boolean;
  includedModules: readonly string[];
  customerFacingHighlights: readonly string[];
};

/**
 * Propuesta comercial V1. No es una fuente de autorización ni activa bloqueos.
 *
 * El runtime debe seguir usando `hostly-entitlements.ts` y
 * `hostly-commercial-policy.ts` para cualquier enforcement. Esta estructura
 * existe para poder cerrar pricing, copy comercial y futuros mapeos de límites
 * sin mezclar una propuesta de negocio con permisos ya activos en producción.
 */
export const HOSTLY_COMMERCIAL_PROPOSAL = {
  version: HOSTLY_COMMERCIAL_PROPOSAL_VERSION,
  status: "proposed" as HostlyCommercialProposalStatus,
  currency: "EUR",
  vatIncluded: false,
  priceUnit: "per_location",
  trial: {
    plan: "pro" as HostlyPlan,
    days: 30,
    paymentMethodRequired: false,
  },
  annualBilling: {
    monthsCharged: 10,
    monthsIncluded: 12,
  },
  onboarding: {
    selfServicePriceCents: 0,
    assistedRemotePriceCents: 19900,
    includedWithUltraAnnual: true,
  },
  multiLocationDiscounts: [
    { minLocations: 2, maxLocations: 4, discountPercent: 10 },
    { minLocations: 5, maxLocations: 9, discountPercent: 15 },
    { minLocations: 10, maxLocations: null, discountPercent: null },
  ],
  launchOffer: {
    status: "proposed" as const,
    name: "Hostly Founders",
    maxLocations: 50,
    discountPercent: 20,
    durationMonths: 12,
    stackableWithAnnualDiscount: false,
  },
  commercialRules: {
    deviceFees: false,
    waiterDeviceFees: false,
    hostlyTransactionCommission: false,
    thirdPartyPaymentFeesSeparate: true,
    hardwareSeparate: true,
  },
  plans: [
    {
      id: "basic",
      label: "Básico",
      tagline: "Todo lo necesario para operar bien desde el primer servicio.",
      targetCustomer: "Bar, cafetería o restaurante pequeño que quiere digitalizar la operativa sin complejidad.",
      recommended: false,
      monthlyPriceCents: 3900,
      annualPriceCents: 39000,
      employeeSeats: 5,
      aiProductImagesMonthly: 0,
      aiMenuImportsMonthly: 0,
      aiProductImageBulk: false,
      multiLocationAnalytics: false,
      prioritySupport: false,
      includedModules: [
        "tpv.core",
        "tables.floorPlan",
        "orders.comandas",
        "kds.core",
        "reservations.core",
        "catalog.products",
        "catalog.categories",
        "catalog.modifiers",
        "catalog.manualImages",
        "inventory.basic",
        "analytics.essential",
        "employees.accounts",
      ],
      customerFacingHighlights: [
        "TPV, mesas y comandas",
        "Cocina y barra en tiempo real",
        "Reservas operativas",
        "Carta, productos y modificadores",
        "Stock básico",
        "Análisis esencial",
        "Hasta 5 empleados",
        "Dispositivos TPV sin coste adicional",
      ],
    },
    {
      id: "pro",
      label: "Pro",
      tagline: "Controla costes, equipo y crecimiento con IA útil.",
      targetCustomer: "Restaurante profesional que quiere controlar operación, margen, compras, equipo y carta desde una sola herramienta.",
      recommended: true,
      monthlyPriceCents: 7900,
      annualPriceCents: 79000,
      employeeSeats: 25,
      aiProductImagesMonthly: 100,
      aiMenuImportsMonthly: 5,
      aiProductImageBulk: false,
      multiLocationAnalytics: false,
      prioritySupport: true,
      includedModules: [
        "tpv.core",
        "tables.floorPlan",
        "orders.comandas",
        "kds.core",
        "reservations.advanced",
        "catalog.products",
        "catalog.categories",
        "catalog.modifiers",
        "catalog.manualImages",
        "catalog.image.ai.single",
        "catalog.import.ai",
        "inventory.full",
        "costing.recipes",
        "suppliers.core",
        "purchasing.core",
        "analytics.advanced",
        "employees.accounts",
        "employees.shifts",
        "employees.timeTracking",
        "employees.documents",
      ],
      customerFacingHighlights: [
        "Todo lo incluido en Básico",
        "Inventario completo, escandallos y margen",
        "Proveedores, compras y recepciones",
        "Análisis avanzado",
        "RRHH, turnos, fichajes y documentación",
        "Importación de carta con IA",
        "Hasta 100 imágenes IA al mes, una a una",
        "Hasta 25 empleados",
        "Soporte prioritario",
      ],
    },
    {
      id: "ultra",
      label: "Ultra",
      tagline: "Automatización e inteligencia para operaciones exigentes y grupos.",
      targetCustomer: "Restaurante de alto volumen, grupo hostelero o negocio que quiere exprimir automatización, IA y control multi-local.",
      recommended: false,
      monthlyPriceCents: 13900,
      annualPriceCents: 139000,
      employeeSeats: null,
      aiProductImagesMonthly: 500,
      aiMenuImportsMonthly: 20,
      aiProductImageBulk: true,
      multiLocationAnalytics: true,
      prioritySupport: true,
      includedModules: [
        "tpv.core",
        "tables.floorPlan",
        "orders.comandas",
        "kds.core",
        "reservations.advanced",
        "catalog.products",
        "catalog.categories",
        "catalog.modifiers",
        "catalog.manualImages",
        "catalog.image.ai.single",
        "catalog.image.ai.bulk",
        "catalog.import.ai",
        "inventory.full",
        "costing.recipes",
        "suppliers.core",
        "purchasing.core",
        "analytics.advanced",
        "analytics.multiLocation",
        "employees.accounts",
        "employees.shifts",
        "employees.timeTracking",
        "employees.documents",
        "audit.advanced",
        "automation.operationalAlerts",
        "ai.sommelierPairing",
      ],
      customerFacingHighlights: [
        "Todo lo incluido en Pro",
        "Hasta 500 imágenes IA al mes",
        "Generación de imágenes IA en lote",
        "Hasta 20 importaciones de carta IA al mes",
        "Empleados sin límite comercial",
        "Analítica consolidada multi-local",
        "Automatizaciones y alertas operativas",
        "Funciones IA premium como maridaje y Sommelier IA",
        "Auditoría avanzada y soporte prioritario",
      ],
    },
  ] satisfies readonly HostlyPlanCommercialProposal[],
} as const;

export function getHostlyCommercialProposalPlan(
  plan: HostlyPlan,
): (typeof HOSTLY_COMMERCIAL_PROPOSAL.plans)[number] {
  const proposal = HOSTLY_COMMERCIAL_PROPOSAL.plans.find(
    (candidate) => candidate.id === plan,
  );
  if (!proposal) {
    throw new Error(`HOSTLY_COMMERCIAL_PROPOSAL_MISSING:${plan}`);
  }
  return proposal;
}

export function formatHostlyProposedPrice(cents: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: HOSTLY_COMMERCIAL_PROPOSAL.currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
