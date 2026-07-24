import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  evaluateProfileAuthorization,
  normalizeAuthorizationRole,
  type CanonicalHostlyRole,
  type ProfileAuthorizationIssue,
} from "@/lib/auth/profile-authorization-policy";

export const DEFAULT_RESTAURANT_NAME = "Mi restaurante";

export type UserRestaurantRole = CanonicalHostlyRole;

/** Rol asignado cuando el perfil no trae `role` válido (denegar elevación por defecto). */
export const DEFAULT_USER_RESTAURANT_ROLE: UserRestaurantRole = "viewer";

export function parseRoleField(v: unknown): UserRestaurantRole | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return normalizeAuthorizationRole(v);
}

export function canSendRestaurantInvites(role: UserRestaurantRole): boolean {
  return role === "owner" || role === "admin";
}

export class UserProfileAccessError extends Error {
  constructor(readonly code: ProfileAuthorizationIssue) {
    super(code);
    this.name = "UserProfileAccessError";
  }
}

/**
 * `users/{uid}` es la autoridad. `usuarios/{uid}` solo valida coherencia;
 * nunca aporta tenant, rol ni status ausentes al perfil canónico.
 */
export async function loadUserRestaurantContext(
  uid: string,
  email?: string | null,
): Promise<{
  restaurantId: string | null;
  restaurantName: string | null;
  role: UserRestaurantRole;
}> {
  const [canonicalSnapshot, mirrorSnapshot] = await Promise.all([
    getDoc(doc(db, "users", uid)),
    getDoc(doc(db, "usuarios", uid)),
  ]);
  const result = evaluateProfileAuthorization({
    uid,
    email,
    canonical: canonicalSnapshot.exists()
      ? (canonicalSnapshot.data() as Record<string, unknown>)
      : null,
    mirror: mirrorSnapshot.exists()
      ? (mirrorSnapshot.data() as Record<string, unknown>)
      : null,
  });
  if (!result.ok) throw new UserProfileAccessError(result.issue);
  return {
    restaurantId: result.profile.restaurantId,
    restaurantName: result.profile.restaurantName,
    role: result.profile.role,
  };
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
