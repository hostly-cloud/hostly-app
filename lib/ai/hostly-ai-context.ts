import type { Firestore } from "firebase-admin/firestore";
import { getHostlyAuth, getHostlyFirestore } from "@/lib/firebase/admin";
import { assertServerRestauranteAllowed } from "@/lib/hostly/restaurant-scope";

export type HostlyAiTenantContext =
  | {
      ok: true;
      uid: string;
      restaurantId: string;
      db: Firestore;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

function extractBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h?.trim()) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  const t = m?.[1]?.trim();
  return t || null;
}

/**
 * Lee users/{uid} y usuarios/{uid} (misma convención que `loadUserRestaurantContext` en cliente).
 */
async function loadRestaurantIdForUid(
  db: Firestore,
  uid: string,
): Promise<string | null> {
  let restaurantId: string | null = null;

  const apply = (d: Record<string, unknown>) => {
    const rid = d.restaurantId;
    if (typeof rid === "string" && rid.trim() !== "") {
      restaurantId = rid.trim();
    }
  };

  const uSnap = await db.collection("users").doc(uid).get();
  if (uSnap.exists) {
    apply(uSnap.data() as Record<string, unknown>);
  }
  if (restaurantId == null) {
    const oSnap = await db.collection("usuarios").doc(uid).get();
    if (oSnap.exists) {
      apply(oSnap.data() as Record<string, unknown>);
    }
  }

  return restaurantId;
}

/**
 * Valida identidad (Firebase ID token) y resuelve tenant (restaurantId) solo desde Firestore de perfil.
 * No acepta restaurantId del cliente como fuente de verdad.
 */
export async function resolveHostlyAiTenant(req: Request): Promise<HostlyAiTenantContext> {
  const token = extractBearerToken(req);
  if (!token) {
    return { ok: false, error: "MISSING_BEARER_TOKEN", status: 401 };
  }

  const auth = getHostlyAuth();
  const db = getHostlyFirestore();
  if (!auth || !db) {
    return { ok: false, error: "FIREBASE_ADMIN_NOT_CONFIGURED", status: 501 };
  }

  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return { ok: false, error: "INVALID_AUTH_TOKEN", status: 401 };
  }

  let restaurantId: string | null;
  try {
    restaurantId = await loadRestaurantIdForUid(db, uid);
  } catch {
    return { ok: false, error: "PROFILE_READ_FAILED", status: 500 };
  }

  if (!restaurantId) {
    return { ok: false, error: "NO_RESTAURANT_ASSIGNED", status: 403 };
  }

  try {
    assertServerRestauranteAllowed(restaurantId);
  } catch {
    return { ok: false, error: "HOSTLY_RESTAURANTE_NOT_ALLOWED", status: 403 };
  }

  return { ok: true, uid, restaurantId, db };
}
