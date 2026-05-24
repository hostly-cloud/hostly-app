export function normalizeStaffInviteEmail(email: string): string {
  return String(email).trim().toLowerCase();
}

export function isValidStaffInviteEmail(email: string): boolean {
  const normalized = normalizeStaffInviteEmail(email);
  if (normalized.length < 5) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}
