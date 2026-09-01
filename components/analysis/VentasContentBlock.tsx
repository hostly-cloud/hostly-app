import type { VentasActionsData } from "@/components/analysis/VentasActions";
import { VentasActions } from "@/components/analysis/VentasActions";
import { VentasChartsBlock } from "@/components/analysis/VentasChartsBlock";
import { VentasEmptyState } from "@/components/analysis/VentasEmptyState";
import {
  VentasInsightsBlock,
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
  dataState?: "loading" | "ready" | "error";
  errorMessage?: string;
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
  onCopySummary?: () => void;
  onCopyKpis?: () => void;
  onExportJson?: () => void;
};

export function VentasContentBlock({
  dataState = "ready",
  errorMessage,
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
  onCopySummary,
  onCopyKpis,
  onExportJson,
}: VentasContentBlockProps) {
  if (dataState === "loading") {
    return <VentasEmptyState placeholder="Cargando cobros confirmados…" role="status" />;
  }

  if (dataState === "error") {
    return (
      <VentasEmptyState
        placeholder={errorMessage ?? "No se pudieron cargar los cobros. Inténtalo de nuevo."}
        role="alert"
      />
    );
  }

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
      />
    </div>
  );
}
