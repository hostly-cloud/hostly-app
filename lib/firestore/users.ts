import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export const getUsersByRestaurant = async (restaurantId: string) => {
  const q = query(
    collection(db, "users"),
    where("restaurantId", "==", restaurantId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const removeUserFromRestaurant = async (userId: string) => {
  const ref = doc(db, "users", userId);
  await updateDoc(ref, {
    restaurantId: null,
    role: null,
  });
};

export const updateUserRole = async (
  userId: string,
  newRole: "owner" | "staff",
) => {
  const ref = doc(db, "users", userId);
  await updateDoc(ref, { role: newRole });
};
