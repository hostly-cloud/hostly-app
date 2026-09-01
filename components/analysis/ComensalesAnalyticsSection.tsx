"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ReservationDayMetrics } from "@/lib/reservas/reservation-metrics";
import { ComensalesContentBlock } from "@/components/analysis/ComensalesContentBlock";
import { ComensalesHeaderBlock } from "@/components/analysis/ComensalesHeaderBlock";
import { AnalyticsEmptyState } from "@/components/analysis/AnalyticsEmptyState";
import {
  useComensalesSelectors,
  type ComensalesDailyAttendanceRow,
  type ComensalesDailyReservationsRow,
  type UseComensalesSelectorsResult,
} from "@/components/analysis/hooks/useComensalesSelectors";
import type { ZonasAnalyticsSectionProps } from "@/components/analysis/ZonasAnalyticsSection";
import { Clock3, TriangleAlert } from "lucide-react";

export type { ComensalesDailyAttendanceRow, ComensalesDailyReservationsRow } from "@/components/analysis/hooks/useComensalesSelectors";

export type ComensalesAnalyticsSectionProps = ZonasAnalyticsSectionProps & {
  dataState?: "loading" | "ready" | "error";
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
  dataState = "ready",
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
    <div className="hostly-analytics-panel">
      <ComensalesHeaderBlock
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        formatDateEs={formatDateEs}
      />

      {dataState === "loading" ? (
        <AnalyticsEmptyState
          compact
          role="status"
          icon={<Clock3 size={22} strokeWidth={2.1} />}
          title="Cargando reservas y comensales"
          description="Estamos cargando las reservas y la asistencia del periodo."
        />
      ) : dataState === "error" ? (
        <AnalyticsEmptyState
          compact
          role="alert"
          icon={<TriangleAlert size={22} strokeWidth={2.1} />}
          title="No se pudieron cargar las reservas"
          description="Revisa tu conexión o tus permisos e inténtalo de nuevo."
        />
      ) : (
        <ComensalesContentBlock
          compactViewZonas={comensalesViewState.compactViewZonas}
          comensalesKpis={comensalesKpis}
          comensalesCharts={comensalesCharts}
          zonasSectionProps={{
            compactViewZonas,
            ...zonasSectionProps,
          }}
        />
      )}
    </div>
  );
}
