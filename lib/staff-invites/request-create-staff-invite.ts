import { auth } from "@/lib/firebase/client";
import type { CreateStaffInviteInput, CreateStaffInviteResult } from "@/lib/staff-invites/types";
import type { UsuarioRol } from "@/lib/usuarios-local";

export type RequestCreateStaffInviteResult =
  | { ok: true; invite: CreateStaffInviteResult }
  | { ok: false; error: string; details?: string | null; httpStatus: number };

export async function requestCreateStaffInvite(
  input: CreateStaffInviteInput,
): Promise<RequestCreateStaffInviteResult> {
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      error: "UNAUTHORIZED",
      details: "Inicia sesión para invitar usuarios",
      httpStatus: 401,
    };
  }

  const token = await user.getIdToken();
  const res = await fetch("/api/staff-invites/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      restaurantName: input.restaurantName,
    }),
  });

  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string; details?: string | null; invite?: CreateStaffInviteResult }
    | null;

  if (!res.ok || !payload?.ok || !payload.invite) {
    return {
      ok: false,
      error: payload?.error ?? "INVITE_CREATE_FAILED",
      details: payload?.details ?? null,
      httpStatus: res.status,
    };
  }

  return { ok: true, invite: payload.invite };
}

export type OnboardingStaffInviteRole = UsuarioRol;
