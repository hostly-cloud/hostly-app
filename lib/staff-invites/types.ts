import type { UsuarioRol } from "@/lib/usuarios-local";

export type StaffInviteStatus = "pending" | "accepted" | "expired" | "cancelled";

export type StaffInviteRole = "admin" | "manager" | "waiter";
export type StaffInviteInputRole =
  | UsuarioRol
  | StaffInviteRole
  | "staff"
  | "camarero"
  | "camarera"
  | "empleado"
  | "employee";

export type CreateStaffInviteInput = {
  email: string;
  displayName?: string;
  /** Rol del onboarding (`admin` | `encargado` | `operativo`). */
  role: StaffInviteInputRole;
  restaurantName?: string;
};

export type CreateStaffInviteResult = {
  inviteId: string;
  status: StaffInviteStatus;
  inviteUrl: string;
  email: string;
  displayName?: string;
  role: StaffInviteRole;
  staffRole: StaffInviteInputRole;
  reused: boolean;
  expiresAt: string;
};
