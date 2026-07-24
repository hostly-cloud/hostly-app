import { NextResponse } from "next/server";
import { getHostlyAuth, getHostlyFirestore } from "@/lib/firebase/admin";
import {
  bootstrapUserProfile,
  UserProfileBootstrapError,
  type UserProfileBootstrapIntent,
} from "@/lib/server/auth/bootstrap-user-profile";
import { hashInviteToken } from "@/lib/staff-invites/token";
import type {
  AuthenticatedRestaurantDependencies,
  AuthTokenVerifier,
} from "@/lib/server/auth/require-authenticated-restaurant";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

function readIntent(value: unknown): UserProfileBootstrapIntent | null {
  return value === "accept_invite_only" || value === "register_owner"
    ? value
    : null;
}

export async function handleProfileBootstrapRequest(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
) {
  try {
    const token = bearerToken(req);
    if (!token) {
      return jsonError(401, "UNAUTHORIZED", "Falta token Bearer");
    }

    const authAdmin = dependencies?.auth ?? getHostlyAuth();
    const db = dependencies?.db ?? getHostlyFirestore();
    if (!authAdmin || !db) {
      return jsonError(
        503,
        "ADMIN_NOT_CONFIGURED",
        "Firebase Admin no está disponible en el servidor",
      );
    }

    let decoded: Awaited<ReturnType<AuthTokenVerifier["verifyIdToken"]>>;
    try {
      decoded = await authAdmin.verifyIdToken(token, true);
    } catch {
      return jsonError(401, "UNAUTHORIZED", "Token inválido o expirado");
    }
    const email =
      typeof decoded.email === "string" ? decoded.email.trim().toLowerCase() : "";
    if (!decoded.uid || !email) {
      return jsonError(
        403,
        "AUTH_EMAIL_REQUIRED",
        "La cuenta autenticada no contiene un email verificable",
      );
    }
    const body = (await req.json().catch(() => null)) as
      | { intent?: unknown; inviteToken?: unknown }
      | null;
    const intent = readIntent(body?.intent);
    if (!intent) {
      return jsonError(400, "INVALID_INTENT");
    }
    if (intent === "register_owner") {
      return jsonError(
        403,
        "OWNER_SELF_SERVICE_DISABLED",
        "Hostly está en acceso controlado y requiere aprovisionamiento administrativo",
      );
    }
    if (decoded.email_verified !== true) {
      return jsonError(
        403,
        "EMAIL_NOT_VERIFIED",
        "Verifica tu correo antes de aceptar la invitación",
      );
    }
    const inviteToken =
      typeof body?.inviteToken === "string" ? body.inviteToken.trim() : "";
    if (intent === "accept_invite_only" && !inviteToken) {
      return jsonError(400, "INVITE_TOKEN_REQUIRED");
    }
    if (inviteToken.length > 512) {
      return jsonError(400, "INVITE_TOKEN_TOO_LONG");
    }
    const inviteTokenHash = inviteToken ? hashInviteToken(inviteToken) : undefined;

    const result = await bootstrapUserProfile({
      db,
      uid: decoded.uid,
      email,
      emailVerified: decoded.email_verified === true,
      intent,
      inviteTokenHash,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof UserProfileBootstrapError) {
      return jsonError(error.httpStatus, error.code, error.message);
    }
    console.error("[auth/profile-bootstrap]", error);
    return jsonError(500, "PROFILE_BOOTSTRAP_FAILED", "No se pudo preparar el perfil");
  }
}

export async function POST(req: Request) {
  return handleProfileBootstrapRequest(req);
}
