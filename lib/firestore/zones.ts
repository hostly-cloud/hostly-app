import { FirebaseError } from "firebase/app";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
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
    ...(color !== undefined ? { color } : {}),
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    createdAt: readTsMs(data, "createdAt"),
    updatedAt: readTsMs(data, "updatedAt"),
  };
}

export async function getZones(restaurantId: string): Promise<Zone[]> {
  const rid = restaurantId.trim();
  if (!rid) return [];
  try {
    const col = collection(db, COLLECTION);
    const snap = await getDocs(query(col, where("restaurantId", "==", rid)));
    const list = snap.docs.map(mapDocToZone);
    list.sort((a, b) => a.name.localeCompare(b.name, "es"));
    return list;
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function createZone(
  restaurantId: string,
  name: string,
  color?: string,
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
