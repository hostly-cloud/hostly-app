import type {
  ComensalesDailyAttendancePoint,
  ComensalesDailyReservationsPoint,
  ComensalesKpis,
  ComensalesViewState,
  VentasChartPoint,
  VentasKpis,
  VentasTableRow,
  ZonasKpis,
} from "./index";

export type VentasAnalyticsSnapshotModel = {
  kpis: VentasKpis;
  charts: {
    dailySales: VentasChartPoint[];
  };
  table: {
    rows: VentasTableRow[];
  };
  insights: {
    summaryLines: string[];
  };
};

export type ComensalesAnalyticsSnapshotModel = {
  kpis: ComensalesKpis;
  charts: {
    dailyReservations: ComensalesDailyReservationsPoint[];
    dailyAttendance: ComensalesDailyAttendancePoint[];
  };
  viewState: ComensalesViewState;
};

export type ZonasAnalyticsSnapshotModel = {
  kpis: ZonasKpis;
};
