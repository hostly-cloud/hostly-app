export type EmployeePosition =
  | "manager"
  | "waiter"
  | "kitchen"
  | "bar"
  | "host"
  | "runner"
  | "other";

export type EmployeeProfile = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  position: EmployeePosition;
  area: string;
  startDate: string;
  notes: string;
  active: boolean;
  updatedAt?: string;
};

export type EmployeeShift = {
  id: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  area: string;
  notes: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TimeEntryStatus = "working" | "on_break" | "completed";

export type EmployeeTimeEntry = {
  id: string;
  employeeId: string;
  workDate: string;
  clockInAt: string;
  clockOutAt: string | null;
  breakStartedAt: string | null;
  breakMinutes: number;
  status: TimeEntryStatus;
  source: "self" | "manager";
  correctedBy?: string | null;
  correctionReason?: string | null;
  updatedAt?: string;
};

export type EmployeeDocument = {
  id: string;
  employeeId: string;
  name: string;
  category: "contract" | "payroll" | "certificate" | "other";
  contentType: string;
  size: number;
  status: "pending" | "delivered" | "read";
  uploadedAt?: string;
  uploadedBy?: string;
};

export type EmployeeOperationalSummary = {
  scheduledToday: number;
  workingNow: number;
  onBreakNow: number;
  missingClockIn: number;
  completedToday: number;
  workedMinutesToday: number;
};

export type EmployeeOperationsSnapshot = {
  profiles: EmployeeProfile[];
  shifts: EmployeeShift[];
  timeEntries: EmployeeTimeEntry[];
  documents: EmployeeDocument[];
  summary: EmployeeOperationalSummary;
  range: { from: string; to: string };
};

export type ClockAction = "clock_in" | "break_start" | "break_end" | "clock_out";
