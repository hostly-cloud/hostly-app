"use client";

import type { KdsHeatSnapshot } from "@/lib/kds/kds-heat-state";

function formatMin(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return `${Math.floor(ms / 60000)} min`;
}

export function KdsHeatHeader({
  snapshot,
  stationLabel,
  saturationMessage,
}: {
  snapshot: KdsHeatSnapshot;
  stationLabel: string;
  saturationMessage?: string;
}) {
  return (
    <div className="hostly-kds-heat-header" role="status">
      <div className="hostly-kds-heat-header-row">
        <div className="hostly-kds-heat-title">{stationLabel}</div>
        <span className={`hostly-kds-heat-mode is-${snapshot.mode}`}>
          {snapshot.loadLabel}
        </span>
      </div>
      <div className="hostly-kds-heat-kpis">
        <Kpi label="Pend." value={snapshot.pendingCount} tone="info" />
        <Kpi label="Prep." value={snapshot.preparedCount} tone="warning" />
        <Kpi label="Crít." value={snapshot.criticalCount} tone="danger" />
        <Kpi label="SLA med." value={formatMin(snapshot.avgWaitMs)} tone="neutral" />
        <Kpi label="Batches" value={snapshot.openBatchCount} tone="neutral" />
      </div>
      {snapshot.saturationWarning && saturationMessage ? (
        <div className="hostly-kds-saturation-notice">{saturationMessage}</div>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "info" | "warning" | "danger" | "neutral";
}) {
  return (
    <div className={`hostly-kds-heat-kpi is-${tone}`}>
      <span className="hostly-kds-heat-kpi-label">{label}</span>
      <span className="hostly-kds-heat-kpi-value">{value}</span>
    </div>
  );
}
