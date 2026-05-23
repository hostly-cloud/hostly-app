/**
 * Alcance multi-restaurante (MVP).
 * Sustituir por claims de auth cuando exista sesión real.
 */

const STORAGE_KEY = "hostly.restauranteId";

/**
 * ID operativo del tenant: perfil autenticado primero, luego navegador.
 * TPV, productos y CRUD central deben usar el mismo valor.
 */
export function resolveOperationalRestaurantId(
  profileRestaurantId?: string | null,
): string {
  const fromProfile =
    typeof profileRestaurantId === "string" ? profileRestaurantId.trim() : "";
  return fromProfile || getBrowserRestauranteId();
}

/** ID de restaurante en el navegador (localStorage → env público → default). */
export function getBrowserRestauranteId(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_HOSTLY_RESTAURANTE_ID?.trim() || "default";
  }
  try {
    const fromStore = window.localStorage.getItem(STORAGE_KEY)?.trim();
    if (fromStore) return fromStore;
  } catch {
    /* noop */
  }
  return process.env.NEXT_PUBLIC_HOSTLY_RESTAURANTE_ID?.trim() || "default";
}

/**
 * Valida que el restaurante solicitado coincida con el permitido en servidor (si está definido).
 * Evita que un cliente envíe otro restauranteId hasta tener auth.
 */
export function assertServerRestauranteAllowed(restauranteId: string): void {
  const locked = process.env.HOSTLY_SERVER_RESTAURANTE_ID?.trim();
  if (!locked) return;
  if (restauranteId !== locked) {
    throw new Error("HOSTLY_RESTAURANTE_NOT_ALLOWED");
  }
}
