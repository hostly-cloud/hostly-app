import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getHostlyAuth, getHostlyFirestore } from "@/lib/firebase/admin";
import { isAuthErrorResponse } from "@/lib/server/auth/require-authenticated-restaurant";
import {
  AuthorizedProfileError,
  readAuthorizedProfile,
} from "@/lib/server/auth/authorized-profile";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";

export type AuthorizedTpvRestaurantContext = {
  uid: string;
  email: string;
  emailVerified: boolean;
  restaurantId: string;
  role: string;
  canManageUsers: boolean;
  db: Firestore;
};

export type TpvAuthTokenVerifier = {
  verifyIdToken(
    token: string,
    checkRevoked?: boolean,
  ): Promise<{
    uid: string;
    email?: string;
    email_verified?: boolean;
  }>;
};

export type AuthorizedTpvRestaurantDependencies = {
  auth: TpvAuthTokenVerifier;
  db: Firestore;
};

function parseBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export { isAuthErrorResponse };

/**
 * Auth estricta exclusiva de rutas TPV: token revocado, email obligatorio,
 * perfil canónico + mirror, tenant activo y rol resuelto server-side.
 */
export async function requireAuthorizedTpvRestaurant(
  req: Request,
  dependencies?: AuthorizedTpvRestaurantDependencies,
): Promise<AuthorizedTpvRestaurantContext | NextResponse> {
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

  let decoded: Awaited<ReturnType<TpvAuthTokenVerifier["verifyIdToken"]>>;
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
