import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import {
  DEFAULT_OPERATION_STATION_SPECS,
  isOperationStationType,
  normalizeOperationStationName,
  sortOperationStations,
  type OperationStationDocument,
  type OperationStationInput,
  type OperationStationType,
} from "@/lib/operacion/operation-station-types";

export function operationStationsCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "operationStations");
}

export function operationStationDocRef(restaurantId: string, stationId: string) {
  return doc(operationStationsCollectionRef(restaurantId), stationId.trim());
}

function authUidOrThrow(): string {
  const uid = auth.currentUser?.uid?.trim();
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

function readOptionalTrimmed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t || undefined;
}

export function parseOperationStationDocument(
  stationId: string,
  raw: unknown,
  restaurantId: string,
): OperationStationDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rid =
    typeof data.restaurantId === "string"
      ? data.restaurantId.trim()
      : restaurantId.trim();
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : "";
  const normalizedName =
    typeof data.normalizedName === "string" && data.normalizedName.trim()
      ? data.normalizedName.trim()
      : normalizeOperationStationName(name);
  const type = data.type;
  if (!name || !isOperationStationType(type)) return null;
  const createdAt =
    typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
      ? data.createdAt
      : Date.now();
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : createdAt;
  const sortOrder =
    typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
      ? Math.floor(data.sortOrder)
      : 0;

  return {
    id: stationId,
    restaurantId: rid,
    name,
    normalizedName,
    type,
    active: data.active !== false,
    sortOrder,
    ...(readOptionalTrimmed(data.printerChannel)
      ? { printerChannel: readOptionalTrimmed(data.printerChannel) }
      : {}),
    ...(readOptionalTrimmed(data.printerName)
      ? { printerName: readOptionalTrimmed(data.printerName) }
      : {}),
    createdAt,
    updatedAt,
    ...(readOptionalTrimmed(data.createdBy)
      ? { createdBy: readOptionalTrimmed(data.createdBy) }
      : {}),
    ...(readOptionalTrimmed(data.updatedBy)
      ? { updatedBy: readOptionalTrimmed(data.updatedBy) }
      : {}),
  };
}

export function isDuplicateOperationStationName(
  stations: OperationStationDocument[],
  name: string,
  excludeId?: string,
): boolean {
  const norm = normalizeOperationStationName(name);
  if (!norm) return false;
  const alt = normalizeProductName(name);
  return stations.some((s) => {
    if (excludeId && s.id === excludeId) return false;
    return (
      s.normalizedName === norm ||
      normalizeOperationStationName(s.name) === norm ||
      normalizeProductName(s.name) === alt
    );
  });
}

/** Lectura puntual (p. ej. creación de printJobs); sin listener. */
export async function listOperationStations(
  restaurantId: string,
): Promise<OperationStationDocument[]> {
  if (!isAuthReady()) return [];
  return fetchAllStations(restaurantId);
}

async function fetchAllStations(
  restaurantId: string,
): Promise<OperationStationDocument[]> {
  const snap = await getDocs(
    query(
      operationStationsCollectionRef(restaurantId),
      orderBy("sortOrder", "asc"),
    ),
  );
  const rid = restaurantId.trim();
  const list: OperationStationDocument[] = [];
  snap.forEach((docSnap) => {
    const parsed = parseOperationStationDocument(
      docSnap.id,
      docSnap.data(),
      rid,
    );
    if (parsed) list.push(parsed);
  });
  return sortOperationStations(list);
}

function buildStationPayload(
  restaurantId: string,
  input: OperationStationInput,
  uid: string,
  now: number,
  createdAt?: number,
  createdBy?: string,
): Record<string, unknown> {
  const name = input.name.trim();
  const normalizedName = normalizeOperationStationName(name);
  const printerChannel = readOptionalTrimmed(input.printerChannel);
  const printerName = readOptionalTrimmed(input.printerName);
  return {
    restaurantId: restaurantId.trim(),
    name,
    normalizedName,
    type: input.type,
    active: input.active !== false,
    sortOrder:
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? Math.floor(input.sortOrder)
        : 0,
    ...(printerChannel ? { printerChannel } : {}),
    ...(printerName ? { printerName } : {}),
    createdAt: createdAt ?? now,
    updatedAt: now,
    ...(createdBy ? { createdBy } : { createdBy: uid }),
    updatedBy: uid,
  };
}

/**
 * Crea Cocina / Barra / Coctelería si faltan (ids fijos, idempotente).
 */
export async function ensureDefaultOperationStations(
  restaurantId: string,
): Promise<number> {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) return 0;
  const uid = auth.currentUser?.uid?.trim() ?? "system";
  const now = Date.now();
  let created = 0;

  for (const spec of DEFAULT_OPERATION_STATION_SPECS) {
    const ref = operationStationDocRef(rid, spec.id);
    const snap = await getDoc(ref);
    if (snap.exists()) continue;
    await setDoc(
      ref,
      buildStationPayload(
        rid,
        {
          name: spec.name,
          type: spec.type,
          active: true,
          sortOrder: spec.sortOrder,
        },
        uid,
        now,
      ),
    );
    created += 1;
  }
  return created;
}

export function listenOperationStations(
  restaurantId: string,
  onData: (stations: OperationStationDocument[]) => void,
  onListenError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const q = query(
    operationStationsCollectionRef(rid),
    orderBy("sortOrder", "asc"),
  );

  return onSnapshot(
    q,
    (snap) => {
      const list: OperationStationDocument[] = [];
      snap.forEach((docSnap) => {
        const parsed = parseOperationStationDocument(
          docSnap.id,
          docSnap.data(),
          rid,
        );
        if (parsed) list.push(parsed);
      });
      onData(sortOperationStations(list));
    },
    (error) => {
      onListenError?.(error);
    },
  );
}

export async function createOperationStation(
  restaurantId: string,
  input: OperationStationInput,
): Promise<string> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("MISSING_RESTAURANT_ID");
  const name = input.name.trim();
  if (!name) throw new Error("MISSING_STATION_NAME");
  if (!isOperationStationType(input.type)) throw new Error("INVALID_STATION_TYPE");

  const existing = await fetchAllStations(rid);
  if (isDuplicateOperationStationName(existing, name)) {
    throw new Error("DUPLICATE_STATION_NAME");
  }

  const uid = authUidOrThrow();
  const now = Date.now();
  const maxSort = existing.reduce(
    (m, s) => Math.max(m, s.sortOrder),
    -1,
  );
  const sortOrder =
    typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
      ? Math.floor(input.sortOrder)
      : maxSort + 10;

  const ref = await addDoc(
    operationStationsCollectionRef(rid),
    buildStationPayload(
      rid,
      { ...input, name, sortOrder },
      uid,
      now,
    ),
  );
  return ref.id;
}

export async function updateOperationStation(
  restaurantId: string,
  stationId: string,
  input: Partial<OperationStationInput>,
): Promise<void> {
  const rid = restaurantId.trim();
  const sid = stationId.trim();
  if (!rid || !sid) throw new Error("MISSING_IDS");

  const ref = operationStationDocRef(rid, sid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("STATION_NOT_FOUND");
  const current = parseOperationStationDocument(sid, snap.data(), rid);
  if (!current) throw new Error("STATION_INVALID");

  const nextName =
    typeof input.name === "string" ? input.name.trim() : current.name;
  if (!nextName) throw new Error("MISSING_STATION_NAME");
  const nextType = input.type ?? current.type;
  if (!isOperationStationType(nextType)) throw new Error("INVALID_STATION_TYPE");

  const all = await fetchAllStations(rid);
  if (isDuplicateOperationStationName(all, nextName, sid)) {
    throw new Error("DUPLICATE_STATION_NAME");
  }

  const uid = authUidOrThrow();
  const now = Date.now();
  const patch: Record<string, unknown> = {
    name: nextName,
    normalizedName: normalizeOperationStationName(nextName),
    type: nextType,
    active: input.active !== undefined ? input.active !== false : current.active,
    sortOrder:
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? Math.floor(input.sortOrder)
        : current.sortOrder,
    updatedAt: now,
    updatedBy: uid,
  };
  if (input.printerChannel !== undefined) {
    const ch = readOptionalTrimmed(input.printerChannel);
    patch.printerChannel = ch ? ch : deleteField();
  }
  if (input.printerName !== undefined) {
    const pn = readOptionalTrimmed(input.printerName);
    patch.printerName = pn ? pn : deleteField();
  }

  await updateDoc(ref, patch);
}

export async function disableOperationStation(
  restaurantId: string,
  stationId: string,
): Promise<void> {
  await updateOperationStation(restaurantId, stationId, { active: false });
}

export async function enableOperationStation(
  restaurantId: string,
  stationId: string,
): Promise<void> {
  await updateOperationStation(restaurantId, stationId, { active: true });
}

export async function moveOperationStationOrder(
  restaurantId: string,
  stationId: string,
  direction: "up" | "down",
): Promise<void> {
  const rid = restaurantId.trim();
  const stations = await fetchAllStations(rid);
  const idx = stations.findIndex((s) => s.id === stationId);
  if (idx < 0) throw new Error("STATION_NOT_FOUND");
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= stations.length) return;

  const current = stations[idx]!;
  const neighbor = stations[swapIdx]!;
  await updateOperationStation(rid, current.id, {
    sortOrder: neighbor.sortOrder,
  });
  await updateOperationStation(rid, neighbor.id, {
    sortOrder: current.sortOrder,
  });
}
