import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { EmployeeOperationsError } from "@/lib/server/employees/employee-operations";

function requiredText(value: unknown, code: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  if (!text) throw new EmployeeOperationsError(code, 400);
  return text;
}

function parseBreakMinutes(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(360, Math.round(number))) : 0;
}

function workDateMadrid(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function timestampIso(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

export async function correctTimeEntryWithAudit(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  id: unknown;
  clockInAt: unknown;
  clockOutAt?: unknown;
  breakMinutes?: unknown;
  reason: unknown;
}) {
  const id = requiredText(input.id, "TIME_ENTRY_ID_REQUIRED", 128);
  const reason = requiredText(input.reason, "CORRECTION_REASON_REQUIRED", 500);
  const clockInText = requiredText(input.clockInAt, "CLOCK_IN_REQUIRED", 64);
  const clockOutText = typeof input.clockOutAt === "string" ? input.clockOutAt.trim().slice(0, 64) : "";
  const clockInAt = new Date(clockInText);
  const clockOutAt = clockOutText ? new Date(clockOutText) : null;
  if (Number.isNaN(clockInAt.getTime()) || (clockOutAt && Number.isNaN(clockOutAt.getTime()))) {
    throw new EmployeeOperationsError("INVALID_TIME_ENTRY_DATE", 400);
  }
  if (clockOutAt && clockOutAt <= clockInAt) {
    throw new EmployeeOperationsError("CLOCK_OUT_BEFORE_CLOCK_IN", 400);
  }

  const root = input.db.collection("restaurants").doc(input.restaurantId);
  const entryRef = root.collection("timeEntries").doc(id);
  const auditRef = root.collection("timeEntryAudit").doc();
  const breakMinutes = parseBreakMinutes(input.breakMinutes);

  await input.db.runTransaction(async (transaction) => {
    const snap = await transaction.get(entryRef);
    if (!snap.exists) throw new EmployeeOperationsError("TIME_ENTRY_NOT_FOUND", 404);
    const before = snap.data() || {};
    const after = {
      clockInAt: Timestamp.fromDate(clockInAt),
      clockOutAt: clockOutAt ? Timestamp.fromDate(clockOutAt) : null,
      workDate: workDateMadrid(clockInAt),
      breakStartedAt: null,
      breakMinutes,
      status: clockOutAt ? "completed" : "working",
      source: "manager",
      correctedBy: input.actorUid,
      correctionReason: reason,
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.update(entryRef, after);
    transaction.set(auditRef, {
      timeEntryId: id,
      employeeId: typeof before.employeeId === "string" ? before.employeeId : "",
      reason,
      actorUid: input.actorUid,
      changedAt: FieldValue.serverTimestamp(),
      before: {
        clockInAt: timestampIso(before.clockInAt),
        clockOutAt: timestampIso(before.clockOutAt),
        breakMinutes: parseBreakMinutes(before.breakMinutes),
        status: typeof before.status === "string" ? before.status : "",
        correctionReason: typeof before.correctionReason === "string" ? before.correctionReason : null,
      },
      after: {
        clockInAt: clockInAt.toISOString(),
        clockOutAt: clockOutAt?.toISOString() || null,
        breakMinutes,
        status: clockOutAt ? "completed" : "working",
      },
    });
  });
}
