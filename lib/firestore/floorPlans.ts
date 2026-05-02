import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type FloorPlan = {
  id: string;
  restaurantId: string;
  name: string;
  sortOrder?: number;
  isDefault?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

const COLLECTION = "floorPlans";

function rethrowWithMessage(e: unknown): never {
  if (e instanceof FirebaseError) {
    throw new Error(`${e.code}: ${e.message}`);
  }
  if (e instanceof Error) throw e;
  throw new Error(String(e));
}

function mapDocToFloorPlan(d: QueryDocumentSnapshot): FloorPlan {
  const data = d.data() as Record<string, unknown>;
  const restaurantId =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const sortOrder =
    typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
      ? data.sortOrder
      : undefined;
  const isDefault =
    typeof data.isDefault === "boolean" ? data.isDefault : undefined;
  const createdAt =
    typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
      ? data.createdAt
      : undefined;
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : undefined;
  return {
    id: d.id,
    restaurantId,
    name,
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    ...(isDefault !== undefined ? { isDefault } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

export async function createFloorPlan(
  restaurantId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const rid = restaurantId.trim();
  const n = String(name ?? "").trim();
  if (!rid) throw new Error("createFloorPlan: restaurantId no disponible");
  if (!n) throw new Error("createFloorPlan: nombre vacío");
  try {
    const docRef = await addDoc(collection(db, COLLECTION), {
      restaurantId: rid,
      name: n,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as DocumentData);
    return { id: docRef.id, name: n };
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function getFloorPlans(restaurantId: string): Promise<FloorPlan[]> {
  const rid = restaurantId.trim();
  if (!rid) return [];
  try {
    const col = collection(db, COLLECTION);
    const snap = await getDocs(query(col, where("restaurantId", "==", rid)));
    const list = snap.docs.map(mapDocToFloorPlan);
    list.sort((a, b) => {
      const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name, "es");
    });
    return list;
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function createDefaultFloorPlanIfNeeded(
  restaurantId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  if (!rid) return;
  try {
    const existing = await getFloorPlans(rid);
    if (existing.length > 0) return;
    await addDoc(collection(db, COLLECTION), {
      restaurantId: rid,
      name: "Principal",
      isDefault: true,
      sortOrder: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as DocumentData);
  } catch (e) {
    rethrowWithMessage(e);
  }
}
