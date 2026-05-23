import {
  kdsSlaThresholds,
  type KdsStationKind,
} from "@/lib/kds/kds-sla";

export type KdsHeatMode = "normal" | "busy" | "rush";

export type KdsHeatSnapshot = {
  mode: KdsHeatMode;
  pendingCount: number;
  criticalCount: number;
  attentionCount: number;
  preparedCount: number;
  avgWaitMs: number | null;
  openBatchCount: number;
  saturationWarning: boolean;
  loadLabel: string;
};

export function computeKdsHeatSnapshot(params: {
  station: KdsStationKind;
  pendingCount: number;
  preparedCount: number;
  criticalCount: number;
  attentionCount: number;
  avgWaitMs: number | null;
  openBatchCount: number;
}): KdsHeatSnapshot {
  const { critical } = kdsSlaThresholds(params.station);
  const avgMin =
    params.avgWaitMs != null && Number.isFinite(params.avgWaitMs)
      ? params.avgWaitMs / 60000
      : 0;

  let mode: KdsHeatMode = "normal";
  if (
    params.pendingCount >= 24 ||
    params.criticalCount >= 5 ||
    avgMin >= critical
  ) {
    mode = "rush";
  } else if (
    params.pendingCount >= 12 ||
    params.criticalCount >= 2 ||
    params.attentionCount >= 6 ||
    avgMin >= critical * 0.65
  ) {
    mode = "busy";
  }

  const pendingTrend =
    params.pendingCount >= 18 && params.openBatchCount >= 4;
  const slaTrend = avgMin >= critical * 0.75 && params.pendingCount >= 8;
  const batchTrend = params.openBatchCount >= 6 && params.attentionCount >= 4;

  const saturationWarning = pendingTrend || slaTrend || batchTrend;

  const loadLabel =
    mode === "rush"
      ? "Rush"
      : mode === "busy"
        ? "Ocupado"
        : "Normal";

  return {
    mode,
    pendingCount: params.pendingCount,
    criticalCount: params.criticalCount,
    attentionCount: params.attentionCount,
    preparedCount: params.preparedCount,
    avgWaitMs: params.avgWaitMs,
    openBatchCount: params.openBatchCount,
    saturationWarning,
    loadLabel,
  };
}
