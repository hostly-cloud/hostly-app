import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import type {
  ClockAction,
  EmployeeDocument,
  EmployeeOperationsSnapshot,
  EmployeePosition,
  EmployeeProfile,
  EmployeeShift,
  EmployeeTimeEntry,
  TimeEntryStatus,
} from "@/lib/employees/types";

const POSITION_VALUES = new Set<EmployeePosition>([
  "manager",
  "waiter",
  "kitchen",
  "bar",
  "host",
  "runner",
  "other",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class EmployeeOperationsError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(code);
    this.name = "EmployeeOperationsError";
  }
}

function scoped(db: Firestore, restaurantId: string) {
  return db.collection("restaurants").doc(restaurantId);
}

function cleanText(value: unknown, maxLength = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function requiredText(value: unknown, code: string, maxLength = 160): string {
  const text = cleanText(value, maxLength);
  if (!text) throw new EmployeeOperationsError(code, 400);
  return text;
}

function parseDate(value: unknown, code = "INVALID_DATE"): string {
  const date = cleanText(value, 10);
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new EmployeeOperationsError(code, 400);
  }
  return date;
}

function parseTime(value: unknown, code = "INVALID_TIME"): string {
  const time = cleanText(value, 5);
  if (!TIME_RE.test(time)) throw new EmployeeOperationsError(code, 400);
  return time;
}

function parsePosition(value: unknown): EmployeePosition {
  const position = cleanText(value, 32) as EmployeePosition;
  return POSITION_VALUES.has(position) ? position : "other";
}

function parseBreakMinutes(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(360, Math.round(number)));
}

function asIso(value: unknown): string | undefined {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return value;
  return undefined;
}

function profileFromDoc(id: string, data: DocumentData): EmployeeProfile {
  return {
    id,
    userId: cleanText(data.userId || id, 128),
    displayName: cleanText(data.displayName, 160),
    email: cleanText(data.email, 254),
    phone: cleanText(data.phone, 48),
    position: parsePosition(data.position),
    area: cleanText(data.area, 80),
    startDate: cleanText(data.startDate, 10),
    notes: cleanText(data.notes, 1200),
    active: data.active !== false,
    updatedAt: asIso(data.updatedAt),
  };
}

function shiftFromDoc(id: string, data: DocumentData): EmployeeShift {
  return {
    id,
    employeeId: cleanText(data.employeeId, 128),
    date: cleanText(data.date, 10),
    startTime: cleanText(data.startTime, 5),
    endTime: cleanText(data.endTime, 5),
    breakMinutes: parseBreakMinutes(data.breakMinutes),
    area: cleanText(data.area, 80),
    notes: cleanText(data.notes, 600),
    createdBy: cleanText(data.createdBy, 128) || undefined,
    updatedBy: cleanText(data.updatedBy, 128) || undefined,
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

function timeEntryFromDoc(id: string, data: DocumentData): EmployeeTimeEntry {
  const rawStatus = cleanText(data.status, 24);
  const status: TimeEntryStatus =
    rawStatus === "on_break" || rawStatus === "completed" ? rawStatus : "working";
  return {
    id,
    employeeId: cleanText(data.employeeId, 128),
    workDate: cleanText(data.workDate, 10),
    clockInAt: asIso(data.clockInAt) || "",
    clockOutAt: asIso(data.clockOutAt) || null,
    breakStartedAt: asIso(data.breakStartedAt) || null,
    breakMinutes: parseBreakMinutes(data.breakMinutes),
    status,
    source: data.source === "manager" ? "manager" : "self",
    correctedBy: cleanText(data.correctedBy, 128) || null,
    correctionReason: cleanText(data.correctionReason, 500) || null,
    updatedAt: asIso(data.updatedAt),
  };
}

function documentFromDoc(id: string, data: DocumentData): EmployeeDocument {
  const category =
    data.category === "contract" ||
    data.category === "payroll" ||
    data.category === "certificate"
      ? data.category
      : "other";
  const status =
    data.status === "delivered" || data.status === "read" ? data.status : "pending";
  return {
    id,
    employeeId: cleanText(data.employeeId, 128),
    name: cleanText(data.name, 200),
    category,
    contentType: cleanText(data.contentType, 120),
    size: Math.max(0, Number(data.size) || 0),
    status,
    uploadedAt: asIso(data.uploadedAt),
    uploadedBy: cleanText(data.uploadedBy, 128) || undefined,
  };
}

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function minutesBetween(startIso: string, endIso: string): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / 60000);
}

export function buildEmployeeOperationalSummary(
  shifts: EmployeeShift[],
  entries: EmployeeTimeEntry[],
  today = todayMadrid(),
) {
  const todayShifts = shifts.filter((shift) => shift.date === today);
  const todayEntries = entries.filter((entry) => entry.workDate === today);
  const entryByEmployee = new Map(todayEntries.map((entry) => [entry.employeeId, entry]));
  const completed = todayEntries.filter((entry) => entry.status === "completed");
  const nowIso = new Date().toISOString();
  const workedMinutesToday = todayEntries.reduce((total, entry) => {
    const end = entry.clockOutAt || nowIso;
    return total + Math.max(0, minutesBetween(entry.clockInAt, end) - entry.breakMinutes);
  }, 0);
  return {
    scheduledToday: todayShifts.length,
    workingNow: todayEntries.filter((entry) => entry.status === "working").length,
    onBreakNow: todayEntries.filter((entry) => entry.status === "on_break").length,
    missingClockIn: todayShifts.filter((shift) => !entryByEmployee.has(shift.employeeId)).length,
    completedToday: completed.length,
    workedMinutesToday,
  };
}

export async function listEmployeeOperations(input: {
  db: Firestore;
  restaurantId: string;
  from: string;
  to: string;
}): Promise<EmployeeOperationsSnapshot> {
  const from = parseDate(input.from, "INVALID_FROM_DATE");
  const to = parseDate(input.to, "INVALID_TO_DATE");
  if (from > to) throw new EmployeeOperationsError("INVALID_DATE_RANGE", 400);
  const root = scoped(input.db, input.restaurantId);
  const [profileSnap, shiftSnap, timeSnap, documentSnap] = await Promise.all([
    root.collection("employees").get(),
    root.collection("shifts").get(),
    root.collection("timeEntries").get(),
    root.collection("employeeDocuments").get(),
  ]);
  const profiles = profileSnap.docs.map((doc) => profileFromDoc(doc.id, doc.data()));
  const shifts = shiftSnap.docs
    .map((doc) => shiftFromDoc(doc.id, doc.data()))
    .filter((shift) => shift.date >= from && shift.date <= to)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const timeEntries = timeSnap.docs
    .map((doc) => timeEntryFromDoc(doc.id, doc.data()))
    .filter((entry) => entry.workDate >= from && entry.workDate <= to)
    .sort((a, b) => b.clockInAt.localeCompare(a.clockInAt));
  const employeeIds = new Set(profiles.map((profile) => profile.userId));
  const documents = documentSnap.docs
    .map((doc) => documentFromDoc(doc.id, doc.data()))
    .filter((doc) => employeeIds.size === 0 || employeeIds.has(doc.employeeId))
    .sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));
  return {
    profiles,
    shifts,
    timeEntries,
    documents,
    summary: buildEmployeeOperationalSummary(shifts, timeEntries),
    range: { from, to },
  };
}

export async function upsertEmployeeProfile(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  userId: unknown;
  displayName: unknown;
  email: unknown;
  phone?: unknown;
  position?: unknown;
  area?: unknown;
  startDate?: unknown;
  notes?: unknown;
  active?: unknown;
}) {
  const userId = requiredText(input.userId, "EMPLOYEE_ID_REQUIRED", 128);
  const displayName = requiredText(input.displayName, "EMPLOYEE_NAME_REQUIRED", 160);
  const email = requiredText(input.email, "EMPLOYEE_EMAIL_REQUIRED", 254).toLowerCase();
  const startDate = input.startDate ? parseDate(input.startDate, "INVALID_START_DATE") : "";
  await scoped(input.db, input.restaurantId)
    .collection("employees")
    .doc(userId)
    .set(
      {
        userId,
        displayName,
        email,
        phone: cleanText(input.phone, 48),
        position: parsePosition(input.position),
        area: cleanText(input.area, 80),
        startDate,
        notes: cleanText(input.notes, 1200),
        active: input.active !== false,
        updatedBy: input.actorUid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function saveEmployeeShift(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  id?: unknown;
  employeeId: unknown;
  date: unknown;
  startTime: unknown;
  endTime: unknown;
  breakMinutes?: unknown;
  area?: unknown;
  notes?: unknown;
}): Promise<string> {
  const root = scoped(input.db, input.restaurantId);
  const employeeId = requiredText(input.employeeId, "EMPLOYEE_ID_REQUIRED", 128);
  const employee = await root.collection("employees").doc(employeeId).get();
  if (!employee.exists) throw new EmployeeOperationsError("EMPLOYEE_NOT_FOUND", 404);
  const date = parseDate(input.date);
  const startTime = parseTime(input.startTime, "INVALID_START_TIME");
  const endTime = parseTime(input.endTime, "INVALID_END_TIME");
  if (endTime <= startTime) throw new EmployeeOperationsError("SHIFT_END_BEFORE_START", 400);
  const explicitId = cleanText(input.id, 128);
  const ref = explicitId ? root.collection("shifts").doc(explicitId) : root.collection("shifts").doc();
  const existing = explicitId ? await ref.get() : null;
  if (existing && !existing.exists) throw new EmployeeOperationsError("SHIFT_NOT_FOUND", 404);
  await ref.set(
    {
      employeeId,
      date,
      startTime,
      endTime,
      breakMinutes: parseBreakMinutes(input.breakMinutes),
      area: cleanText(input.area, 80),
      notes: cleanText(input.notes, 600),
      updatedBy: input.actorUid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing ? {} : { createdBy: input.actorUid, createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  return ref.id;
}

export async function deleteEmployeeShift(input: {
  db: Firestore;
  restaurantId: string;
  id: unknown;
}) {
  const id = requiredText(input.id, "SHIFT_ID_REQUIRED", 128);
  const ref = scoped(input.db, input.restaurantId).collection("shifts").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new EmployeeOperationsError("SHIFT_NOT_FOUND", 404);
  await ref.delete();
}

function isoDateInMadrid(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function applyClockAction(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  employeeId: string;
  action: ClockAction;
  source?: "self" | "manager";
}) {
  const root = scoped(input.db, input.restaurantId);
  const employee = await root.collection("employees").doc(input.employeeId).get();
  if (!employee.exists) throw new EmployeeOperationsError("EMPLOYEE_NOT_FOUND", 404);
  const workDate = isoDateInMadrid(new Date());
  const query = await root
    .collection("timeEntries")
    .where("employeeId", "==", input.employeeId)
    .where("workDate", "==", workDate)
    .limit(5)
    .get();
  const openDoc = query.docs
    .map((doc) => ({ ref: doc.ref, data: doc.data() }))
    .find((item) => item.data.status !== "completed");
  const now = Timestamp.now();

  if (input.action === "clock_in") {
    if (openDoc) throw new EmployeeOperationsError("TIME_ENTRY_ALREADY_OPEN", 409);
    const ref = root.collection("timeEntries").doc();
    await ref.set({
      employeeId: input.employeeId,
      workDate,
      clockInAt: now,
      clockOutAt: null,
      breakStartedAt: null,
      breakMinutes: 0,
      status: "working",
      source: input.source === "manager" ? "manager" : "self",
      createdBy: input.actorUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  if (!openDoc) throw new EmployeeOperationsError("TIME_ENTRY_NOT_OPEN", 409);
  const status = cleanText(openDoc.data.status, 24) as TimeEntryStatus;
  if (input.action === "break_start") {
    if (status !== "working") throw new EmployeeOperationsError("BREAK_ALREADY_STARTED", 409);
    await openDoc.ref.update({
      status: "on_break",
      breakStartedAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  if (input.action === "break_end") {
    if (status !== "on_break" || !(openDoc.data.breakStartedAt instanceof Timestamp)) {
      throw new EmployeeOperationsError("BREAK_NOT_STARTED", 409);
    }
    const elapsed = Math.max(
      0,
      Math.round((now.toMillis() - openDoc.data.breakStartedAt.toMillis()) / 60000),
    );
    await openDoc.ref.update({
      status: "working",
      breakStartedAt: null,
      breakMinutes: parseBreakMinutes(openDoc.data.breakMinutes) + elapsed,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  if (status === "on_break" && openDoc.data.breakStartedAt instanceof Timestamp) {
    const elapsed = Math.max(
      0,
      Math.round((now.toMillis() - openDoc.data.breakStartedAt.toMillis()) / 60000),
    );
    await openDoc.ref.update({
      status: "completed",
      clockOutAt: now,
      breakStartedAt: null,
      breakMinutes: parseBreakMinutes(openDoc.data.breakMinutes) + elapsed,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  await openDoc.ref.update({
    status: "completed",
    clockOutAt: now,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function correctTimeEntry(input: {
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
  const clockInAt = new Date(requiredText(input.clockInAt, "CLOCK_IN_REQUIRED", 64));
  const clockOutText = cleanText(input.clockOutAt, 64);
  const clockOutAt = clockOutText ? new Date(clockOutText) : null;
  if (Number.isNaN(clockInAt.getTime()) || (clockOutAt && Number.isNaN(clockOutAt.getTime()))) {
    throw new EmployeeOperationsError("INVALID_TIME_ENTRY_DATE", 400);
  }
  if (clockOutAt && clockOutAt <= clockInAt) {
    throw new EmployeeOperationsError("CLOCK_OUT_BEFORE_CLOCK_IN", 400);
  }
  const ref = scoped(input.db, input.restaurantId).collection("timeEntries").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new EmployeeOperationsError("TIME_ENTRY_NOT_FOUND", 404);
  await ref.update({
    clockInAt: Timestamp.fromDate(clockInAt),
    clockOutAt: clockOutAt ? Timestamp.fromDate(clockOutAt) : null,
    workDate: isoDateInMadrid(clockInAt),
    breakStartedAt: null,
    breakMinutes: parseBreakMinutes(input.breakMinutes),
    status: clockOutAt ? "completed" : "working",
    source: "manager",
    correctedBy: input.actorUid,
    correctionReason: reason,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
