import type { UsuarioRol } from "@/lib/usuarios-local";

export type StaffInviteStatus = "pending" | "accepted" | "expired" | "cancelled";

export type StaffInviteRole = "owner" | "staff";

export type CreateStaffInviteInput = {
  email: string;
  displayName?: string;
  /** Rol del onboarding (`admin` | `encargado` | `operativo`). */
  role: UsuarioRol | StaffInviteRole;
  restaurantName?: string;
};

export type CreateStaffInviteResult = {
  inviteId: string;
  status: StaffInviteStatus;
  inviteUrl: string;
  email: string;
  displayName?: string;
  role: StaffInviteRole;
  staffRole: UsuarioRol | StaffInviteRole;
  reused: boolean;
  expiresAt: string;
};
