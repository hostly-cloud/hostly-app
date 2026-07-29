import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getHostlyAuth, getHostlyFirestore } from "@/lib/firebase/admin";

export type AuthenticatedRestaurantContext = {
  uid: string;
  restaurantId: string;
  db: Firestore;
};

function parseBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

async function readRestaurantIdFromUserProfile(db: Firestore, uid: string): Promise<string | null> {
  for (const collectionName of ["users", "usuarios"] as const) {
    const snap = await db.collection(collectionName).doc(uid).get();
    if (!snap.exists) continue;
    const data = snap.data() as Record<string, unknown> | undefined;
    const rid = data?.restaurantId;
    if (typeof rid === "string" && rid.trim() !== "") {
      return rid.trim();
    }
  }
  return null;
}

export function isAuthErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/**
 * Verifica ID token Firebase y resuelve restaurantId desde perfil (servidor).
 * No acepta restaurantId del cliente.
 */
export async function requireAuthenticatedRestaurant(
  req: Request,
): Promise<AuthenticatedRestaurantContext | NextResponse> {
  const token = parseBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", details: "Falta token Bearer" },
      { status: 401 },
    );
  }

  const authAdmin = getHostlyAuth();
  const db = getHostlyFirestore();
  if (!authAdmin || !db) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_NOT_CONFIGURED", details: "Firebase Admin no disponible en servidor" },
      { status: 503 },
    );
  }

  let uid: string;
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", details: "Token inválido o expirado" },
      { status: 401 },
    );
  }

  const restaurantId = await readRestaurantIdFromUserProfile(db, uid);
  if (!restaurantId) {
    return NextResponse.json(
      { ok: false, error: "NO_RESTAURANT", details: "El usuario no tiene restaurante asignado" },
      { status: 403 },
    );
  }

  return { uid, restaurantId, db };
}
