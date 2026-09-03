import type {
  CatalogImageBulkEstimate,
  CatalogImageBulkSummary,
} from "@/lib/productos/catalog-image-bulk-contract";

export type CatalogImageBulkReadiness = {
  pendingTotal: number;
  automaticNow: number;
  reviewNow: number;
  alreadyProcessing: number;
  aiGeneration: number;
  catalogSearch: number;
  manualReview: number;
  pendingReview: number;
  accountedPending: number;
  isConsistent: boolean;
};

/**
 * Presenta el alcance real del preflight sin cambiar sus reglas de elegibilidad.
 * "automaticNow" significa que Hostly puede preparar una imagen/candidatos sin
 * intervención previa; nunca implica publicación automática.
 */
export function summarizeCatalogImageBulkReadiness(
  summary: CatalogImageBulkSummary,
): CatalogImageBulkReadiness {
  const automaticNow = summary.aiGenerable + summary.catalogSearchable;
  const reviewNow = summary.manualReview + summary.pendingReview;
  const accountedPending = automaticNow + reviewNow + summary.alreadyProcessing;

  return {
    pendingTotal: summary.withoutApprovedImage,
    automaticNow,
    reviewNow,
    alreadyProcessing: summary.alreadyProcessing,
    aiGeneration: summary.aiGenerable,
    catalogSearch: summary.catalogSearchable,
    manualReview: summary.manualReview,
    pendingReview: summary.pendingReview,
    accountedPending,
    isConsistent: accountedPending === summary.withoutApprovedImage,
  };
}

export function catalogImageBulkEstimateLabel(
  estimate: CatalogImageBulkEstimate,
): string {
  if (estimate.credits != null) {
    return `${estimate.credits} ${estimate.credits === 1 ? "crédito estimado" : "créditos estimados"}`;
  }
  return estimate.mode === "usage_recorded"
    ? "Uso registrado"
    : "Créditos por confirmar";
}
