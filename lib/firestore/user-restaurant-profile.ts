import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export const DEFAULT_RESTAURANT_NAME = "Mi restaurante";

export type UserRestaurantRole = "owner" | "staff" | "viewer";

/** Rol asignado cuando el perfil no trae `role` válido (denegar elevación por defecto). */
export const DEFAULT_USER_RESTAURANT_ROLE: UserRestaurantRole = "viewer";

export function parseRoleField(v: unknown): UserRestaurantRole | null {
  if (v === "owner" || v === "staff") return v;
  if (v === "admin") return "staff";
  return null;
}

export function canSendRestaurantInvites(role: UserRestaurantRole): boolean {
  return role === "owner";
}

/**
 * Lee `users/{uid}` y, si no hay `restaurantId`, `usuarios/{uid}` (mismo shape de campos).
 * No inventa `restaurantId`: si no viene en ningún doc, devuelve `null`.
 */
export async function loadUserRestaurantContext(uid: string): Promise<{
  restaurantId: string | null;
  restaurantName: string | null;
  role: UserRestaurantRole;
}> {
  let restaurantId: string | null = null;
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
  if (restaurantId == null) {
    const oSnap = await getDoc(doc(db, "usuarios", uid));
    if (oSnap.exists()) {
      apply(oSnap.data() as Record<string, unknown>);
    }
  }

  return { restaurantId, restaurantName, role: role ?? DEFAULT_USER_RESTAURANT_ROLE };
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
