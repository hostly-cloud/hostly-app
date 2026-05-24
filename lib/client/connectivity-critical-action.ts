import type { ConnectivityStatus } from "@/lib/client/connectivity-state";
import {
  type ConnectivityBannerContext,
  isConnectivityBlockingCriticalAction,
} from "@/lib/client/connectivity-state";

const CRITICAL_ACTION_CONFIRM_MESSAGE =
  "Sin conexión estable. La acción podría no sincronizarse. ¿Continuar?";

/** Confirmación suave antes de acciones críticas offline/degraded. No bloquea online/reconnecting ni onboarding. */
export function confirmCriticalActionIfUnstable(
  status: ConnectivityStatus,
  context: ConnectivityBannerContext = "tpv",
): boolean {
  if (context === "onboarding") return true;
  if (status === "online" || status === "reconnecting") {
    return true;
  }
  if (!isConnectivityBlockingCriticalAction(status, context)) {
    return true;
  }
  if (typeof window === "undefined") return false;
  return window.confirm(CRITICAL_ACTION_CONFIRM_MESSAGE);
}
