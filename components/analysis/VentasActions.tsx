import type { VentasSelectorsActionsData } from "@/components/analysis/hooks/useVentasSelectors";
import { HostlyButton } from "@/components/ui/hostly";

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
      <HostlyButton
        variant="tableAction"
        disabled={!onCopySummary}
        onClick={onCopySummary}
      >
        Copiar resumen
      </HostlyButton>
      <HostlyButton
        variant="tableAction"
        disabled={!onCopyKpis}
        onClick={onCopyKpis}
      >
        Copiar KPIs
      </HostlyButton>
      <HostlyButton
        variant="tableAction"
        disabled={!onExportJson}
        onClick={onExportJson}
      >
        Exportar JSON
      </HostlyButton>
    </div>
  );
}
