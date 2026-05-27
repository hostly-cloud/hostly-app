import type { VentasSelectorsActionsData } from "@/components/analysis/hooks/useVentasSelectors";

export type VentasActionsData = VentasSelectorsActionsData;

export type VentasActionsProps = {
  data: VentasActionsData;
  onCopySummary?: () => void;
  onCopyKpis?: () => void;
  onExportJson?: () => void;
};

export function VentasActions({ data, onCopySummary, onCopyKpis, onExportJson }: VentasActionsProps) {
  void data;

  return (
    <div className="hostly-analytics-toolbar__actions w-full justify-start sm:w-auto sm:justify-end">
      <button
        type="button"
        disabled={!onCopySummary}
        onClick={onCopySummary}
        className="hostly-button-secondary hostly-button-compact"
      >
        Copiar resumen
      </button>
      <button
        type="button"
        disabled={!onCopyKpis}
        onClick={onCopyKpis}
        className="hostly-button-secondary hostly-button-compact"
      >
        Copiar KPIs
      </button>
      <button
        type="button"
        disabled={!onExportJson}
        onClick={onExportJson}
        className="hostly-button-secondary hostly-button-compact"
      >
        Exportar JSON
      </button>
    </div>
  );
}
