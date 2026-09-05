import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { paymentSaleAmount } from "@/lib/payments/paymentSaleAmount";
import type {
  EmployeeSalesPerformanceRow,
  EmployeeSalesPerformanceSnapshot,
} from "@/lib/employees/sales-performance-types";

const MONTH_RE = /^(\d{4})-(\d{2})$/;

export class EmployeeSalesPerformanceError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(code);
    this.name = "EmployeeSalesPerformanceError";
  }
}

function cleanText(value: unknown, max = 254): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseMonth(value: unknown): { month: string; fromMs: number; toMs: number } {
  const month = cleanText(value, 7);
  const match = MONTH_RE.exec(month);
  if (!match) throw new EmployeeSalesPerformanceError("INVALID_MONTH", 400);
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new EmployeeSalesPerformanceError("INVALID_MONTH", 400);
  }
  const from = new Date(year, monthNumber - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, monthNumber, 1, 0, 0, 0, 0);
  return { month, fromMs: from.getTime(), toMs: to.getTime() - 1 };
}

function readMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return null;
}

function normalizeEmail(value: unknown): string {
  return cleanText(value).toLowerCase();
}

type Profile = {
  employeeId: string;
  userId: string;
  displayName: string;
  email: string;
  position: string;
  active: boolean;
};

function profileFromDoc(id: string, data: Record<string, unknown>): Profile {
  return {
    employeeId: id,
    userId: cleanText(data.userId, 160) || id,
    displayName: cleanText(data.displayName, 160) || cleanText(data.email, 254) || "Empleado",
    email: normalizeEmail(data.email),
    position: cleanText(data.position, 80),
    active: data.active !== false,
  };
}

function readGoalAmount(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number * 100) / 100;
}

function rowStatus(progressPct: number | null): EmployeeSalesPerformanceRow["status"] {
  if (progressPct == null) return "no_target";
  if (progressPct >= 100) return "achieved";
  if (progressPct >= 75) return "on_track";
  return "behind";
}

export async function buildEmployeeSalesPerformance(input: {
  db: Firestore;
  restaurantId: string;
  month: string;
}): Promise<EmployeeSalesPerformanceSnapshot> {
  const range = parseMonth(input.month);
  const root = input.db.collection("restaurants").doc(input.restaurantId);
  const [profilesSnap, goalsSnap, paymentsSnap] = await Promise.all([
    root.collection("employees").get(),
    root.collection("employeeSalesGoals").where("month", "==", range.month).get(),
    input.db
      .collection("payments")
      .where("restaurantId", "==", input.restaurantId)
      .where("status", "==", "paid")
      .get(),
  ]);

  const profiles = profilesSnap.docs
    .map((doc) => profileFromDoc(doc.id, doc.data() as Record<string, unknown>))
    .filter((profile) => profile.active);
  const profileByAnyId = new Map<string, Profile>();
  const profileByEmail = new Map<string, Profile>();
  for (const profile of profiles) {
    profileByAnyId.set(profile.employeeId, profile);
    profileByAnyId.set(profile.userId, profile);
    if (profile.email) profileByEmail.set(profile.email, profile);
  }

  const goalsByEmployeeId = new Map<string, number>();
  for (const doc of goalsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const employeeId = cleanText(data.employeeId, 160) || doc.id.split("__")[0] || "";
    const targetAmount = readGoalAmount(data.targetAmount);
    if (employeeId && targetAmount != null) goalsByEmployeeId.set(employeeId, targetAmount);
  }

  const aggregates = new Map<string, { salesAmount: number; ticketCount: number }>();
  let totalSalesAmount = 0;
  let totalTicketCount = 0;
  let attributedSalesAmount = 0;
  let unattributedSalesAmount = 0;

  for (const doc of paymentsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const createdAtMs = readMs(data.createdAt);
    if (createdAtMs == null || createdAtMs < range.fromMs || createdAtMs > range.toMs) continue;
    const amount = Math.max(0, paymentSaleAmount(data));
    totalSalesAmount += amount;
    totalTicketCount += 1;

    const candidateIds = [data.waiterId, data.userId, data.createdBy]
      .map((value) => cleanText(value, 160))
      .filter(Boolean);
    let profile: Profile | undefined;
    for (const id of candidateIds) {
      profile = profileByAnyId.get(id);
      if (profile) break;
    }
    if (!profile) {
      const email = normalizeEmail(data.waiterEmail);
      if (email) profile = profileByEmail.get(email);
    }

    if (!profile) {
      unattributedSalesAmount += amount;
      continue;
    }
    attributedSalesAmount += amount;
    const current = aggregates.get(profile.employeeId) ?? { salesAmount: 0, ticketCount: 0 };
    current.salesAmount += amount;
    current.ticketCount += 1;
    aggregates.set(profile.employeeId, current);
  }

  const rows: EmployeeSalesPerformanceRow[] = profiles.map((profile) => {
    const aggregate = aggregates.get(profile.employeeId) ?? { salesAmount: 0, ticketCount: 0 };
    const salesAmount = Math.round(aggregate.salesAmount * 100) / 100;
    const averageTicket = aggregate.ticketCount > 0 ? salesAmount / aggregate.ticketCount : 0;
    const targetAmount = goalsByEmployeeId.get(profile.employeeId) ?? null;
    const progressPct = targetAmount != null ? Math.round((salesAmount / targetAmount) * 1000) / 10 : null;
    const remainingAmount = targetAmount != null ? Math.max(0, Math.round((targetAmount - salesAmount) * 100) / 100) : null;
    return {
      employeeId: profile.employeeId,
      displayName: profile.displayName,
      email: profile.email || null,
      position: profile.position || null,
      salesAmount,
      ticketCount: aggregate.ticketCount,
      averageTicket: Math.round(averageTicket * 100) / 100,
      targetAmount,
      progressPct,
      remainingAmount,
      status: rowStatus(progressPct),
    };
  });

  rows.sort((a, b) => b.salesAmount - a.salesAmount || a.displayName.localeCompare(b.displayName, "es"));
  return {
    month: range.month,
    fromMs: range.fromMs,
    toMs: range.toMs,
    totalSalesAmount: Math.round(totalSalesAmount * 100) / 100,
    totalTicketCount,
    averageTicket: totalTicketCount > 0 ? Math.round((totalSalesAmount / totalTicketCount) * 100) / 100 : 0,
    attributedSalesAmount: Math.round(attributedSalesAmount * 100) / 100,
    unattributedSalesAmount: Math.round(unattributedSalesAmount * 100) / 100,
    rows,
  };
}

export async function saveEmployeeSalesGoal(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  employeeId: unknown;
  month: unknown;
  targetAmount: unknown;
}) {
  const employeeId = cleanText(input.employeeId, 160);
  if (!employeeId) throw new EmployeeSalesPerformanceError("EMPLOYEE_ID_REQUIRED", 400);
  const range = parseMonth(input.month);
  const targetAmount = readGoalAmount(input.targetAmount);
  const ref = input.db
    .collection("restaurants")
    .doc(input.restaurantId)
    .collection("employeeSalesGoals")
    .doc(`${employeeId}__${range.month}`);

  if (targetAmount == null) {
    await ref.delete();
    return;
  }
  await ref.set(
    {
      employeeId,
      month: range.month,
      targetAmount,
      updatedBy: input.actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
