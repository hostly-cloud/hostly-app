import {
  hasCapability,
  type HostlyCapability,
} from "@/lib/auth/hostly-capabilities";

export function serverRoleHasCapability(
  role: unknown,
  capability: HostlyCapability,
): boolean {
  return hasCapability(role, capability);
}

export function isOwnerOrAdminRole(value: unknown): boolean {
  return serverRoleHasCapability(value, "users.manage");
}
