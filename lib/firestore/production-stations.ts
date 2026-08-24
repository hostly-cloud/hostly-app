import {
  addDoc,
  collection,
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
import type { OperationStationType } from "@/lib/operacion/operation-station-types";
import {
  isProductionStationType,
  normalizeProductionStationColor,
  normalizeProductionStationName,
  sortProductionStations,
  type ProductionStationDocument,
  type ProductionStationInput,
  type ProductionStationType,
} from "@/lib/produccion/production-station-types";

export function productionStationsCollectionRef(restaurantId: string) {
  const rid = restaurantId.trim();
  return collection(db, "restaurants", rid, "productionStations");
}

export function productionStationDocRef(restaurantId: string, stationId: string) {
  return doc(productionStationsCollectionRef(restaurantId), stationId.trim());
}

function authUidOrThrow(): string {
  const uid = auth.currentUser?.uid?.trim();
  if (!uid) throw new Error("UNAUTHORIZED");
  return uid;
}

export function parseProductionStationDocument(
  stationId: string,
  raw: unknown,
  restaurantId: string,
): ProductionStationDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const rid =
    typeof data.restaurantId === "string"
      ? data.restaurantId.trim()
      : restaurantId.trim();
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) return null;
  const type = data.type;
  if (!isProductionStationType(type)) return null;
  const createdAt =
    typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
      ? data.createdAt
      : Date.now();
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : createdAt;

  return {
    id: stationId,
    restaurantId: rid,
    name,
    normalizedName:
      typeof data.normalizedName === "string" && data.normalizedName.trim()
        ? data.normalizedName.trim()
        : normalizeProductionStationName(name),
    type,
    color: normalizeProductionStationColor(data.color),
    active: data.active !== false,
    createdAt,
    updatedAt,
  };
}

export function isDuplicateProductionStationName(
  stations: ProductionStationDocument[],
  name: string,
  excludeId?: string,
): boolean {
  const norm = normalizeProductionStationName(name);
  if (!norm) return false;
  const alt = normalizeProductName(name);
  return stations.some((s) => {
    if (excludeId && s.id === excludeId) return false;
    return (
      s.normalizedName === norm ||
      normalizeProductionStationName(s.name) === norm ||
      normalizeProductName(s.name) === alt
    );
  });
}

function buildPayload(
  restaurantId: string,
  input: ProductionStationInput,
  now: number,
  createdAt?: number,
): Record<string, unknown> {
  const name = input.name.trim();
  return {
    restaurantId: restaurantId.trim(),
    name,
    normalizedName: normalizeProductionStationName(name),
    type: input.type,
    color: normalizeProductionStationColor(input.color),
    active: input.active !== false,
    createdAt: createdAt ?? now,
    updatedAt: now,
  };
}

export async function listProductionStations(
  restaurantId: string,
): Promise<ProductionStationDocument[]> {
  if (!isAuthReady()) return [];
  const rid = restaurantId.trim();
  const snap = await getDocs(
    query(productionStationsCollectionRef(rid), orderBy("name", "asc")),
  );
  const list: ProductionStationDocument[] = [];
  snap.forEach((docSnap) => {
    const parsed = parseProductionStationDocument(docSnap.id, docSnap.data(), rid);
    if (parsed) list.push(parsed);
  });
  return sortProductionStations(list);
}

export function listenProductionStations(
  restaurantId: string,
  onData: (stations: ProductionStationDocument[]) => void,
  onListenError?: (error: unknown) => void,
): Unsubscribe {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady()) {
    onData([]);
    return () => {};
  }

  const q = query(productionStationsCollectionRef(rid), orderBy("name", "asc"));

  return onSnapshot(
    q,
    (snap) => {
      const list: ProductionStationDocument[] = [];
      snap.forEach((docSnap) => {
        const parsed = parseProductionStationDocument(docSnap.id, docSnap.data(), rid);
        if (parsed) list.push(parsed);
      });
      onData(sortProductionStations(list));
    },
    (err) => {
      console.error("listenProductionStations", err);
      onListenError?.(err);
    },
  );
}

export async function createProductionStation(
  restaurantId: string,
  input: ProductionStationInput,
): Promise<ProductionStationDocument> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("MISSING_RESTAURANT_ID");
  authUidOrThrow();
  const name = input.name.trim();
  if (!name) throw new Error("MISSING_NAME");
  if (!isProductionStationType(input.type)) throw new Error("INVALID_TYPE");

  const existing = await listProductionStations(rid);
  if (isDuplicateProductionStationName(existing, name)) {
    throw new Error("DUPLICATE_STATION_NAME");
  }

  const now = Date.now();
  const ref = await addDoc(
    productionStationsCollectionRef(rid),
    buildPayload(rid, input, now),
  );
  const parsed = parseProductionStationDocument(
    ref.id,
    buildPayload(rid, input, now),
    rid,
  );
  if (!parsed) throw new Error("CREATE_FAILED");
  return parsed;
}

export async function updateProductionStation(
  restaurantId: string,
  stationId: string,
  input: Partial<ProductionStationInput>,
): Promise<void> {
  const rid = restaurantId.trim();
  const sid = stationId.trim();
  if (!rid || !sid) throw new Error("MISSING_ID");
  authUidOrThrow();

  const existing = await listProductionStations(rid);
  const cur = existing.find((s) => s.id === sid);
  if (!cur) throw new Error("NOT_FOUND");

  const nextName = input.name != null ? input.name.trim() : cur.name;
  if (!nextName) throw new Error("MISSING_NAME");
  const nextType: ProductionStationType = input.type ?? cur.type;
  if (!isProductionStationType(nextType)) throw new Error("INVALID_TYPE");

  if (isDuplicateProductionStationName(existing, nextName, sid)) {
    throw new Error("DUPLICATE_STATION_NAME");
  }

  const now = Date.now();
  const patch: Record<string, unknown> = {
    name: nextName,
    normalizedName: normalizeProductionStationName(nextName),
    type: nextType,
    color: normalizeProductionStationColor(input.color ?? cur.color),
    active: input.active != null ? Boolean(input.active) : cur.active,
    updatedAt: now,
  };

  await updateDoc(productionStationDocRef(rid, sid), patch);
}

export async function setProductionStationActive(
  restaurantId: string,
  stationId: string,
  active: boolean,
): Promise<void> {
  const rid = restaurantId.trim();
  const sid = stationId.trim();
  if (!rid || !sid) throw new Error("MISSING_ID");
  authUidOrThrow();
  await updateDoc(productionStationDocRef(rid, sid), {
    active,
    updatedAt: Date.now(),
  });
}

function operationTypeToProductionType(
  type: OperationStationType,
): ProductionStationType {
  if (type === "kitchen") return "cocina";
  if (type === "bar") return "barra";
  if (type === "cocktail") return "cocteleria";
  return "otro";
}

/**
 * Sombra de compatibilidad mientras Familias de menú termina de migrar a
 * `operationStations`. Mantiene el mismo id; la fuente canónica sigue siendo
 * `operationStations` y este documento puede retirarse cuando no queden lectores legacy.
 */
export async function syncProductionStationShadowFromOperationStation(
  restaurantId: string,
  station: {
    id: string;
    name: string;
    type: OperationStationType;
    color?: string;
    active: boolean;
  },
): Promise<void> {
  const rid = restaurantId.trim();
  const sid = station.id.trim();
  if (!rid || !sid) return;
  authUidOrThrow();
  const ref = productionStationDocRef(rid, sid);
  const current = await getDoc(ref);
  const now = Date.now();
  const createdAt = current.exists()
    ? parseProductionStationDocument(sid, current.data(), rid)?.createdAt ?? now
    : now;
  await setDoc(
    ref,
    buildPayload(
      rid,
      {
        name: station.name,
        type: operationTypeToProductionType(station.type),
        color: station.color,
        active: station.active,
      },
      now,
      createdAt,
    ),
    { merge: true },
  );
}
