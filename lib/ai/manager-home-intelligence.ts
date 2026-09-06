import type {
  ManagerAnalyticsContext,
  ManagerAnalyticsResult,
} from "@/lib/ai/manager-analytics-types";
import { buildHeuristicManagerAnalyticsReport } from "@/lib/ai/tools/generate-manager-analytics-report";

const MANAGER_HOME_TIME_ZONE = "Europe/Madrid";

export function getMadridIsoDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANAGER_HOME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("MANAGER_HOME_DATE_FAILED");
  return `${year}-${month}-${day}`;
}

export function buildManagerHomeSnapshotResult(
  context: ManagerAnalyticsContext,
  generatedAtMs = Date.now(),
): ManagerAnalyticsResult {
  return {
    generatedAtMs,
    source: "heuristic",
    model: null,
    context,
    report: buildHeuristicManagerAnalyticsReport(context),
  };
}
