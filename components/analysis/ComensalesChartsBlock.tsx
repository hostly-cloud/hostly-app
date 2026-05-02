"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type {
  ComensalesDailyAttendanceRow,
  ComensalesDailyReservationsRow,
  ComensalesSelectorsCharts,
} from "@/components/analysis/hooks/useComensalesSelectors";

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
      <div
        className="hostly-card"
        style={{
          borderRadius: "var(--hostly-radius-md)",
          border: "1px solid rgba(148, 163, 184, 0.18)",
          background: "rgba(15, 23, 42, 0.55)",
          padding: 14,
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
          Reservas por día
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailyReservations}>
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip
              labelFormatter={(label, payload) => {
                const row = payload?.[0] as { payload?: { date?: string } } | undefined;
                const d = row?.payload?.date;
                return d ? formatDateEs(String(d)) : String(label);
              }}
              formatter={(value) => [value, "Reservas"]}
            />
            <Bar dataKey="total" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div
        className="hostly-card"
        style={{
          borderRadius: "var(--hostly-radius-md)",
          border: "1px solid rgba(148, 163, 184, 0.18)",
          background: "rgba(15, 23, 42, 0.55)",
          padding: 14,
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
          Llegadas vs No-show
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailyAttendance}>
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip
              labelFormatter={(label, payload) => {
                const row = payload?.[0] as { payload?: { date?: string } } | undefined;
                const d = row?.payload?.date;
                return d ? formatDateEs(String(d)) : String(label);
              }}
            />
            <Bar dataKey="llegadas" />
            <Bar dataKey="noShow" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
