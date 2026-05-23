import type { ConnectivityStatus } from "@/lib/client/connectivity-state";

const CRITICAL_ACTION_CONFIRM_MESSAGE =
  "Sin conexión estable. La acción podría no sincronizarse. ¿Continuar?";

/** Confirmación suave antes de acciones críticas offline/degraded. No bloquea online/reconnecting. */
export function confirmCriticalActionIfUnstable(
  status: ConnectivityStatus,
): boolean {
  if (status === "online" || status === "reconnecting") {
    return true;
  }
  if (typeof window === "undefined") return false;
  return window.confirm(CRITICAL_ACTION_CONFIRM_MESSAGE);
}
