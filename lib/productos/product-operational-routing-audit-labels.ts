import type { TranslateFn } from "@/lib/i18n";
import type { KdsDestination } from "@/lib/kds/kds-destination";
import type {
  ProductOperationalRoutingAudit,
  ProductOperationalRoutingAuditStatus,
  ProductResolverParityAudit,
  ProductResolverParityIssue,
} from "@/lib/productos/product-operational-routing-audit";

const KDS_DESTINATION_LABEL: Record<KdsDestination, string> = {
  kitchen: "Cocina",
  bar: "Barra",
  cocktail: "Coctelería",
  none: "Sin destino",
};

export type ProductOperationalRoutingAuditPresentation = {
  shortLabel: string;
  title: string;
  tone: "ok" | "warning" | "danger";
};

function statusI18nKey(status: ProductOperationalRoutingAuditStatus): string {
  switch (status) {
    case "ok":
      return "productos.routingAuditOk";
    case "no_destination":
      return "productos.routingAuditNoDestination";
    case "legacy_station_only":
      return "productos.routingAuditLegacy";
    case "incomplete_operation_station":
      return "productos.routingAuditIncomplete";
    case "conflict":
      return "productos.routingAuditConflict";
    case "heuristic":
      return "productos.routingAuditHeuristic";
    default:
      return "productos.routingAuditNoDestination";
  }
}

function statusTitleI18nKey(status: ProductOperationalRoutingAuditStatus): string {
  switch (status) {
    case "ok":
      return "productos.routingAuditOkTitle";
    case "no_destination":
      return "productos.routingAuditNoDestinationTitle";
    case "legacy_station_only":
      return "productos.routingAuditLegacyTitle";
    case "incomplete_operation_station":
      return "productos.routingAuditIncompleteTitle";
    case "conflict":
      return "productos.routingAuditConflictTitle";
    case "heuristic":
      return "productos.routingAuditHeuristicTitle";
    default:
      return "productos.routingAuditNoDestinationTitle";
  }
}

export function presentProductOperationalRoutingAudit(
  audit: ProductOperationalRoutingAudit,
  t: TranslateFn,
): ProductOperationalRoutingAuditPresentation {
  const destLabel = KDS_DESTINATION_LABEL[audit.kdsDestination];
  const title = t(statusTitleI18nKey(audit.status), { destination: destLabel });

  let tone: ProductOperationalRoutingAuditPresentation["tone"] = "warning";
  if (audit.status === "ok") tone = "ok";
  if (audit.status === "conflict") tone = "danger";

  return {
    shortLabel: t(statusI18nKey(audit.status)),
    title,
    tone,
  };
}

export type ProductResolverParityRecommendationSeverity =
  | "ok"
  | "warning"
  | "danger"
  | "info";

export type ProductResolverParityRecommendation = {
  title: string;
  description: string;
  severity: ProductResolverParityRecommendationSeverity;
};

function recommendationSeverityForIssue(
  issue: ProductResolverParityIssue,
): ProductResolverParityRecommendationSeverity {
  switch (issue) {
    case "OK":
      return "ok";
    case "DIVERGENCIA_BUCKET":
    case "DIVERGENCIA_STATION":
    case "DIVERGENCIA_PREPARATION_AREA":
      return "danger";
    case "FALTA_STATION":
    case "FALLBACK_HEURISTICO":
      return "warning";
    case "SIN_OPERATION_STATION":
      return "info";
    default:
      return "ok";
  }
}

/** Issue guía para la recomendación (estructural primero; luego avisos informativos). */
function resolveRecommendationIssue(
  parity: ProductResolverParityAudit,
): ProductResolverParityIssue {
  if (parity.primaryIssue !== "OK") return parity.primaryIssue;
  const informativePriority: ProductResolverParityIssue[] = [
    "FALTA_STATION",
    "FALLBACK_HEURISTICO",
    "SIN_OPERATION_STATION",
  ];
  for (const issue of informativePriority) {
    if (parity.issues.includes(issue)) return issue;
  }
  return "OK";
}

function recommendationTitleI18nKey(issue: ProductResolverParityIssue): string {
  switch (issue) {
    case "OK":
      return "productos.resolverParityRecommendOkTitle";
    case "DIVERGENCIA_BUCKET":
      return "productos.resolverParityRecommendBucketTitle";
    case "DIVERGENCIA_STATION":
      return "productos.resolverParityRecommendStationTitle";
    case "DIVERGENCIA_PREPARATION_AREA":
      return "productos.resolverParityRecommendPrepAreaTitle";
    case "FALTA_STATION":
      return "productos.resolverParityRecommendMissingStationTitle";
    case "FALLBACK_HEURISTICO":
      return "productos.resolverParityRecommendHeuristicTitle";
    case "SIN_OPERATION_STATION":
      return "productos.resolverParityRecommendNoOpStationTitle";
    default:
      return "productos.resolverParityRecommendOkTitle";
  }
}

function recommendationDescriptionI18nKey(issue: ProductResolverParityIssue): string {
  switch (issue) {
    case "OK":
      return "productos.resolverParityRecommendOkDescription";
    case "DIVERGENCIA_BUCKET":
      return "productos.resolverParityRecommendBucketDescription";
    case "DIVERGENCIA_STATION":
      return "productos.resolverParityRecommendStationDescription";
    case "DIVERGENCIA_PREPARATION_AREA":
      return "productos.resolverParityRecommendPrepAreaDescription";
    case "FALTA_STATION":
      return "productos.resolverParityRecommendMissingStationDescription";
    case "FALLBACK_HEURISTICO":
      return "productos.resolverParityRecommendHeuristicDescription";
    case "SIN_OPERATION_STATION":
      return "productos.resolverParityRecommendNoOpStationDescription";
    default:
      return "productos.resolverParityRecommendOkDescription";
  }
}

/** Acción recomendada para corrección manual (solo lectura, sin escribir Firestore). */
export function getProductResolverParityRecommendation(
  parity: ProductResolverParityAudit,
  t: TranslateFn,
): ProductResolverParityRecommendation {
  const issue = resolveRecommendationIssue(parity);
  return {
    title: t(recommendationTitleI18nKey(issue)),
    description: t(recommendationDescriptionI18nKey(issue)),
    severity: recommendationSeverityForIssue(issue),
  };
}

export function presentProductResolverParityRecommendation(
  parity: ProductResolverParityAudit,
  t: TranslateFn,
): string {
  const rec = getProductResolverParityRecommendation(parity, t);
  return `${rec.title} — ${rec.description}`;
}

/** Tooltip operativo para el usuario, sin exponer detalles internos del resolver. */
export function presentProductResolverParityAudit(
  parity: ProductResolverParityAudit,
  t: TranslateFn,
  baseTitle: string,
): string {
  const recommendation = getProductResolverParityRecommendation(parity, t);
  if (recommendation.severity === "ok") {
    return baseTitle;
  }
  return `${baseTitle} · ${t("productos.resolverParityRecommendLabel")}: ${recommendation.title} — ${recommendation.description}`;
}
