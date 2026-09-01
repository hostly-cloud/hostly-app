"use client";

import { VentasContentBlock } from "@/components/analysis/VentasContentBlock";
import { VentasHeaderBlock } from "@/components/analysis/VentasHeaderBlock";
import {
  useVentasData,
  type VentasOrderInput,
} from "@/components/analysis/hooks/useVentasData";
import {
  useVentasSelectors,
  type VentasAnalyticsSnapshot,
} from "@/components/analysis/hooks/useVentasSelectors";
import { formatCurrency } from "@/components/analysis/utils";

export type VentasAnalyticsSectionProps = {
  placeholder?: string;
  orders?: VentasOrderInput[] | null;
  restaurantId?: string;
  dataState?: "loading" | "ready" | "error";
  errorMessage?: string;
};

export function VentasAnalyticsSection({
  placeholder,
  orders,
  restaurantId,
  dataState = "ready",
  errorMessage,
}: VentasAnalyticsSectionProps) {
  const { orders: ventasOrders } = useVentasData({
    orders,
    restaurantId,
  });

  const ventasAnalytics: VentasAnalyticsSnapshot = useVentasSelectors({
    orders: ventasOrders,
  });
  const { kpis, charts, table, insights, actionsData, zonaMasVentas, topZonasVentas } =
    ventasAnalytics;

  const handleCopyVentasSummary = async () => {
    const lines: string[] = [];

    lines.push("VENTAS");
    lines.push("");

    lines.push(`Ventas totales: ${formatCurrency(actionsData.kpis.totalVentas)}`);
    lines.push(`Cobros confirmados: ${actionsData.kpis.totalTickets}`);
    lines.push(`Cobro medio: ${formatCurrency(actionsData.kpis.ticketMedio)}`);

    if (actionsData.insights.summaryLines.length > 0) {
      lines.push("");
      lines.push("RESUMEN");
      actionsData.insights.summaryLines.forEach((line) => {
        lines.push(`- ${line}`);
      });
    }

    const text = lines.join("\n");

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  };

  const handleCopyVentasKpis = async () => {
    const lines = [
      "KPIS DE VENTAS",
      "",
      `Ventas totales: ${formatCurrency(actionsData.kpis.totalVentas)}`,
      `Cobros confirmados: ${actionsData.kpis.totalTickets}`,
      `Cobro medio: ${formatCurrency(actionsData.kpis.ticketMedio)}`,
    ];

    const text = lines.join("\n");

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  };

  const handleExportVentasJson = () => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      kpis: actionsData.kpis,
      charts: actionsData.charts,
      table: actionsData.table,
      insights: actionsData.insights,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ventas-analytics.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const hasOrders = ventasOrders.length > 0;
  const ordersCount = ventasOrders.length;

  if (!hasOrders) {
    return (
      <div className="hostly-analytics-panel">
        <VentasHeaderBlock title="Ventas" subtitle="Importes procedentes de cobros confirmados" />
        <VentasContentBlock
          dataState={dataState}
          errorMessage={errorMessage}
          hasOrders={hasOrders}
          placeholder={placeholder}
          kpis={kpis}
          charts={charts}
          table={table}
          insights={insights}
          ordersCount={ordersCount}
          actionsData={actionsData}
          zonaMasVentas={zonaMasVentas}
          topZonasVentas={topZonasVentas}
          onCopySummary={handleCopyVentasSummary}
          onCopyKpis={handleCopyVentasKpis}
          onExportJson={handleExportVentasJson}
        />
      </div>
    );
  }

  return (
    <div className="hostly-analytics-panel">
      <VentasHeaderBlock title="Ventas" subtitle="Importes procedentes de cobros confirmados" />
      <VentasContentBlock
        dataState={dataState}
        errorMessage={errorMessage}
        hasOrders={hasOrders}
        placeholder={placeholder}
        kpis={kpis}
        charts={charts}
        table={table}
        insights={insights}
        ordersCount={ordersCount}
        actionsData={actionsData}
        zonaMasVentas={zonaMasVentas}
        topZonasVentas={topZonasVentas}
        onCopySummary={handleCopyVentasSummary}
        onCopyKpis={handleCopyVentasKpis}
        onExportJson={handleExportVentasJson}
      />
    </div>
  );
}
