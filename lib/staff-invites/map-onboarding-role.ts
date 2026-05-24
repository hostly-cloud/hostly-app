import type { UsuarioRol } from "@/lib/usuarios-local";
import type { StaffInviteRole } from "@/lib/staff-invites/types";

export function mapOnboardingRoleToStaffInviteRole(role: string): StaffInviteRole {
  if (role === "owner" || role === "admin") return "owner";
  return "staff";
}

export function normalizeStaffInviteInputRole(role: string): UsuarioRol | StaffInviteRole {
  if (role === "owner" || role === "staff") return role;
  if (role === "admin" || role === "encargado" || role === "operativo") return role;
  return "operativo";
}
