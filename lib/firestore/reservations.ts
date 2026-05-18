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
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";

export type ReservationStatus =
  | "booked"
  | "seated"
  | "completed"
  | "no_show"
  | "cancelled";

export type Reservation = {
  id: string;
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  partySize: number;
  status: ReservationStatus;
  tableId?: string;
  tableLabel?: string;
  /** Plano operativo (colección `floorPlans`); opcional en reservas legacy. */
  floorPlanId?: string;
  /** Nombre del plano en el momento de guardar (denormalizado). */
  floorName?: string;
  zoneId?: string;
  zoneName?: string;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
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
  if (
    v === "booked" ||
    v === "seated" ||
    v === "completed" ||
    v === "no_show" ||
    v === "cancelled"
  ) {
    return v;
  }
  return "booked";
}

function mapDocToReservation(d: QueryDocumentSnapshot): Reservation {
  const data = d.data() as Record<string, unknown>;
  return {
    id: d.id,
    restaurantId: typeof data.restaurantId === "string" ? data.restaurantId.trim() : "",
    customerName: typeof data.customerName === "string" ? data.customerName.trim() : "",
    customerPhone: typeof data.customerPhone === "string" ? data.customerPhone.trim() : "",
    date: typeof data.date === "string" ? data.date.trim() : "",
    time: typeof data.time === "string" ? data.time.trim() : "",
    partySize: typeof data.partySize === "number" && Number.isFinite(data.partySize) ? data.partySize : Number(data.partySize) || 0,
    status: parseStatus(data.status),
    ...(typeof data.tableId === "string" && data.tableId.trim() ? { tableId: data.tableId.trim() } : {}),
    ...(typeof data.tableLabel === "string" && data.tableLabel.trim() ? { tableLabel: data.tableLabel.trim() } : {}),
    ...(typeof data.floorPlanId === "string" && data.floorPlanId.trim()
      ? { floorPlanId: data.floorPlanId.trim() }
      : {}),
    ...(typeof data.floorName === "string" && data.floorName.trim()
      ? { floorName: data.floorName.trim() }
      : {}),
    ...(typeof data.zoneId === "string" && data.zoneId.trim() ? { zoneId: data.zoneId.trim() } : {}),
    ...(typeof data.zoneName === "string" && data.zoneName.trim() ? { zoneName: data.zoneName.trim() } : {}),
    ...(typeof data.notes === "string" && data.notes.trim() ? { notes: data.notes.trim() } : {}),
    createdAt: readTsMs(data, "createdAt"),
    updatedAt: readTsMs(data, "updatedAt"),
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
  if (!rid || !d || !auth.currentUser) {
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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

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
  if (payload.notes && String(payload.notes).trim()) {
    docPayload.notes = String(payload.notes).trim();
  }

  console.log("saving reservation", docPayload);

  try {
    const ref = await addDoc(collection(db, COLLECTION), docPayload);
    console.log("reservation saved", ref.id);
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
      | "customerName"
      | "customerPhone"
      | "partySize"
      | "date"
      | "time"
    >
  >,
): Promise<void> {
  const id = String(reservationId ?? "").trim();
  if (!id) throw new Error("updateReservation: reservationId no disponible");
  const payload: DocumentData = { updatedAt: serverTimestamp() };
  if (updates.status) payload.status = parseStatus(updates.status);
  if (updates.customerName !== undefined) payload.customerName = String(updates.customerName ?? "").trim();
  if (updates.customerPhone !== undefined) payload.customerPhone = String(updates.customerPhone ?? "").trim();
  if (updates.date !== undefined) payload.date = String(updates.date ?? "").trim();
  if (updates.time !== undefined) payload.time = String(updates.time ?? "").trim();
  if (updates.partySize !== undefined) payload.partySize = Math.max(1, Math.round(Number(updates.partySize) || 0));

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
  if (updates.notes !== undefined) payload.notes = updates.notes ? String(updates.notes).trim() : null;
  try {
    await updateDoc(doc(db, COLLECTION, id), payload);
  } catch (e) {
    rethrowWithMessage(e);
  }
}

