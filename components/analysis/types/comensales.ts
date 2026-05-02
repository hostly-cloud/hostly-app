export type ComensalesKpis = {
  booked: number;
  seated: number;
  completed: number;
  noShow: number;
  cancelled: number;
  paxPlanned: number;
  paxSeated: number;
  paxCompleted: number;
};

export type ComensalesDailyReservationsPoint = {
  date: string;
  label: string;
  total: number;
};

export type ComensalesDailyAttendancePoint = {
  date: string;
  label: string;
  llegadas: number;
  noShow: number;
};

export type ComensalesViewState = {
  dateFrom: string;
  dateTo: string;
  compactViewZonas: boolean;
};

