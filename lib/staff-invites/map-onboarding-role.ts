import type {
  StaffInviteInputRole,
  StaffInviteRole,
} from "@/lib/staff-invites/types";

export function mapOnboardingRoleToStaffInviteRole(
  role: StaffInviteInputRole,
): StaffInviteRole {
  if (role === "admin") return "admin";
  if (role === "encargado" || role === "manager") return "manager";
  return "waiter";
}

export function normalizeStaffInviteInputRole(
  role: string,
): StaffInviteInputRole | null {
  const normalized = role.trim().toLowerCase();
  switch (normalized) {
    case "admin":
    case "manager":
    case "encargado":
    case "staff":
    case "operativo":
    case "waiter":
    case "camarero":
    case "camarera":
    case "empleado":
    case "employee":
      return normalized;
    default:
      return null;
  }
}
