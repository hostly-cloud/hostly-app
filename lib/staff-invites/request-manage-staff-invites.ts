import { auth } from "@/lib/firebase/client";

export type ManagedStaffInvite = {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin" | "staff";
  status: "pending";
  expiresAt: string | null;
};

export class StaffInviteRequestError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number) {
    super(code);
    this.name = "StaffInviteRequestError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

async function authorizationHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new StaffInviteRequestError("UNAUTHORIZED", 401);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}

export async function requestPendingStaffInvites(): Promise<
  ManagedStaffInvite[]
> {
  const response = await fetch("/api/staff-invites/manage", {
    headers: await authorizationHeader(),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; invites?: ManagedStaffInvite[] }
    | null;
  if (!response.ok || !payload?.ok || !Array.isArray(payload.invites)) {
    throw new StaffInviteRequestError(
      payload?.error || "INVITE_LIST_FAILED",
      response.status,
    );
  }
  return payload.invites;
}

export async function requestRevokeStaffInvite(
  inviteId: string,
): Promise<void> {
  const response = await fetch("/api/staff-invites/manage", {
    method: "DELETE",
    headers: await authorizationHeader(),
    body: JSON.stringify({ inviteId }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;
  if (!response.ok || !payload?.ok) {
    throw new StaffInviteRequestError(
      payload?.error || "INVITE_REVOKE_FAILED",
      response.status,
    );
  }
}
