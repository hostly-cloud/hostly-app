import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  parseRoleField,
  type UserRestaurantRole,
} from "@/lib/firestore/user-restaurant-profile";

export type Usuario = {
  uid: string;
  email: string;
  restaurantId: string;
  restaurantName?: string;
  role?: UserRestaurantRole;
};

export async function getUsuario(uid: string): Promise<Usuario | null> {
  const snap = await getDoc(doc(db, "usuarios", uid));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const email =
    typeof data.email === "string" ? data.email : "";
  const restaurantId =
    typeof data.restaurantId === "string" ? data.restaurantId : uid;
  const restaurantNameRaw = data.restaurantName;
  const restaurantName =
    typeof restaurantNameRaw === "string" && restaurantNameRaw.trim() !== ""
      ? restaurantNameRaw.trim()
      : undefined;
  const role = parseRoleField(data.role) ?? undefined;
  return {
    uid,
    email,
    restaurantId,
    restaurantName,
    role,
  };
}
