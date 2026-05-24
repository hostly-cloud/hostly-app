export type ConnectivityStatus =
  | "online"
  | "offline"
  | "reconnecting"
  | "degraded";

export type ConnectivityState = {
  isOnline: boolean;
  status: ConnectivityStatus;
  lastOnlineAt: number | null;
  lastOfflineAt: number | null;
  lastReconnectAt: number | null;
  lastHeartbeatAt: number | null;
  reconnectAttemptCount: number;
};

export const CONNECTIVITY_RECONNECT_STABILIZE_MS = 2_500;
export const CONNECTIVITY_SUCCESS_FLASH_MS = 3_000;
export const CONNECTIVITY_PING_INTERVAL_MS = 45_000;
export const CONNECTIVITY_PING_TIMEOUT_MS = 5_000;
export const CONNECTIVITY_DEGRADED_AFTER_OFFLINE_MS = 60_000;

export function getInitialConnectivityState(): ConnectivityState {
  const now = Date.now();
  const navigatorOnline =
    typeof navigator !== "undefined" ? navigator.onLine !== false : true;

  return {
    isOnline: navigatorOnline,
    status: navigatorOnline ? "online" : "offline",
    lastOnlineAt: navigatorOnline ? now : null,
    lastOfflineAt: navigatorOnline ? null : now,
    lastReconnectAt: null,
    lastHeartbeatAt: navigatorOnline ? now : null,
    reconnectAttemptCount: 0,
  };
}

export function resolveConnectivityStatus(params: {
  navigatorOnline: boolean;
  isReconnecting: boolean;
  isDegraded: boolean;
}): ConnectivityStatus {
  if (!params.navigatorOnline) return "offline";
  if (params.isReconnecting) return "reconnecting";
  if (params.isDegraded) return "degraded";
  return "online";
}

export function formatConnectivityLabel(status: ConnectivityStatus): string {
  switch (status) {
    case "offline":
      return "Sin conexión";
    case "reconnecting":
      return "Reconectando…";
    case "degraded":
      return "Conexión inestable";
    default:
      return "Conectado";
  }
}

export function shouldShowConnectivityBanner(
  status: ConnectivityStatus,
  showSuccessFlash: boolean,
): boolean {
  return status !== "online" || showSuccessFlash;
}

export type ConnectivityBannerContext = "default" | "onboarding" | "tpv";

export function resolveConnectivityBannerContext(pathname: string | null | undefined): ConnectivityBannerContext {
  const path = pathname ?? "";
  if (path.startsWith("/dashboard/onboarding")) return "onboarding";
  if (path.startsWith("/dashboard/carta")) return "tpv";
  return "default";
}

export function isConnectivityOperationallyRisky(
  status: ConnectivityStatus,
): boolean {
  return status === "offline" || status === "degraded";
}

export function isConnectivityBlockingCriticalAction(
  status: ConnectivityStatus,
  context: ConnectivityBannerContext = "default",
): boolean {
  if (context === "onboarding") return false;
  return isConnectivityOperationallyRisky(status);
}

export function connectivityBannerMessage(
  status: ConnectivityStatus,
  showSuccessFlash: boolean,
  context: ConnectivityBannerContext = "default",
): string | null {
  if (showSuccessFlash && status === "online") {
    return "Conexión restablecida";
  }
  switch (status) {
    case "offline":
      if (context === "onboarding") {
        return "Sin conexión. Puedes seguir editando el catálogo; si falla al guardar, inténtalo de nuevo.";
      }
      return "Sin conexión. Puedes revisar datos cargados, pero algunas acciones pueden no guardarse.";
    case "reconnecting":
      return "Reconectando…";
    case "degraded":
      if (context === "onboarding") {
        return "Conexión inestable. Puedes crear el catálogo; si falla al guardar, inténtalo de nuevo.";
      }
      if (context === "tpv") {
        return "Conexión inestable. Revisa antes de cobrar o enviar comanda.";
      }
      return "Conexión inestable. Algunas acciones pueden tardar más de lo habitual.";
    default:
      return null;
  }
}

export function connectivityBannerTone(
  status: ConnectivityStatus,
  showSuccessFlash: boolean,
): "ice" | "amber" | "success" {
  if (showSuccessFlash && status === "online") return "success";
  if (status === "offline" || status === "degraded") return "amber";
  return "ice";
}
