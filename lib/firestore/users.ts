import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

export const getUsersByRestaurant = async (restaurantId: string) => {
  if (!auth.currentUser) return [];
  const rid = restaurantId.trim();
  if (!rid) return [];

  const uid = auth.currentUser.uid;

  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return [];
    const data = snap.data();
    const docRid =
      typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
    if (docRid !== rid) return [];
    return [{ id: snap.id, ...data }];
  } catch {
    return [];
  }
};

export const removeUserFromRestaurant = async (userId: string) => {  const ref = doc(db, "users", userId);
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
