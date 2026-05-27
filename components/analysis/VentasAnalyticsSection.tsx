"use client";

import { useMemo } from "react";
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

/** Slice mínimo de analítica de zonas para el cruce ventas vs ocupación (sin acoplar al hook completo). */
export type VentasZonasAnalyticsBridge = {
  zoneMetrics?: ReadonlyArray<{
    zoneName?: string | null;
    ocupacion?: number | null;
  }> | null;
};

export type VentasZonaVentasVsOcupacionRow = {
  zoneName: string;
  ocupacion: number;
  ventas: number;
};

export type VentasAnalyticsSectionProps = {
  placeholder?: string;
  orders?: VentasOrderInput[] | null;
  restaurantId?: string;
  zonasAnalytics?: VentasZonasAnalyticsBridge | null;
};

export function VentasAnalyticsSection({
  placeholder,
  orders,
  restaurantId,
  zonasAnalytics,
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

  const zonasVentasVsOcupacion = useMemo(() => {
    const zoneMetrics = zonasAnalytics?.zoneMetrics ?? [];
    const ventasMap = ventasAnalytics?.ventasPorZona ?? new Map();

    return zoneMetrics.map((z) => {
      const zoneName =
        typeof z?.zoneName === "string" && z.zoneName.trim().length > 0
          ? z.zoneName.trim()
          : "Sin zona";

      const ocupacion =
        typeof z?.ocupacion === "number" && !Number.isNaN(z.ocupacion)
          ? z.ocupacion
          : 0;

      const ventas = ventasMap.get(zoneName) ?? 0;

      return {
        zoneName,
        ocupacion,
        ventas,
      };
    });
  }, [zonasAnalytics, ventasAnalytics]);

  const zonasVentasInsights = useMemo(() => {
    if (!Array.isArray(zonasVentasVsOcupacion) || zonasVentasVsOcupacion.length === 0) {
      return {
        mejorRendimiento: null,
        peorRendimiento: null,
      };
    }

    const withRatio = zonasVentasVsOcupacion
      .map((z) => {
        const ratio = z.ocupacion > 0 ? z.ventas / z.ocupacion : 0;

        return {
          ...z,
          ratio,
        };
      })
      .filter((z) => z.ocupacion > 0);

    if (withRatio.length === 0) {
      return {
        mejorRendimiento: null,
        peorRendimiento: null,
      };
    }

    let max = withRatio[0];
    let min = withRatio[0];

    withRatio.forEach((z) => {
      if (z.ratio > max.ratio) max = z;
      if (z.ratio < min.ratio) min = z;
    });

    return {
      mejorRendimiento: max,
      peorRendimiento: min,
    };
  }, [zonasVentasVsOcupacion]);

  const zonasVentasAlertas = useMemo(() => {
    if (!Array.isArray(zonasVentasVsOcupacion)) return [];

    return zonasVentasVsOcupacion
      .filter((z) => z.ocupacion > 0)
      .map((z) => {
        const ratio = z.ventas / z.ocupacion;
        return { ...z, ratio };
      })
      .filter((z) => z.ocupacion >= 0.6 && z.ratio < 1);
  }, [zonasVentasVsOcupacion]);

  const zonasVentasRecomendaciones = useMemo(() => {
    if (!Array.isArray(zonasVentasAlertas) || zonasVentasAlertas.length === 0) {
      return [];
    }

    return zonasVentasAlertas
      .map((z) => {
        const impacto = z.ocupacion > 0 ? z.ocupacion - z.ratio : 0;

        let texto = "";

        if (z.ratio < 0.5) {
          texto = `Revisar precios o carta en ${z.zoneName}`;
        } else if (z.ratio < 0.8) {
          texto = `Optimizar rotación en ${z.zoneName}`;
        } else {
          texto = `Mejorar conversión en ${z.zoneName}`;
        }

        return {
          texto,
          impacto,
        };
      })
      .sort((a, b) => b.impacto - a.impacto)
      .map((r) => r.texto);
  }, [zonasVentasAlertas]);

  const handleCopyVentasSummary = async () => {
    const lines: string[] = [];

    lines.push("VENTAS");
    lines.push("");

    lines.push(`Ventas totales: ${actionsData.kpis.totalVentas.toFixed(2)} €`);
    lines.push(`Total tickets: ${actionsData.kpis.totalTickets}`);
    lines.push(`Ticket medio: ${actionsData.kpis.ticketMedio.toFixed(2)} €`);

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
      `Ventas totales: ${actionsData.kpis.totalVentas.toFixed(2)} €`,
      `Total tickets: ${actionsData.kpis.totalTickets}`,
      `Ticket medio: ${actionsData.kpis.ticketMedio.toFixed(2)} €`,
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
        <VentasHeaderBlock title="Ventas" />
        <VentasContentBlock
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
          zonasVentasInsights={zonasVentasInsights}
          zonasVentasAlertas={zonasVentasAlertas}
          zonasVentasRecomendaciones={zonasVentasRecomendaciones}
          onCopySummary={handleCopyVentasSummary}
          onCopyKpis={handleCopyVentasKpis}
          onExportJson={handleExportVentasJson}
        />
      </div>
    );
  }

  return (
    <div className="hostly-analytics-panel">
      <VentasHeaderBlock title="Ventas" />
      <VentasContentBlock
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
        zonasVentasInsights={zonasVentasInsights}
        zonasVentasAlertas={zonasVentasAlertas}
        zonasVentasRecomendaciones={zonasVentasRecomendaciones}
        onCopySummary={handleCopyVentasSummary}
        onCopyKpis={handleCopyVentasKpis}
        onExportJson={handleExportVentasJson}
      />
    </div>
  );
}
