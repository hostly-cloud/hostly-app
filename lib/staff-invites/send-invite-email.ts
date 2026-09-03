import type { CreateStaffInviteResult } from "@/lib/staff-invites/types";

export type SendInviteEmailInput = {
  to: string;
  displayName?: string;
  inviteUrl: string;
  restaurantName?: string;
};

/**
 * TODO: conectar Resend / SendGrid / Firebase Extension para envío real.
 * Fase 1: no-op controlado — la invitación ya existe en Firestore y el link se copia en UI.
 */
export async function sendInviteEmail(input: SendInviteEmailInput): Promise<void> {
  void input;
  return;
}

export async function sendInviteEmailFromResult(
  invite: Pick<CreateStaffInviteResult, "email" | "displayName" | "inviteUrl">,
  restaurantName?: string,
): Promise<void> {
  await sendInviteEmail({
    to: invite.email,
    displayName: invite.displayName,
    inviteUrl: invite.inviteUrl,
    restaurantName,
  });
}
