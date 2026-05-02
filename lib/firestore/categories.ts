import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type Category = {
  id: string;
  name: string;
  restaurantId: string;
  order: number;
  createdAt?: number;
};

export const UNAUTHORIZED_CATEGORY_ACCESS = "UNAUTHORIZED_CATEGORY_ACCESS";

function rethrowWithMessage(e: unknown): never {
  if (e instanceof FirebaseError) {
    throw new Error(`${e.code}: ${e.message}`);
  }
  if (e instanceof Error) throw e;
  throw new Error(String(e));
}

function readCreatedAtMs(data: Record<string, unknown>): number | undefined {
  const c = data.createdAt;
  if (typeof c === "number" && Number.isFinite(c)) return c;
  if (c instanceof Timestamp) return c.toMillis();
  return undefined;
}

function assertCategoryTenant(
  data: Record<string, unknown>,
  activeRestaurantId: string,
): void {
  const rid = activeRestaurantId.trim();
  const docRid =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  if (docRid !== "" && docRid === rid) return;
  throw new Error(UNAUTHORIZED_CATEGORY_ACCESS);
}

function readOrder(data: Record<string, unknown>): number {
  const o = data.order;
  if (typeof o === "number" && Number.isFinite(o)) return o;
  return 0;
}

function mapDocToCategory(d: QueryDocumentSnapshot): Category {
  const data = d.data() as Record<string, unknown>;
  const nameRaw = data.name;
  const name =
    nameRaw !== undefined && nameRaw !== null && String(nameRaw).trim() !== ""
      ? String(nameRaw).trim()
      : "";
  const restaurantIdRaw = data.restaurantId;
  const restaurantId =
    typeof restaurantIdRaw === "string" && restaurantIdRaw.trim() !== ""
      ? restaurantIdRaw.trim()
      : "";
  return {
    id: d.id,
    name,
    restaurantId,
    order: readOrder(data),
    createdAt: readCreatedAtMs(data),
  };
}

export async function getCategories(restaurantId: string): Promise<Category[]> {
  if (!restaurantId.trim()) return [];
  const rid = restaurantId.trim();
  const col = collection(db, "categories");
  const snap = await getDocs(query(col, where("restaurantId", "==", rid)));
  const list = snap.docs.map(mapDocToCategory);
  list.sort((a, b) => a.order - b.order);

  const hasDefault = list.some((c) => c.name === "Sin categoría");
  if (!hasDefault) {
    list.unshift({
      id: "default",
      name: "Sin categoría",
      restaurantId: rid,
      order: -1,
    });
  }

  return list;
}

export async function addCategory(
  name: string,
  restaurantId: string,
): Promise<void> {
  const rid = restaurantId.trim();
  if (!rid) {
    throw new Error("addCategory: restaurantId no disponible");
  }
  const n = String(name ?? "").trim();
  if (!n) {
    throw new Error("addCategory: nombre vacío");
  }
  try {
    await addDoc(collection(db, "categories"), {
      name: n,
      restaurantId: rid,
      order: Date.now(),
      createdAt: serverTimestamp(),
    } as DocumentData);
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export const updateCategoryOrder = async (id: string, newOrder: number) => {
  const ref = doc(db, "categories", id);
  await updateDoc(ref, { order: newOrder });
};

export const updateCategoryName = async (
  id: string,
  restaurantId: string,
  newName: string,
) => {
  const ref = doc(db, "categories", id);
  await updateDoc(ref, {
    name: newName.trim(),
  });
};

export async function deleteCategory(
  id: string,
  restaurantId: string,
): Promise<void> {
  if (!restaurantId.trim()) {
    throw new Error("deleteCategory: restaurantId no disponible");
  }
  const rid = restaurantId.trim();
  const ref = doc(db, "categories", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Categoría no encontrada");
  const existing = snap.data() as Record<string, unknown>;
  assertCategoryTenant(existing, rid);
  try {
    await deleteDoc(ref);
  } catch (e) {
    rethrowWithMessage(e);
  }
}
