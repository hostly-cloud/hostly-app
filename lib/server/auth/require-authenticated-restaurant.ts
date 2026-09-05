import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getHostlyAuth, getHostlyFirestore } from "@/lib/firebase/admin";
import {
  AuthorizedProfileError,
  readAuthorizedProfile,
} from "@/lib/server/auth/authorized-profile";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { verifyHostlyAppCheck } from "@/lib/server/security/app-check";

export type AuthenticatedRestaurantContext = {
  uid: string;
  email: string;
  emailVerified: boolean;
  restaurantId: string;
  role: string;
  canManageUsers: boolean;
  db: Firestore;
};

export type AuthTokenVerifier = {
  verifyIdToken(
    token: string,
    checkRevoked?: boolean,
  ): Promise<{
    uid: string;
    email?: string;
    email_verified?: boolean;
  }>;
};

export type AuthenticatedRestaurantDependencies = {
  auth: AuthTokenVerifier;
  db: Firestore;
};

function parseBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export function isAuthErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/**
 * Verifica App Check (cuando el rollout esta activo), ID token Firebase y
 * resuelve restaurantId desde perfil (servidor). No acepta restaurantId del cliente.
 */
export async function requireAuthenticatedRestaurant(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
): Promise<AuthenticatedRestaurantContext | NextResponse> {
  const appCheck = await verifyHostlyAppCheck(req);
  if (appCheck instanceof NextResponse) return appCheck;

  const token = parseBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", details: "Falta token Bearer" },
      { status: 401 },
    );
  }

  const authAdmin = dependencies?.auth ?? getHostlyAuth();
  const db = dependencies?.db ?? getHostlyFirestore();
  if (!authAdmin || !db) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_NOT_CONFIGURED", details: "Firebase Admin no disponible en servidor" },
      { status: 503 },
    );
  }

  let decoded: Awaited<ReturnType<AuthTokenVerifier["verifyIdToken"]>>;
  try {
    decoded = await authAdmin.verifyIdToken(token, true);
  } catch {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", details: "Token inválido o expirado" },
      { status: 401 },
    );
  }

  const uid = decoded.uid?.trim();
  const email = decoded.email?.trim().toLowerCase() ?? "";
  if (!uid || !email) {
    return NextResponse.json(
      { ok: false, error: "AUTH_EMAIL_REQUIRED", details: "El token no contiene email" },
      { status: 403 },
    );
  }

  let profile;
  try {
    profile = await readAuthorizedProfile(db, uid, email);
  } catch (error) {
    if (error instanceof AuthorizedProfileError) {
      return NextResponse.json(
        { ok: false, error: error.code, details: "El perfil requiere revisión administrativa" },
        { status: error.httpStatus },
      );
    }
    throw error;
  }

  return {
    uid,
    email,
    emailVerified: decoded.email_verified === true,
    restaurantId: profile.restaurantId,
    role: profile.rawRole,
    canManageUsers: serverRoleHasCapability(profile.rawRole, "users.manage"),
    db,
  };
}
