/**
 * Tokens Recharts — análisis Hostly (superficie clara). Solo presentación.
 */

export const analysisRechartsPalette = {
  barPrimary: "var(--hostly-ice-400)",
  barSecondary: "var(--hostly-accent)",
  barAccent: "rgba(251, 191, 36, 0.88)",
} as const;

/** @deprecated alias histórico; usar analysisRechartsPalette */
export const analysisRechartsOnDark = analysisRechartsPalette;

export const analysisRechartsAxisProps = {
  stroke: "rgba(100, 125, 155, 0.32)",
  tick: { fill: "var(--hostly-ink-muted)", fontSize: 11 },
  tickLine: { stroke: "rgba(100, 125, 155, 0.25)" },
} as const;

export const analysisRechartsTooltipProps = {
  cursor: { fill: "rgba(180, 200, 230, 0.12)" },
  contentStyle: {
    background: "var(--hostly-surface-card-solid)",
    border: "1px solid rgba(180, 200, 230, 0.22)",
    borderRadius: 10,
    boxShadow: "var(--hostly-shadow-hairline)",
    color: "var(--hostly-ink-strong)",
  } as const,
  labelStyle: { color: "var(--hostly-ink-muted)", fontWeight: 600 } as const,
  itemStyle: { color: "var(--hostly-ink-strong)" } as const,
} as const;

export const analysisRechartsGridProps = {
  stroke: "rgba(160, 180, 210, 0.12)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

export const ANALYSIS_CHART_HEIGHT = 200;
