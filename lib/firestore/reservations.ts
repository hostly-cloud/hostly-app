import { FirebaseError } from "firebase/app";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  query,
  serverTimestamp,
  updateDoc,
  where,
  onSnapshot,
  type DocumentData,
  type Unsubscribe,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import {
  normalizeOperationalReservationStatus,
  normalizeReservationDuration,
  type OperationalReservationStatus,
} from "@/lib/reservas/reservation-operations";

export type ReservationStatus = OperationalReservationStatus;

export type Reservation = {
  id: string;
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  date: string;
  time: string;
  partySize: number;
  status: ReservationStatus;
  durationMinutes?: number;
  tableId?: string;
  tableLabel?: string;
  /** Plano operativo (colección `floorPlans`); opcional en reservas legacy. */
  floorPlanId?: string;
  /** Nombre del plano en el momento de guardar (denormalizado). */
  floorName?: string;
  zoneId?: string;
  zoneName?: string;
  notes?: string;
  allergies?: string;
  preferences?: string;
  occasion?: string;
  createdAt?: number;
  updatedAt?: number;
  confirmedAt?: number;
  seatedAt?: number;
  completedAt?: number;
  cancelledAt?: number;
  noShowAt?: number;
};

const COLLECTION = "reservations";

function rethrowWithMessage(e: unknown): never {
  if (e instanceof FirebaseError) {
    throw new Error(`${e.code}: ${e.message}`);
  }
  if (e instanceof Error) throw e;
  throw new Error(String(e));
}

function readTsMs(data: Record<string, unknown>, key: string): number | undefined {
  const v = data[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Timestamp) return v.toMillis();
  return undefined;
}

function parseStatus(v: unknown): ReservationStatus {
  return normalizeOperationalReservationStatus(v);
}

function readOptionalString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function mapDocToReservation(d: QueryDocumentSnapshot): Reservation {
  const data = d.data() as Record<string, unknown>;
  return {
    id: d.id,
    restaurantId: typeof data.restaurantId === "string" ? data.restaurantId.trim() : "",
    customerName: typeof data.customerName === "string" ? data.customerName.trim() : "",
    customerPhone: typeof data.customerPhone === "string" ? data.customerPhone.trim() : "",
    ...(readOptionalString(data, "customerEmail") ? { customerEmail: readOptionalString(data, "customerEmail") } : {}),
    date: typeof data.date === "string" ? data.date.trim() : "",
    time: typeof data.time === "string" ? data.time.trim() : "",
    partySize:
      typeof data.partySize === "number" && Number.isFinite(data.partySize)
        ? data.partySize
        : Number(data.partySize) || 0,
    status: parseStatus(data.status),
    durationMinutes: normalizeReservationDuration(data.durationMinutes),
    ...(readOptionalString(data, "tableId") ? { tableId: readOptionalString(data, "tableId") } : {}),
    ...(readOptionalString(data, "tableLabel") ? { tableLabel: readOptionalString(data, "tableLabel") } : {}),
    ...(readOptionalString(data, "floorPlanId") ? { floorPlanId: readOptionalString(data, "floorPlanId") } : {}),
    ...(readOptionalString(data, "floorName") ? { floorName: readOptionalString(data, "floorName") } : {}),
    ...(readOptionalString(data, "zoneId") ? { zoneId: readOptionalString(data, "zoneId") } : {}),
    ...(readOptionalString(data, "zoneName") ? { zoneName: readOptionalString(data, "zoneName") } : {}),
    ...(readOptionalString(data, "notes") ? { notes: readOptionalString(data, "notes") } : {}),
    ...(readOptionalString(data, "allergies") ? { allergies: readOptionalString(data, "allergies") } : {}),
    ...(readOptionalString(data, "preferences") ? { preferences: readOptionalString(data, "preferences") } : {}),
    ...(readOptionalString(data, "occasion") ? { occasion: readOptionalString(data, "occasion") } : {}),
    createdAt: readTsMs(data, "createdAt"),
    updatedAt: readTsMs(data, "updatedAt"),
    confirmedAt: readTsMs(data, "confirmedAt"),
    seatedAt: readTsMs(data, "seatedAt"),
    completedAt: readTsMs(data, "completedAt"),
    cancelledAt: readTsMs(data, "cancelledAt"),
    noShowAt: readTsMs(data, "noShowAt"),
  };
}

export function listenReservationsForDate(
  restaurantId: string,
  date: string,
  onData: (items: Reservation[]) => void,
  onListenError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  const d = date.trim();
  if (!rid || !d || !isAuthReady()) {
    onData([]);
    return () => {};
  }
  const q = query(
    collection(db, COLLECTION),
    where("restaurantId", "==", rid),
    where("date", "==", d),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(mapDocToReservation);
      list.sort((a, b) => a.time.localeCompare(b.time, "es"));
      onData(list);
    },
    (err) => {
      console.error("listenReservationsForDate Firestore error", err);
      onListenError?.(err);
      onData([]);
    },
  );
}

export function listenReservationsForRange(
  restaurantId: string,
  dateFrom: string,
  dateTo: string,
  onData: (items: Reservation[]) => void,
  onListenError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  const from = dateFrom.trim();
  const to = dateTo.trim();
  if (!rid || !from || !to || !isAuthReady()) {
    onData([]);
    return () => {};
  }
  const q = query(
    collection(db, COLLECTION),
    where("restaurantId", "==", rid),
    where("date", ">=", from),
    where("date", "<=", to),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(mapDocToReservation);
      list.sort((a, b) => {
        const d = a.date.localeCompare(b.date, "es");
        if (d !== 0) return d;
        return a.time.localeCompare(b.time, "es");
      });
      onData(list);
    },
    (err) => {
      console.error("listenReservationsForRange Firestore error", err);
      onData([]);
      onListenError?.(err);
    },
  );
}

export async function createReservation(
  restaurantId: string,
  payload: Omit<Reservation, "id" | "restaurantId" | "createdAt" | "updatedAt">,
): Promise<string> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("createReservation: restaurantId no disponible");
  const customerName = String(payload.customerName ?? "").trim();
  const customerPhone = String(payload.customerPhone ?? "").trim();
  const date = String(payload.date ?? "").trim();
  const time = String(payload.time ?? "").trim();
  const partySize = Math.max(1, Math.round(Number(payload.partySize) || 0));
  if (!customerName) throw new Error("createReservation: nombre vacío");
  if (!date) throw new Error("createReservation: fecha vacía");
  if (!time) throw new Error("createReservation: hora vacía");
  const status: ReservationStatus = parseStatus(payload.status);

  const docPayload: DocumentData = {
    restaurantId: rid,
    customerName,
    customerPhone,
    date,
    time,
    partySize,
    status,
    durationMinutes: normalizeReservationDuration(payload.durationMinutes),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const customerEmail = String(payload.customerEmail ?? "").trim();
  if (customerEmail) docPayload.customerEmail = customerEmail;

  const tid = String(payload.tableId ?? "").trim();
  if (tid) {
    docPayload.tableId = tid;
    const tlab = String(payload.tableLabel ?? "").trim();
    if (tlab) docPayload.tableLabel = tlab;
  }
  if (payload.zoneId && payload.zoneName) {
    docPayload.zoneId = payload.zoneId;
    docPayload.zoneName = payload.zoneName;
  }
  const fpId = String(payload.floorPlanId ?? "").trim();
  if (fpId) {
    docPayload.floorPlanId = fpId;
    const fn = String(payload.floorName ?? "").trim();
    if (fn) docPayload.floorName = fn;
  }
  for (const key of ["notes", "allergies", "preferences", "occasion"] as const) {
    const value = String(payload[key] ?? "").trim();
    if (value) docPayload[key] = value;
  }
  if (status === "booked") docPayload.confirmedAt = serverTimestamp();

  try {
    const ref = await addDoc(collection(db, COLLECTION), docPayload);
    return ref.id;
  } catch (e) {
    console.error("createReservation failed", e);
    rethrowWithMessage(e);
  }
}

export async function updateReservation(
  reservationId: string,
  updates: Partial<
    Pick<
      Reservation,
      | "status"
      | "tableId"
      | "tableLabel"
      | "floorPlanId"
      | "floorName"
      | "zoneId"
      | "zoneName"
      | "notes"
      | "allergies"
      | "preferences"
      | "occasion"
      | "customerName"
      | "customerPhone"
      | "customerEmail"
      | "partySize"
      | "date"
      | "time"
      | "durationMinutes"
    >
  >,
): Promise<void> {
  const id = String(reservationId ?? "").trim();
  if (!id) throw new Error("updateReservation: reservationId no disponible");
  const payload: DocumentData = { updatedAt: serverTimestamp() };
  if (updates.status) {
    payload.status = parseStatus(updates.status);
    if (updates.status === "booked") payload.confirmedAt = serverTimestamp();
    if (updates.status === "seated") payload.seatedAt = serverTimestamp();
    if (updates.status === "completed") payload.completedAt = serverTimestamp();
    if (updates.status === "cancelled") payload.cancelledAt = serverTimestamp();
    if (updates.status === "no_show") payload.noShowAt = serverTimestamp();
  }
  if (updates.customerName !== undefined) payload.customerName = String(updates.customerName ?? "").trim();
  if (updates.customerPhone !== undefined) payload.customerPhone = String(updates.customerPhone ?? "").trim();
  if (updates.customerEmail !== undefined) payload.customerEmail = String(updates.customerEmail ?? "").trim() || null;
  if (updates.date !== undefined) payload.date = String(updates.date ?? "").trim();
  if (updates.time !== undefined) payload.time = String(updates.time ?? "").trim();
  if (updates.partySize !== undefined) payload.partySize = Math.max(1, Math.round(Number(updates.partySize) || 0));
  if (updates.durationMinutes !== undefined) payload.durationMinutes = normalizeReservationDuration(updates.durationMinutes);

  if (updates.tableId !== undefined) payload.tableId = updates.tableId ? String(updates.tableId).trim() : null;
  if (updates.tableLabel !== undefined) payload.tableLabel = updates.tableLabel ? String(updates.tableLabel).trim() : null;
  if (updates.floorPlanId !== undefined) {
    payload.floorPlanId = updates.floorPlanId ? String(updates.floorPlanId).trim() : null;
  }
  if (updates.floorName !== undefined) {
    payload.floorName = updates.floorName ? String(updates.floorName).trim() : null;
  }
  if (updates.zoneId !== undefined) payload.zoneId = updates.zoneId ? String(updates.zoneId).trim() : null;
  if (updates.zoneName !== undefined) payload.zoneName = updates.zoneName ? String(updates.zoneName).trim() : null;
  for (const key of ["notes", "allergies", "preferences", "occasion"] as const) {
    if (updates[key] !== undefined) payload[key] = updates[key] ? String(updates[key]).trim() : null;
  }
  try {
    await updateDoc(doc(db, COLLECTION, id), payload);
  } catch (e) {
    rethrowWithMessage(e);
  }
}
