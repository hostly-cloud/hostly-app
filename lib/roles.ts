/**
 * Mock local de roles para pruebas manuales fuera del flujo Firebase.
 * No usar en layouts ni gates productivos: la autoridad real es useHostlyCapabilities.
 */

export type UserRole = "admin" | "manager" | "staff";

export const USER_ROLES: readonly UserRole[] = ["admin", "manager", "staff"] as const;

/**
 * Rol por defecto cuando no hay `NEXT_PUBLIC_HOSTLY_MOCK_ROLE`.
 * Solo aplica a utilidades de demo explícitas; nunca en producción.
 */
export const MOCK_USER_ROLE: UserRole = "staff";

function parseRole(value: string | undefined): UserRole | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "admin" || v === "manager" || v === "staff") return v;
  return null;
}

/** Resuelve el rol mock. Requiere `NEXT_PUBLIC_HOSTLY_MOCK_ROLE` explícito. */
export function getCurrentRole(): UserRole {
  const raw = process.env.NEXT_PUBLIC_HOSTLY_MOCK_ROLE;
  const fromEnv = parseRole(typeof raw === "string" ? raw.replace(/^["']|["']$/g, "").trim() : raw);
  return fromEnv ?? MOCK_USER_ROLE;
}

/** Inventario + escandallos en demos locales sin auth Firebase. */
export function canAccessInventoryEscandallos(role: UserRole): boolean {
  return role === "admin" || role === "manager";
}
