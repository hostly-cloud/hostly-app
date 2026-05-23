const DEVICE_ID_STORAGE_KEY = "hostly_device_id";
const SESSION_ID_STORAGE_KEY = "hostly_runtime_session_id";

export type RuntimeSessionContext = {
  deviceId: string;
  sessionId: string;
  userAgentSummary: string | null;
};

function createSimpleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

export function isRuntimeSessionAvailable(): boolean {
  return typeof window !== "undefined";
}

/** Device estable entre sesiones del navegador (localStorage). */
export function getOrCreateDeviceId(): string {
  if (!isRuntimeSessionAvailable()) return "ssr-device";
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing?.trim()) return existing.trim();
    const next = createSimpleId();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return createSimpleId();
  }
}

/** Sesión por pestaña (sessionStorage) — F5 conserva la misma sesión. */
export function getRuntimeSessionId(): string {
  if (!isRuntimeSessionAvailable()) return "ssr-session";
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_STORAGE_KEY);
    if (existing?.trim()) return existing.trim();
    const next = createSimpleId();
    window.sessionStorage.setItem(SESSION_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return createSimpleId();
  }
}

/** Resumen compacto del user agent para trazabilidad operacional. */
export function getBrowserUserAgentSummary(): string | null {
  if (!isRuntimeSessionAvailable()) return null;
  const ua = navigator.userAgent?.trim();
  if (!ua) return null;

  let platform = "Web";
  if (/iPad|Tablet/i.test(ua)) platform = "Tablet";
  else if (/iPhone|Android.+Mobile|Mobile/i.test(ua)) platform = "Móvil";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";

  return `${platform} · ${browser}`.slice(0, 120);
}

/** Contexto runtime consolidado para presencia, sesiones y activity logs. */
export function getRuntimeSessionContext(): RuntimeSessionContext {
  return {
    deviceId: getOrCreateDeviceId(),
    sessionId: getRuntimeSessionId(),
    userAgentSummary: getBrowserUserAgentSummary(),
  };
}
