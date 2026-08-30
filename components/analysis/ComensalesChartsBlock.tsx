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

  return (
    <>
      <div className="hostly-panel p-4">
        <div className="mb-2.5 text-[13px] font-extrabold tracking-tight text-[var(--hostly-ink-strong)]">
          Reservas por día
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

      <div className="hostly-panel p-4">
        <div className="mb-2.5 text-[13px] font-extrabold tracking-tight text-[var(--hostly-ink-strong)]">
          Llegadas y ausencias
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
    </>
  );
}
