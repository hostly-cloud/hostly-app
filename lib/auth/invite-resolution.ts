import type { User } from "firebase/auth";

type ProfileBootstrapIntent = "accept_invite_only";

type ProfileBootstrapResult = {
  restaurantId: string | null;
    source: "existing" | "invite";
};

type ProfileBootstrapResponse = {
  ok?: boolean;
  error?: string;
  details?: string | null;
  result?: ProfileBootstrapResult;
};

export class ProfileBootstrapClientError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "ProfileBootstrapClientError";
  }

  get safeToRollbackAuth(): boolean {
    return this.httpStatus >= 400 && this.httpStatus < 500;
  }
}

/**
 * Delega en servidor la asignación de tenant y rol. El cliente nunca escribe
 * campos de autorización en `users` ni `usuarios`.
 */
export async function bootstrapAuthenticatedUserProfile(
  user: User,
  intent: ProfileBootstrapIntent,
  inviteToken?: string,
): Promise<ProfileBootstrapResult> {
  if (!user.email) throw new Error("NO_AUTH_EMAIL");
  const token = await user.getIdToken();
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      intent,
      ...(inviteToken?.trim() ? { inviteToken: inviteToken.trim() } : {}),
    }),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch("/api/auth/profile-bootstrap", requestInit);
    } catch (error) {
      if (attempt === 0) continue;
      throw error;
    }
    const payload = (await response.json().catch(() => null)) as
      | ProfileBootstrapResponse
      | null;
    if (response.ok && payload?.ok && payload.result) {
      return payload.result;
    }
    if (response.status >= 500 && attempt === 0) continue;
    throw new ProfileBootstrapClientError(
      payload?.error || "PROFILE_BOOTSTRAP_FAILED",
      response.status,
      payload?.details || payload?.error || "PROFILE_BOOTSTRAP_FAILED",
    );
  }
  throw new Error("PROFILE_BOOTSTRAP_RETRY_EXHAUSTED");
}

export async function applyPendingInviteForUser(
  user: User,
  inviteToken?: string,
): Promise<boolean> {
  if (!inviteToken?.trim()) return false;
  const result = await bootstrapAuthenticatedUserProfile(
    user,
    "accept_invite_only",
    inviteToken,
  );
  return result?.source === "invite" || result?.source === "existing";
}
