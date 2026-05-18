"use client";

import {
  analysisRechartsAxisProps,
  analysisRechartsGridProps,
  analysisRechartsOnDark,
  analysisRechartsTooltipProps,
} from "@/components/analysis/analysis-recharts-surface";
import type { VentasSelectorsCharts } from "@/components/analysis/hooks/useVentasSelectors";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
    <div className="hostly-panel p-4">
      <div
        className="mb-2.5 text-[13px] font-extrabold tracking-tight text-[var(--hostly-ink-strong)]"
      >
        Ventas por día
      </div>
      <div className="h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" className="min-w-0 [&_.recharts-surface]:outline-none">
          <BarChart
            data={data.dailySales}
            margin={{ top: 6, right: 6, left: 4, bottom: 2 }}
            style={{ background: "transparent" }}
          >
            <CartesianGrid {...analysisRechartsGridProps} />
            <XAxis dataKey="label" {...analysisRechartsAxisProps} />
            <YAxis
              tickFormatter={(value) => formatEuroAxisValue(Number(value))}
              {...analysisRechartsAxisProps}
            />
            <Tooltip
              {...analysisRechartsTooltipProps}
              formatter={(value) => [formatEuroValue(Number(value)), "Ventas"]}
            />
            <Bar dataKey="value" fill={analysisRechartsOnDark.barPrimary} radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
