/**
 * Compatibilidad de lectura para diagnósticos locales.
 *
 * Las mutaciones y consultas productivas de invitaciones son exclusivamente
 * server-side bajo `/api/staff-invites/*`.
 */
export function normalizeInviteEmail(email: string): string {
  return String(email).trim().toLowerCase();
}
