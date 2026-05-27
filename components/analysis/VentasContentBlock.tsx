import type { VentasActionsData } from "@/components/analysis/VentasActions";
import { VentasActions } from "@/components/analysis/VentasActions";
import { VentasChartsBlock } from "@/components/analysis/VentasChartsBlock";
import { VentasEmptyState } from "@/components/analysis/VentasEmptyState";
import {
  VentasInsightsBlock,
  type VentasZonaVentasAlerta,
  type VentasZonasVentasInsights,
} from "@/components/analysis/VentasInsightsBlock";
import { VentasKpiBlock } from "@/components/analysis/VentasKpiBlock";
import { VentasTableBlock } from "@/components/analysis/VentasTableBlock";
import { VentasViewState } from "@/components/analysis/VentasViewState";
import type {
  VentasSelectorsCharts,
  VentasSelectorsInsights,
  VentasSelectorsKpis,
  VentasSelectorsTable,
  VentasTopZona,
  VentasZonaMasVentas,
} from "@/components/analysis/hooks/useVentasSelectors";

export type VentasContentBlockProps = {
  hasOrders: boolean;
  placeholder?: string;
  kpis: VentasSelectorsKpis;
  charts: VentasSelectorsCharts;
  table: VentasSelectorsTable;
  insights: VentasSelectorsInsights;
  ordersCount: number;
  actionsData: VentasActionsData;
  zonaMasVentas?: VentasZonaMasVentas;
  topZonasVentas?: VentasTopZona[];
  zonasVentasInsights?: VentasZonasVentasInsights;
  zonasVentasAlertas?: VentasZonaVentasAlerta[];
  zonasVentasRecomendaciones?: string[];
  onCopySummary?: () => void;
  onCopyKpis?: () => void;
  onExportJson?: () => void;
};

export function VentasContentBlock({
  hasOrders,
  placeholder,
  kpis,
  charts,
  table,
  insights,
  ordersCount,
  actionsData,
  zonaMasVentas,
  topZonasVentas,
  zonasVentasInsights,
  zonasVentasAlertas,
  zonasVentasRecomendaciones,
  onCopySummary,
  onCopyKpis,
  onExportJson,
}: VentasContentBlockProps) {
  if (!hasOrders) {
    return (
      <div className="hostly-analytics-stack">
        <VentasViewState hasOrders={false} ordersCount={ordersCount} />
        <VentasEmptyState placeholder={placeholder} />
      </div>
    );
  }

  return (
    <div className="hostly-analytics-stack">
      <div className="hostly-analytics-toolbar">
        <VentasViewState hasOrders={true} ordersCount={ordersCount} />
        <VentasActions
          data={actionsData}
          onCopySummary={onCopySummary}
          onCopyKpis={onCopyKpis}
          onExportJson={onExportJson}
        />
      </div>
      <VentasKpiBlock data={{ ...kpis, zonaMasVentas }} />
      <VentasChartsBlock data={charts} />
      <VentasTableBlock data={table} />
      <VentasInsightsBlock
        data={insights}
        topZonasVentas={topZonasVentas}
        zonasVentasInsights={zonasVentasInsights}
        zonasVentasAlertas={zonasVentasAlertas}
        zonasVentasRecomendaciones={zonasVentasRecomendaciones}
      />
    </div>
  );
}
