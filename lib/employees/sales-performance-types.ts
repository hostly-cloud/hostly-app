export type EmployeeSalesPerformanceRow = {
  employeeId: string;
  displayName: string;
  email: string | null;
  position: string | null;
  salesAmount: number;
  ticketCount: number;
  averageTicket: number;
  targetAmount: number | null;
  progressPct: number | null;
  remainingAmount: number | null;
  status: "no_target" | "behind" | "on_track" | "achieved";
};

export type EmployeeSalesPerformanceSnapshot = {
  month: string;
  fromMs: number;
  toMs: number;
  totalSalesAmount: number;
  totalTicketCount: number;
  averageTicket: number;
  attributedSalesAmount: number;
  unattributedSalesAmount: number;
  rows: EmployeeSalesPerformanceRow[];
};

export type EmployeeSalesPerformanceApiResponse =
  | { ok: true; snapshot: EmployeeSalesPerformanceSnapshot }
  | { ok: false; error: string };
