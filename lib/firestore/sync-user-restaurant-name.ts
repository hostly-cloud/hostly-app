import { doc, setDoc } from "firebase/firestore";
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
  await Promise.all([
    setDoc(doc(db, "users", uid), payload, { merge: true }),
    setDoc(doc(db, "usuarios", uid), payload, { merge: true }),
  ]);
}
