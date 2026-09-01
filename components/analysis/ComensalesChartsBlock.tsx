"use client";

import {
  ANALYSIS_CHART_HEIGHT,
  analysisRechartsAxisProps,
  analysisRechartsGridProps,
  analysisRechartsOnDark,
  analysisRechartsTooltipProps,
} from "@/components/analysis/analysis-recharts-surface";
import type {
  ComensalesSelectorsCharts,
} from "@/components/analysis/hooks/useComensalesSelectors";
import { AnalyticsEmptyState } from "@/components/analysis/AnalyticsEmptyState";
import { CalendarDays, ChartColumnIncreasing, UsersRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type { ComensalesDailyAttendanceRow, ComensalesDailyReservationsRow } from "@/components/analysis/hooks/useComensalesSelectors";

export type ComensalesChartsBlockData = ComensalesSelectorsCharts;

type ComensalesChartsBlockProps = {
  data: ComensalesSelectorsCharts;
};

function formatDateEs(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function ComensalesChartsBlock({ data }: ComensalesChartsBlockProps) {
  const { dailyReservations, dailyAttendance } = data;
  const hasActivity =
    dailyReservations.some((row) => row.total > 0) ||
    dailyAttendance.some((row) => row.llegadas > 0 || row.noShow > 0);

  if (!hasActivity) {
    return (
      <AnalyticsEmptyState
        compact
        icon={<ChartColumnIncreasing size={22} strokeWidth={2.1} />}
        title="Las tendencias aparecerán con las primeras reservas"
        description="Este periodo todavía no tiene actividad de reservas, llegadas ni ausencias."
        hint="Prueba otro intervalo de fechas o vuelve cuando haya servicio registrado."
      />
    );
  }

  return (
    <div className="hostly-analysis-chart-grid">
      <div className="hostly-panel hostly-analysis-chart-card p-4">
        <div className="hostly-analysis-card-title">
          <CalendarDays size={17} aria-hidden="true" />
          <span>Reservas por día</span>
        </div>
        <ResponsiveContainer width="100%" height={ANALYSIS_CHART_HEIGHT} className="min-w-0 [&_.recharts-surface]:outline-none">
          <BarChart
            data={dailyReservations}
            margin={{ top: 6, right: 6, left: 4, bottom: 2 }}
            style={{ background: "transparent" }}
          >
            <CartesianGrid {...analysisRechartsGridProps} />
            <XAxis dataKey="label" {...analysisRechartsAxisProps} />
            <YAxis allowDecimals={false} {...analysisRechartsAxisProps} />
            <Tooltip
              {...analysisRechartsTooltipProps}
              labelFormatter={(label, payload) => {
                const row = payload?.[0] as { payload?: { date?: string } } | undefined;
                const d = row?.payload?.date;
                return d ? formatDateEs(String(d)) : String(label);
              }}
              formatter={(value) => [value, "Reservas"]}
            />
            <Bar dataKey="total" fill={analysisRechartsOnDark.barPrimary} radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="hostly-panel hostly-analysis-chart-card p-4">
        <div className="hostly-analysis-card-title">
          <UsersRound size={17} aria-hidden="true" />
          <span>Llegadas y ausencias</span>
        </div>
        <ResponsiveContainer width="100%" height={ANALYSIS_CHART_HEIGHT} className="min-w-0 [&_.recharts-surface]:outline-none">
          <BarChart
            data={dailyAttendance}
            margin={{ top: 6, right: 6, left: 4, bottom: 2 }}
            style={{ background: "transparent" }}
          >
            <CartesianGrid {...analysisRechartsGridProps} />
            <XAxis dataKey="label" {...analysisRechartsAxisProps} />
            <YAxis allowDecimals={false} {...analysisRechartsAxisProps} />
            <Tooltip
              {...analysisRechartsTooltipProps}
              labelFormatter={(label, payload) => {
                const row = payload?.[0] as { payload?: { date?: string } } | undefined;
                const d = row?.payload?.date;
                return d ? formatDateEs(String(d)) : String(label);
              }}
            />
            <Bar dataKey="llegadas" fill={analysisRechartsOnDark.barPrimary} radius={[5, 5, 0, 0]} />
            <Bar dataKey="noShow" fill={analysisRechartsOnDark.barAccent} radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
