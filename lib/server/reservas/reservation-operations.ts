import { FieldValue, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  canTransitionReservationStatus,
  findReservationTableConflict,
  normalizeOperationalReservationStatus,
  normalizeReservationDuration,
  type OperationalReservation,
  type OperationalReservationStatus,
} from "@/lib/reservas/reservation-operations";

function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function requiredDate(value: unknown): string {
  const date = clean(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("INVALID_DATE");
  return date;
}

function requiredTime(value: unknown): string {
  const time = clean(value, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("INVALID_TIME");
  return time;
}

function requiredPartySize(value: unknown): number {
  const partySize = Math.round(Number(value));
  if (!Number.isFinite(partySize) || partySize < 1 || partySize > 100) {
    throw new Error("INVALID_PARTY_SIZE");
  }
  return partySize;
}

function mapReservation(doc: QueryDocumentSnapshot): OperationalReservation {
  const data = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    restaurantId: clean(data.restaurantId, 120),
    customerName: clean(data.customerName, 160),
    customerPhone: clean(data.customerPhone, 80),
    ...(clean(data.customerEmail, 200) ? { customerEmail: clean(data.customerEmail, 200) } : {}),
    date: clean(data.date, 10),
    time: clean(data.time, 5),
    partySize: Math.max(1, Math.round(Number(data.partySize) || 1)),
    status: normalizeOperationalReservationStatus(data.status),
    durationMinutes: normalizeReservationDuration(data.durationMinutes),
    ...(clean(data.tableId, 160) ? { tableId: clean(data.tableId, 160) } : {}),
    ...(clean(data.tableLabel, 160) ? { tableLabel: clean(data.tableLabel, 160) } : {}),
    ...(clean(data.floorPlanId, 160) ? { floorPlanId: clean(data.floorPlanId, 160) } : {}),
    ...(clean(data.floorName, 160) ? { floorName: clean(data.floorName, 160) } : {}),
    ...(clean(data.zoneId, 160) ? { zoneId: clean(data.zoneId, 160) } : {}),
    ...(clean(data.zoneName, 160) ? { zoneName: clean(data.zoneName, 160) } : {}),
    ...(clean(data.notes, 1000) ? { notes: clean(data.notes, 1000) } : {}),
    ...(clean(data.allergies, 500) ? { allergies: clean(data.allergies, 500) } : {}),
    ...(clean(data.preferences, 500) ? { preferences: clean(data.preferences, 500) } : {}),
    ...(clean(data.occasion, 160) ? { occasion: clean(data.occasion, 160) } : {}),
  };
}

async function tableAssignmentPayload(args: {
  db: Firestore;
  restaurantId: string;
  tableId: string;
  partySize: number;
}) {
  const tableId = clean(args.tableId, 160);
  if (!tableId) return {
    tableId: null,
    tableLabel: null,
    floorPlanId: null,
    floorName: null,
    zoneId: null,
    zoneName: null,
  };

  const tableRef = args.db.collection("tables").doc(tableId);
  const tableSnap = await tableRef.get();
  if (!tableSnap.exists) throw new Error("TABLE_NOT_FOUND");
  const table = tableSnap.data() as Record<string, unknown>;
  if (clean(table.restaurantId, 120) !== args.restaurantId) throw new Error("TABLE_TENANT_MISMATCH");
  if ((table.type ?? "table") !== "table" || table.isActive === false) throw new Error("TABLE_NOT_AVAILABLE");
  const seats = Math.max(0, Math.round(Number(table.seats) || 0));
  if (seats < args.partySize) throw new Error("TABLE_CAPACITY_EXCEEDED");

  const floorPlanId = clean(table.floorPlanId, 160);
  let floorName = "";
  if (floorPlanId) {
    const planSnap = await args.db.collection("floorPlans").doc(floorPlanId).get();
    if (planSnap.exists) floorName = clean(planSnap.data()?.name, 160);
  }
  return {
    tableId,
    tableLabel: clean(table.name, 160) || tableId,
    floorPlanId: floorPlanId || null,
    floorName: floorName || null,
    zoneId: clean(table.zoneId, 160) || null,
    zoneName: clean(table.zoneName ?? table.zone, 160) || null,
  };
}

async function assertNoConflict(args: {
  db: Firestore;
  restaurantId: string;
  tableId?: string | null;
  date: string;
  time: string;
  durationMinutes: number;
  excludeReservationId?: string | null;
}) {
  const tableId = clean(args.tableId, 160);
  if (!tableId) return;
  const snap = await args.db
    .collection("reservations")
    .where("restaurantId", "==", args.restaurantId)
    .where("date", "==", args.date)
    .get();
  const conflict = findReservationTableConflict({
    reservations: snap.docs.map(mapReservation),
    tableId,
    date: args.date,
    time: args.time,
    durationMinutes: args.durationMinutes,
    excludeReservationId: args.excludeReservationId,
  });
  if (conflict) throw new Error("TABLE_TIME_CONFLICT");
}

export async function createOperationalReservation(args: {
  db: Firestore;
  restaurantId: string;
  userId: string;
  input: Record<string, unknown>;
}) {
  const customerName = clean(args.input.customerName, 160);
  if (!customerName) throw new Error("CUSTOMER_NAME_REQUIRED");
  const date = requiredDate(args.input.date);
  const time = requiredTime(args.input.time);
  const partySize = requiredPartySize(args.input.partySize);
  const durationMinutes = normalizeReservationDuration(args.input.durationMinutes);
  const table = await tableAssignmentPayload({
    db: args.db,
    restaurantId: args.restaurantId,
    tableId: clean(args.input.tableId, 160),
    partySize,
  });
  await assertNoConflict({
    db: args.db,
    restaurantId: args.restaurantId,
    tableId: table.tableId,
    date,
    time,
    durationMinutes,
  });
  const requestedStatus = normalizeOperationalReservationStatus(args.input.status);
  const status: OperationalReservationStatus = requestedStatus === "booked" ? "booked" : "pending";
  const payload = {
    restaurantId: args.restaurantId,
    customerName,
    customerPhone: clean(args.input.customerPhone, 80),
    customerEmail: clean(args.input.customerEmail, 200) || null,
    date,
    time,
    partySize,
    durationMinutes,
    status,
    ...table,
    notes: clean(args.input.notes, 1000) || null,
    allergies: clean(args.input.allergies, 500) || null,
    preferences: clean(args.input.preferences, 500) || null,
    occasion: clean(args.input.occasion, 160) || null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: args.userId,
    ...(status === "booked" ? { confirmedAt: FieldValue.serverTimestamp() } : {}),
  };
  const ref = await args.db.collection("reservations").add(payload);
  return { id: ref.id };
}

export async function updateOperationalReservation(args: {
  db: Firestore;
  restaurantId: string;
  userId: string;
  reservationId: string;
  input: Record<string, unknown>;
}) {
  const id = clean(args.reservationId, 160);
  if (!id) throw new Error("RESERVATION_REQUIRED");
  const ref = args.db.collection("reservations").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("RESERVATION_NOT_FOUND");
  const current = mapReservation(snap as QueryDocumentSnapshot);
  if (current.restaurantId !== args.restaurantId) throw new Error("RESERVATION_TENANT_MISMATCH");

  const date = args.input.date !== undefined ? requiredDate(args.input.date) : current.date;
  const time = args.input.time !== undefined ? requiredTime(args.input.time) : current.time;
  const partySize = args.input.partySize !== undefined ? requiredPartySize(args.input.partySize) : current.partySize;
  const durationMinutes = args.input.durationMinutes !== undefined
    ? normalizeReservationDuration(args.input.durationMinutes)
    : normalizeReservationDuration(current.durationMinutes);
  const tableId = args.input.tableId !== undefined ? clean(args.input.tableId, 160) : clean(current.tableId, 160);
  const table = await tableAssignmentPayload({
    db: args.db,
    restaurantId: args.restaurantId,
    tableId,
    partySize,
  });
  await assertNoConflict({
    db: args.db,
    restaurantId: args.restaurantId,
    tableId: table.tableId,
    date,
    time,
    durationMinutes,
    excludeReservationId: id,
  });

  const patch: Record<string, unknown> = {
    date,
    time,
    partySize,
    durationMinutes,
    ...table,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: args.userId,
  };
  for (const key of ["customerName", "customerPhone", "customerEmail", "notes", "allergies", "preferences", "occasion"] as const) {
    if (args.input[key] !== undefined) {
      const max = key === "notes" ? 1000 : key === "customerEmail" ? 200 : key === "customerName" ? 160 : 500;
      patch[key] = clean(args.input[key], max) || null;
    }
  }
  if (args.input.customerName !== undefined && !clean(args.input.customerName, 160)) {
    throw new Error("CUSTOMER_NAME_REQUIRED");
  }
  await ref.update(patch);
  return { id };
}

export async function transitionOperationalReservation(args: {
  db: Firestore;
  restaurantId: string;
  userId: string;
  reservationId: string;
  nextStatus: OperationalReservationStatus;
}) {
  const id = clean(args.reservationId, 160);
  const ref = args.db.collection("reservations").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("RESERVATION_NOT_FOUND");
  const current = mapReservation(snap as QueryDocumentSnapshot);
  if (current.restaurantId !== args.restaurantId) throw new Error("RESERVATION_TENANT_MISMATCH");
  const nextStatus = normalizeOperationalReservationStatus(args.nextStatus);
  if (!canTransitionReservationStatus(current.status, nextStatus)) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }
  if (nextStatus === "seated" && !clean(current.tableId, 160)) {
    throw new Error("TABLE_REQUIRED_TO_SEAT");
  }
  const eventField =
    nextStatus === "booked" ? "confirmedAt" :
      nextStatus === "seated" ? "seatedAt" :
        nextStatus === "completed" ? "completedAt" :
          nextStatus === "cancelled" ? "cancelledAt" :
            nextStatus === "no_show" ? "noShowAt" : null;
  await ref.update({
    status: nextStatus,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: args.userId,
    ...(eventField ? { [eventField]: FieldValue.serverTimestamp() } : {}),
  });
  return { id, status: nextStatus };
}
