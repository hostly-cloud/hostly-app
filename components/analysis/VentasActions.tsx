import type { CSSProperties } from "react";
import type {
  VentasSelectorsCharts,
  VentasSelectorsActionsData,
  VentasSelectorsInsights,
  VentasSelectorsKpis,
  VentasSelectorsTable,
} from "@/components/analysis/hooks/useVentasSelectors";

export type VentasActionsData = VentasSelectorsActionsData;

export type VentasActionsProps = {
  data: VentasActionsData;
  onCopySummary?: () => void;
  onCopyKpis?: () => void;
  onExportJson?: () => void;
};

const btnBase: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 700,
  border: "1px solid var(--hostly-line)",
  background: "var(--hostly-surface-card-solid)",
  color: "var(--hostly-ink-strong)",
  cursor: "pointer",
};

export function VentasActions({ data, onCopySummary, onCopyKpis, onExportJson }: VentasActionsProps) {
  void data;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <button
        type="button"
        disabled={!onCopySummary}
        onClick={onCopySummary}
        style={{
          ...btnBase,
          opacity: onCopySummary ? 1 : 0.45,
          cursor: onCopySummary ? "pointer" : "not-allowed",
        }}
      >
        Copiar resumen
      </button>
      <button
        type="button"
        disabled={!onCopyKpis}
        onClick={onCopyKpis}
        style={{
          ...btnBase,
          opacity: onCopyKpis ? 1 : 0.45,
          cursor: onCopyKpis ? "pointer" : "not-allowed",
        }}
      >
        Copiar KPIs
      </button>
      <button
        type="button"
        disabled={!onExportJson}
        onClick={onExportJson}
        style={{
          ...btnBase,
          opacity: onExportJson ? 1 : 0.45,
          cursor: onExportJson ? "pointer" : "not-allowed",
        }}
      >
        Exportar JSON
      </button>
    </div>
  );
}
