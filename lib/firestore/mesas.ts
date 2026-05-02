import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Mesa } from "@/types/mesa";

const MESAS_COLLECTION = "mesas";

export const createMesa = async (
  mesa: Omit<Mesa, "id" | "createdAt" | "updatedAt">,
): Promise<string> => {
  const now = Date.now();

  const docRef = await addDoc(collection(db, MESAS_COLLECTION), {
    ...mesa,
    createdAt: now,
    updatedAt: now,
  });

  return docRef.id;
};

export const getMesasByRestaurant = async (restaurantId: string): Promise<Mesa[]> => {
  const q = query(collection(db, MESAS_COLLECTION), where("restaurantId", "==", restaurantId));

  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Mesa, "id">),
  }));
};

export const updateMesa = async (id: string, data: Partial<Mesa>): Promise<void> => {
  const ref = doc(db, MESAS_COLLECTION, id);
  const { id: _omitId, createdAt: _omitCreatedAt, ...rest } = data;
  void _omitId;
  void _omitCreatedAt;

  await updateDoc(ref, {
    ...rest,
    updatedAt: Date.now(),
  });
};

export const deleteMesa = async (id: string): Promise<void> => {
  const ref = doc(db, MESAS_COLLECTION, id);
  await deleteDoc(ref);
};

export const seedMesas = async (restaurantId: string): Promise<void> => {
  const now = Date.now();

  const mesasBase = [
    { name: "Mesa 1", zone: "Interior", capacity: 2 },
    { name: "Mesa 2", zone: "Interior", capacity: 4 },
    { name: "Mesa 3", zone: "Interior", capacity: 4 },
    { name: "Mesa 4", zone: "Terraza", capacity: 2 },
    { name: "Mesa 5", zone: "Terraza", capacity: 4 },
    { name: "Mesa 6", zone: "Barra", capacity: 2 },
  ];

  const promises = mesasBase.map((m) =>
    addDoc(collection(db, MESAS_COLLECTION), {
      ...m,
      restaurantId,
      status: "free",
      createdAt: now,
      updatedAt: now,
    }),
  );

  await Promise.all(promises);
};
