import { FirebaseError } from "firebase/app";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type Zone = {
  id: string;
  restaurantId: string;
  name: string;
  floorPlanId?: string;
  color?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  createdAt?: number;
  updatedAt?: number;
};

const COLLECTION = "zones";

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

function mapDocToZone(d: QueryDocumentSnapshot): Zone {
  const data = d.data() as Record<string, unknown>;
  const restaurantId =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const color =
    typeof data.color === "string" && data.color.trim() !== ""
      ? data.color.trim()
      : undefined;
  const floorPlanId =
    typeof data.floorPlanId === "string" && data.floorPlanId.trim() !== ""
      ? data.floorPlanId.trim()
      : undefined;
  const x = typeof data.x === "number" && Number.isFinite(data.x) ? data.x : undefined;
  const y = typeof data.y === "number" && Number.isFinite(data.y) ? data.y : undefined;
  const width =
    typeof data.width === "number" && Number.isFinite(data.width) ? data.width : undefined;
  const height =
    typeof data.height === "number" && Number.isFinite(data.height) ? data.height : undefined;
  return {
    id: d.id,
    restaurantId,
    name,
    ...(floorPlanId !== undefined ? { floorPlanId } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    createdAt: readTsMs(data, "createdAt"),
    updatedAt: readTsMs(data, "updatedAt"),
  };
}

function sortZonesByName(list: Zone[]): Zone[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function getZones(restaurantId: string): Promise<Zone[]> {
  const rid = restaurantId.trim();
  if (!rid) return [];
  try {
    const col = collection(db, COLLECTION);
    const snap = await getDocs(query(col, where("restaurantId", "==", rid)));
    return sortZonesByName(snap.docs.map(mapDocToZone));
  } catch (e) {
    rethrowWithMessage(e);
  }
}

/**
 * Escucha la colección `zones` del restaurante (un listener por tenant).
 * El TPV filtra por plano con `entityBelongsToFloorPlan`.
 */
export function listenZonesByRestaurantId(
  restaurantId: string,
  callback: (zones: Zone[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const rid = restaurantId.trim();
  if (!rid) {
    onError?.(new Error("listenZones: restaurantId obligatorio"));
    callback([]);
    return () => {};
  }

  try {
    const q = query(collection(db, COLLECTION), where("restaurantId", "==", rid));
    return onSnapshot(
      q,
      (snap) => {
        try {
          callback(sortZonesByName(snap.docs.map(mapDocToZone)));
        } catch (e) {
          onError?.(e instanceof Error ? e : new Error(String(e)));
        }
      },
      (error) => {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      },
    );
  } catch (e) {
    onError?.(e instanceof Error ? e : new Error(String(e)));
    return () => {};
  }
}

export async function createZone(
  restaurantId: string,
  name: string,
  color?: string,
  initial?: {
    floorPlanId?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  },
): Promise<string> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("createZone: restaurantId no disponible");
  const n = String(name ?? "").trim();
  if (!n) throw new Error("createZone: nombre vacío");
  const col = collection(db, COLLECTION);
  try {
    const payload: DocumentData = {
      restaurantId: rid,
      name: n,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const c = typeof color === "string" ? color.trim() : "";
    if (c) payload.color = c;
    const floorPlanId =
      typeof initial?.floorPlanId === "string" ? initial.floorPlanId.trim() : "";
    if (floorPlanId) payload.floorPlanId = floorPlanId;
    if (typeof initial?.x === "number" && Number.isFinite(initial.x)) {
      payload.x = Math.round(initial.x);
    }
    if (typeof initial?.y === "number" && Number.isFinite(initial.y)) {
      payload.y = Math.round(initial.y);
    }
    if (typeof initial?.width === "number" && Number.isFinite(initial.width)) {
      payload.width = Math.round(initial.width);
    }
    if (typeof initial?.height === "number" && Number.isFinite(initial.height)) {
      payload.height = Math.round(initial.height);
    }
    const ref = await addDoc(col, payload);
    return ref.id;
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function updateZone(
  zoneId: string,
  updates: {
    name?: string;
    color?: string | null;
    floorPlanId?: string | null;
    x?: number | null;
    y?: number | null;
    width?: number | null;
    height?: number | null;
  },
): Promise<void> {
  const id = String(zoneId ?? "").trim();
  if (!id) throw new Error("updateZone: zoneId no disponible");
  const payload: DocumentData = { updatedAt: serverTimestamp() };
  if (typeof updates.name === "string") {
    const n = updates.name.trim();
    if (!n) throw new Error("updateZone: nombre vacío");
    payload.name = n;
  }
  if (updates.color !== undefined) {
    const c =
      typeof updates.color === "string" ? updates.color.trim() : "";
    payload.color = c ? c : deleteField();
  }
  if (updates.floorPlanId !== undefined) {
    const floorPlanId =
      typeof updates.floorPlanId === "string" ? updates.floorPlanId.trim() : "";
    payload.floorPlanId = floorPlanId ? floorPlanId : deleteField();
  }
  if (updates.x !== undefined) {
    payload.x =
      typeof updates.x === "number" && Number.isFinite(updates.x)
        ? updates.x
        : deleteField();
  }
  if (updates.y !== undefined) {
    payload.y =
      typeof updates.y === "number" && Number.isFinite(updates.y)
        ? updates.y
        : deleteField();
  }
  if (updates.width !== undefined) {
    payload.width =
      typeof updates.width === "number" && Number.isFinite(updates.width)
        ? updates.width
        : deleteField();
  }
  if (updates.height !== undefined) {
    payload.height =
      typeof updates.height === "number" && Number.isFinite(updates.height)
        ? updates.height
        : deleteField();
  }
  try {
    await updateDoc(doc(db, COLLECTION, id), payload);
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function deleteZone(zoneId: string): Promise<void> {
  const id = String(zoneId ?? "").trim();
  if (!id) throw new Error("deleteZone: zoneId no disponible");
  try {
    await deleteDoc(doc(db, COLLECTION, id));
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function countTablesUsingZone(
  restaurantId: string,
  zoneId: string,
  zoneName?: string,
): Promise<number> {
  const rid = restaurantId.trim();
  const id = String(zoneId ?? "").trim();
  if (!rid || !id) return 0;
  try {
    const col = collection(db, "tables");
    const snap = await getDocs(query(col, where("restaurantId", "==", rid)));
    let count = 0;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const tZoneId =
        typeof data.zoneId === "string" ? data.zoneId.trim() : "";
      if (tZoneId === id) {
        count++;
        continue;
      }
      if (zoneName) {
        const tZone = typeof data.zone === "string" ? data.zone.trim() : "";
        const tZoneName =
          typeof data.zoneName === "string" ? data.zoneName.trim() : "";
        if (tZone === zoneName || tZoneName === zoneName) count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}
