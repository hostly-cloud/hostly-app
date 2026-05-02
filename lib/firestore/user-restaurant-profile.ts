import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export const DEFAULT_RESTAURANT_NAME = "Mi restaurante";

export type UserRestaurantRole = "owner" | "staff";

export function parseRoleField(v: unknown): UserRestaurantRole | null {
  if (v === "owner" || v === "staff") return v;
  if (v === "admin") return "staff";
  return null;
}

export function canSendRestaurantInvites(role: UserRestaurantRole): boolean {
  return role === "owner";
}

/**
 * Lee `users/{uid}` y, si hace falta, `usuarios/{uid}` para `restaurantId` y `restaurantName`.
 */
export async function loadUserRestaurantContext(uid: string): Promise<{
  restaurantId: string;
  restaurantName: string | null;
  role: UserRestaurantRole;
}> {
  let restaurantId = uid;
  let restaurantName: string | null = null;
  let role: UserRestaurantRole | null = null;

  const apply = (d: Record<string, unknown>) => {
    const rid = d.restaurantId;
    if (typeof rid === "string" && rid.trim() !== "") {
      restaurantId = rid.trim();
    }
    const rn = d.restaurantName;
    if (typeof rn === "string" && rn.trim() !== "") {
      restaurantName = rn.trim();
    }
    const pr = parseRoleField(d.role);
    if (pr) role = pr;
  };

  const uSnap = await getDoc(doc(db, "users", uid));
  if (uSnap.exists()) {
    apply(uSnap.data() as Record<string, unknown>);
  }
  if (restaurantName == null) {
    const oSnap = await getDoc(doc(db, "usuarios", uid));
    if (oSnap.exists()) {
      apply(oSnap.data() as Record<string, unknown>);
    }
  }

  return { restaurantId, restaurantName, role: role ?? "owner" };
}

/** Solo lectura: `restaurants/{restaurantId}.name` */
export async function loadRestaurantNameById(
  restaurantId: string,
): Promise<string | null> {
  const snap = await getDoc(doc(db, "restaurants", restaurantId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const name = data.name;
  if (typeof name === "string" && name.trim() !== "") return name.trim();
  return null;
}
