export const OPERACION_TPV_PATH = "/dashboard/operacion/tpv";

/** Quita query params del TPV operación sin recargar (p. ej. `tableId` tras cambio de operador). */
export function clearOperacionTpvUrlParams(): void {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (!path.startsWith(OPERACION_TPV_PATH)) return;
  window.history.replaceState(null, "", path);
}
