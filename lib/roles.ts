/**
 * MVP de roles Hostly. Sustituir getCurrentRole() por sesión / Supabase / claims JWT
 * cuando exista auth real (multi-restaurante: añadir tenantId en el contexto de resolución).
 */

export type UserRole = "admin" | "manager" | "staff";

export const USER_ROLES: readonly UserRole[] = ["admin", "manager", "staff"] as const;

/**
 * Rol por defecto cuando no hay `NEXT_PUBLIC_HOSTLY_MOCK_ROLE`.
 * Cámbialo aquí para probar en local (admin | manager | staff).
 */
export const MOCK_USER_ROLE: UserRole = "admin";

function parseRole(value: string | undefined): UserRole | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "admin" || v === "manager" || v === "staff") return v;
  return null;
}

/** Resuelve el rol actual. Hoy: mock + env opcional; mañana: sesión / perfil en Supabase. */
export function getCurrentRole(): UserRole {
  // Si existe la variable de entorno, tiene prioridad sobre MOCK_USER_ROLE (útil en CI / .env.local).
  const raw = process.env.NEXT_PUBLIC_HOSTLY_MOCK_ROLE;
  const fromEnv = parseRole(typeof raw === "string" ? raw.replace(/^["']|["']$/g, "").trim() : raw);
  if (fromEnv) return fromEnv;
  return MOCK_USER_ROLE;
}

/** Inventario + escandallos (lista y detalle): admin y manager sí; staff no. */
export function canAccessInventoryEscandallos(role: UserRole): boolean {
  return role === "admin" || role === "manager";
}
