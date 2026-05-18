import type { CSSProperties } from "react";
import type { ComensalesSelectorsKpis } from "@/components/analysis/hooks/useComensalesSelectors";

export type ComensalesKpiBlockData = ComensalesSelectorsKpis;

type ComensalesKpiBlockProps = {
  data: ComensalesSelectorsKpis;
};

const metricsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const metricCardBase: CSSProperties = {
  borderRadius: 14,
  border: "1px solid var(--hostly-line)",
  background: "var(--hostly-surface-card-solid)",
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minHeight: 72,
};

function metricTone(tone: "amber" | "blue" | "green" | "red" | "gray" | "neutral"): CSSProperties {
  if (tone === "amber") return { border: "1px solid rgba(251, 191, 36, 0.28)", background: "rgba(251, 191, 36, 0.08)" };
  if (tone === "blue") return { border: "1px solid rgba(59, 130, 246, 0.32)", background: "rgba(59, 130, 246, 0.08)" };
  if (tone === "green") return { border: "1px solid rgba(34, 197, 94, 0.32)", background: "rgba(34, 197, 94, 0.08)" };
  if (tone === "red") return { border: "1px solid rgba(248, 113, 113, 0.32)", background: "rgba(248, 113, 113, 0.08)" };
  if (tone === "gray") return { border: "1px solid rgba(148, 163, 184, 0.22)", background: "rgba(148, 163, 184, 0.06)" };
  return {};
}

function MetricCard({ label, value, tone }: { label: string; value: string | number; tone: "amber" | "blue" | "green" | "red" | "gray" | "neutral" }) {
  return (
    <div style={{ ...metricCardBase, ...metricTone(tone) }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--hostly-ink-muted)" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", color: "var(--hostly-ink-strong)" }}>
        {value}
      </div>
    </div>
  );
}

export function ComensalesKpiBlock({ data }: ComensalesKpiBlockProps) {
  const { booked, seated, completed, noShow, cancelled, paxPlanned, paxSeated, paxCompleted } = data;

  return (
    <div style={metricsGridStyle}>
      <MetricCard label="Previstas" value={booked} tone="amber" />
      <MetricCard label="Llegadas" value={seated} tone="blue" />
      <MetricCard label="Completadas" value={completed} tone="green" />
      <MetricCard label="No show" value={noShow} tone="red" />
      <MetricCard label="Canceladas" value={cancelled} tone="gray" />
      <MetricCard label="Pax previstas" value={paxPlanned} tone="neutral" />
      <MetricCard label="Pax llegadas" value={paxSeated} tone="neutral" />
      <MetricCard label="Pax completadas" value={paxCompleted} tone="neutral" />
    </div>
  );
}
