import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

/**
 * Mantiene `users/{uid}.restaurantName` (y mirror `usuarios/{uid}`) alineado con
 * `restaurants/{restaurantId}.name` tras ediciones de perfil.
 */
export async function syncUserRestaurantName(
  userId: string,
  restaurantName: string,
): Promise<void> {
  const uid = userId.trim();
  const name = restaurantName.trim();
  if (!uid || !name) return;

  const payload = { restaurantName: name };
  const refs = [doc(db, "users", uid), doc(db, "usuarios", uid)] as const;
  const snapshots = await Promise.all(refs.map((ref) => getDoc(ref)));
  await Promise.all(
    snapshots.map((snapshot, index) =>
      snapshot.exists() ? updateDoc(refs[index], payload) : Promise.resolve(),
    ),
  );
}
