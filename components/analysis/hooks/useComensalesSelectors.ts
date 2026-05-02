"use client";

import { useMemo } from "react";
import type { ReservationDayMetrics } from "@/lib/reservas/reservation-metrics";
import type {
  ComensalesDailyAttendancePoint,
  ComensalesDailyReservationsPoint,
  ComensalesKpis as DomainComensalesKpis,
  ComensalesViewState as DomainComensalesViewState,
} from "@/components/analysis/types/comensales";
import type { ComensalesAnalyticsSnapshotModel } from "@/components/analysis/types/snapshots";

export type ComensalesDailyReservationsRow = ComensalesDailyReservationsPoint;
export type ComensalesDailyAttendanceRow = ComensalesDailyAttendancePoint;

export type ComensalesSelectorsKpis = DomainComensalesKpis;

export type ComensalesKpisSnapshot = ComensalesSelectorsKpis;

export type ComensalesSelectorsCharts = {
  dailyReservations: ComensalesDailyReservationsRow[];
  dailyAttendance: ComensalesDailyAttendanceRow[];
};

export type ComensalesSelectorsViewState = DomainComensalesViewState;

export type UseComensalesSelectorsInput = {
  metrics: ReservationDayMetrics;
  dailyReservations: ComensalesDailyReservationsRow[];
  dailyAttendance: ComensalesDailyAttendanceRow[];
  dateFrom: string;
  dateTo: string;
  compactViewZonas: boolean;
};

export type UseComensalesSelectorsResult = ComensalesAnalyticsSnapshotModel;

export function useComensalesSelectors(input: UseComensalesSelectorsInput): UseComensalesSelectorsResult {
  const { metrics, dailyReservations, dailyAttendance, dateFrom, dateTo, compactViewZonas } = input;

  const kpis = useMemo<ComensalesSelectorsKpis>(
    () => ({
      booked: metrics.booked,
      seated: metrics.seated,
      completed: metrics.completed,
      noShow: metrics.noShow,
      cancelled: metrics.cancelled,
      paxPlanned: metrics.paxPlanned,
      paxSeated: metrics.paxSeated,
      paxCompleted: metrics.paxCompleted,
    }),
    [metrics],
  );

  const charts = useMemo<ComensalesSelectorsCharts>(
    () => ({
      dailyReservations,
      dailyAttendance,
    }),
    [dailyReservations, dailyAttendance],
  );

  const viewState = useMemo<ComensalesSelectorsViewState>(
    () => ({
      dateFrom,
      dateTo,
      compactViewZonas,
    }),
    [dateFrom, dateTo, compactViewZonas],
  );

  return {
    kpis,
    charts,
    viewState,
  };
}
