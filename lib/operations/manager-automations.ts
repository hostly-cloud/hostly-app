import type {
  OperationalAlertCenterAlert,
} from "@/lib/server/operations/operational-alert-center";

export type ManagerAutomationStage = "attention" | "critical" | "escalated";
export type ManagerAutomationPriority = "medium" | "high" | "urgent";
export type ManagerAutomationStatus = "active" | "acknowledged" | "resolved" | "auto_resolved";

export type ManagerAutomationPreparedAction = {
  kind: "navigate";
  href: string;
  label: string;
};

export type ManagerAutomationItem = {
  id: string;
  restaurantId: string;
  source: "operational_alert";
  sourceIncidentId: string;
  sourceAlertId: string;
  sourceOrderId: string;
  tableLabel: string;
  stationLabel: string;
  stage: ManagerAutomationStage;
  priority: ManagerAutomationPriority;
  status: ManagerAutomationStatus;
  title: string;
  detail: string;
  action: ManagerAutomationPreparedAction;
  firstPreparedAtMs: number;
  lastPreparedAtMs: number;
  updatedAtMs: number;
  acknowledgedAtMs: number | null;
  acknowledgedBy: string | null;
  resolvedAtMs: number | null;
};

export function resolveManagerAutomationStage(
  alert: Pick<OperationalAlertCenterAlert, "level" | "escalated">,
): ManagerAutomationStage {
  if (alert.escalated) return "escalated";
  return alert.level === "critical" ? "critical" : "attention";
}

export function managerAutomationStageRank(stage: ManagerAutomationStage): number {
  if (stage === "escalated") return 3;
  if (stage === "critical") return 2;
  return 1;
}

export function managerAutomationPriority(stage: ManagerAutomationStage): ManagerAutomationPriority {
  if (stage === "escalated") return "urgent";
  if (stage === "critical") return "high";
  return "medium";
}

export function buildManagerAutomationCopy(
  alert: Pick<
    OperationalAlertCenterAlert,
    "kind" | "tableLabel" | "stationLabel" | "stationHref" | "elapsedMinutes" | "delayedLineCount" | "level" | "escalated"
  >,
): {
  title: string;
  detail: string;
  action: ManagerAutomationPreparedAction;
} {
  const stage = resolveManagerAutomationStage(alert);
  const stageLabel = stage === "escalated" ? "Escalada" : stage === "critical" ? "Crítica" : "Atención";
  if (alert.kind === "table_service_duration") {
    return {
      title: `${alert.tableLabel}: servicio prolongado`,
      detail: `${stageLabel}: la mesa lleva ${alert.elapsedMinutes} min de servicio. Hostly ha preparado el acceso directo al TPV para revisarla.`,
      action: { kind: "navigate", href: alert.stationHref, label: "Abrir TPV" },
    };
  }
  return {
    title: `${alert.tableLabel}: retraso en ${alert.stationLabel}`,
    detail: `${stageLabel}: ${alert.delayedLineCount} ${alert.delayedLineCount === 1 ? "línea lleva" : "líneas llevan"} hasta ${alert.elapsedMinutes} min en producción. Hostly ha preparado el acceso a ${alert.stationLabel.toLowerCase()}.`,
    action: { kind: "navigate", href: alert.stationHref, label: `Abrir ${alert.stationLabel}` },
  };
}

export function shouldReopenManagerAutomation(input: {
  previousStatus: ManagerAutomationStatus;
  previousStage: ManagerAutomationStage;
  nextStage: ManagerAutomationStage;
}): boolean {
  if (input.previousStatus !== "acknowledged" && input.previousStatus !== "resolved") return false;
  return managerAutomationStageRank(input.nextStage) > managerAutomationStageRank(input.previousStage);
}
