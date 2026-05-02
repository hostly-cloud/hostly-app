"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VentasSelectorsCharts } from "@/components/analysis/hooks/useVentasSelectors";

const formatEuroValue = (value: number): string => {
  return `${value.toFixed(2)} €`;
};

const formatEuroAxisValue = (value: number): string => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const absValue = Math.abs(safeValue);

  if (absValue >= 1000) {
    return `${(safeValue / 1000).toFixed(1)}k€`;
  }

  return `${safeValue.toFixed(0)}€`;
};

export type VentasChartsBlockProps = {
  data: VentasSelectorsCharts;
};

export function VentasChartsBlock({ data }: VentasChartsBlockProps) {
  if (data.dailySales.length === 0) {
    return null;
  }

  return (
    <div
      className="hostly-card"
      style={{
        padding: 14,
        borderRadius: "var(--hostly-radius-md)",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        background: "rgba(15, 23, 42, 0.55)",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: "#e2e8f0",
          letterSpacing: "-0.01em",
          marginBottom: 10,
        }}
      >
        Ventas por día
      </div>
      <div style={{ height: 260, width: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.dailySales}>
            <XAxis dataKey="label" />
            <YAxis tickFormatter={(value) => formatEuroAxisValue(Number(value))} />
            <Tooltip formatter={(value) => [formatEuroValue(Number(value)), "Ventas"]} />
            <Bar dataKey="value" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
