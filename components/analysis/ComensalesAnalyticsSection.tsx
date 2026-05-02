"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ReservationDayMetrics } from "@/lib/reservas/reservation-metrics";
import { ComensalesContentBlock } from "@/components/analysis/ComensalesContentBlock";
import { ComensalesHeaderBlock } from "@/components/analysis/ComensalesHeaderBlock";
import {
  useComensalesSelectors,
  type ComensalesDailyAttendanceRow,
  type ComensalesDailyReservationsRow,
  type UseComensalesSelectorsResult,
} from "@/components/analysis/hooks/useComensalesSelectors";
import type { ZonasAnalyticsSectionProps } from "@/components/analysis/ZonasAnalyticsSection";

export type { ComensalesDailyAttendanceRow, ComensalesDailyReservationsRow } from "@/components/analysis/hooks/useComensalesSelectors";

export type ComensalesAnalyticsSectionProps = ZonasAnalyticsSectionProps & {
  dateFrom: string;
  dateTo: string;
  setDateFrom: Dispatch<SetStateAction<string>>;
  setDateTo: Dispatch<SetStateAction<string>>;
  metrics: ReservationDayMetrics;
  dailyReservations: ComensalesDailyReservationsRow[];
  dailyAttendance: ComensalesDailyAttendanceRow[];
  formatDateEs: (ymd: string) => string;
};

export function ComensalesAnalyticsSection({
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  metrics,
  dailyReservations,
  dailyAttendance,
  formatDateEs,
  compactViewZonas,
  ...zonasSectionProps
}: ComensalesAnalyticsSectionProps) {
  const comensalesSelectors: UseComensalesSelectorsResult = useComensalesSelectors({
    metrics,
    dailyReservations,
    dailyAttendance,
    dateFrom,
    dateTo,
    compactViewZonas,
  });
  const {
    kpis: comensalesKpis,
    charts: comensalesCharts,
    viewState: comensalesViewState,
  } = comensalesSelectors;

  return (
    <div
      className="hostly-card"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 20,
        borderRadius: "var(--hostly-radius-md)",
        overflow: "auto",
      }}
    >
      <ComensalesHeaderBlock
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        formatDateEs={formatDateEs}
      />

      <ComensalesContentBlock
        compactViewZonas={comensalesViewState.compactViewZonas}
        comensalesKpis={comensalesKpis}
        comensalesCharts={comensalesCharts}
        zonasSectionProps={{
          compactViewZonas,
          ...zonasSectionProps,
        }}
      />
    </div>
  );
}
