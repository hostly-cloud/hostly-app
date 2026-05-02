/**
 * Navegación contextual entre módulos del dashboard (retorno operativo, foco, panel).
 * Usar desde cualquier pantalla: escribe payload en sessionStorage + query en destino.
 */

export const CROSS_NAV_STORAGE_KEY = "hostly.crossNav.v1";
export const CROSS_NAV_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** Query en la página de destino (ej. Compras) mientras el usuario trabaja allí. */
export const QS_FROM = "hm_from";
export const QS_RETURN_TO = "hm_returnTo";
export const QS_FOCUS = "hm_focus";
export const QS_OPEN_PANEL = "hm_panel";

/** Query al volver al módulo de origen (ej. Facturas y Costes) para restaurar fila/panel. */
export const QS_RESTORE_FOCUS = "h_focus";
export const QS_RESTORE_PANEL = "h_panel";

export type CrossNavPayloadV1 = {
  v: 1;
  sourceModule: string;
  returnTo: string;
  focusId: string;
  openPanel: boolean;
  /** Clave i18n, ej. crossNav.backToFacturasCostes */
  labelKey: string;
  ts: number;
};

const DEFAULT_LABEL_BY_MODULE: Record<string, string> = {
  "facturas-costes": "crossNav.backToFacturasCostes",
  recepciones: "crossNav.backToRecepciones",
  "validacion-inteligente": "crossNav.backToValidacion",
};

export function defaultCrossNavLabelKey(sourceModule: string): string {
  return DEFAULT_LABEL_BY_MODULE[sourceModule] ?? "crossNav.backToModule";
}

export function isSafeInternalReturnPath(p: string): boolean {
  const t = p.trim();
  if (!t.startsWith("/dashboard/")) return false;
  if (t.includes("://") || t.includes("..") || t.includes("?") || t.includes("#")) return false;
  return /^\/dashboard\/[a-z0-9/-]+$/i.test(t);
}

export function writeCrossNavPayload(payload: CrossNavPayloadV1): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CROSS_NAV_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readStoredCrossNavPayload(): CrossNavPayloadV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CROSS_NAV_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as CrossNavPayloadV1;
    if (p.v !== 1 || typeof p.sourceModule !== "string" || typeof p.returnTo !== "string") return null;
    if (!isSafeInternalReturnPath(p.returnTo)) return null;
    if (typeof p.ts !== "number" || Date.now() - p.ts > CROSS_NAV_MAX_AGE_MS) {
      sessionStorage.removeItem(CROSS_NAV_STORAGE_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function clearCrossNavPayload(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CROSS_NAV_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export type NavigateWithCrossContextInput = {
  targetPath: string;
  sourceModule: string;
  returnTo: string;
  /** Id de compra / registro operativo a resaltar al volver (y al llegar si aplica). */
  focusId?: string;
  openPanel?: boolean;
  labelKey?: string;
};

/**
 * Construye la query para el destino (sin mutar storage).
 */
export function buildCrossNavTargetQuery(input: NavigateWithCrossContextInput): string {
  const sp = new URLSearchParams();
  sp.set(QS_FROM, input.sourceModule);
  if (isSafeInternalReturnPath(input.returnTo)) sp.set(QS_RETURN_TO, input.returnTo);
  const fid = (input.focusId ?? "").trim();
  if (fid) sp.set(QS_FOCUS, fid);
  if (input.openPanel) sp.set(QS_OPEN_PANEL, "1");
  return sp.toString();
}

/**
 * URL de retorno con parámetros de restauración (fila + panel lateral).
 */
export function buildReturnUrlWithRestore(returnTo: string, focusId: string, openPanel: boolean): string {
  if (!isSafeInternalReturnPath(returnTo)) return "/dashboard";
  const [path, existingQs] = returnTo.split("?");
  const sp = new URLSearchParams(existingQs ?? "");
  const fid = focusId.trim();
  if (fid) sp.set(QS_RESTORE_FOCUS, fid);
  else sp.delete(QS_RESTORE_FOCUS);
  if (openPanel && fid) sp.set(QS_RESTORE_PANEL, "1");
  else sp.delete(QS_RESTORE_PANEL);
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}

/**
 * Resuelve el contexto activo: prioriza sessionStorage si coincide con `hm_from` en URL;
 * si no, reconstruye desde query (enlace compartido / nueva pestaña parcial).
 */
export function resolveActiveCrossNav(searchParams: URLSearchParams): CrossNavPayloadV1 | null {
  const from = searchParams.get(QS_FROM);
  if (!from) return null;

  const stored = readStoredCrossNavPayload();
  if (stored && stored.sourceModule === from) return stored;

  const returnToRaw = searchParams.get(QS_RETURN_TO);
  if (!returnToRaw || !isSafeInternalReturnPath(returnToRaw)) return null;

  const focusId = (searchParams.get(QS_FOCUS) ?? "").trim();
  const openPanel = searchParams.get(QS_OPEN_PANEL) === "1";

  return {
    v: 1,
    sourceModule: from,
    returnTo: returnToRaw,
    focusId,
    openPanel,
    labelKey: defaultCrossNavLabelKey(from),
    ts: Date.now(),
  };
}

/**
 * Navega al módulo destino guardando contexto para el strip de retorno y la restauración al volver.
 */
export function navigateWithCrossContext(push: (href: string) => void, input: NavigateWithCrossContextInput): void {
  const returnTo = isSafeInternalReturnPath(input.returnTo) ? input.returnTo : "/dashboard";
  const focusId = (input.focusId ?? "").trim();
  const openPanel = !!input.openPanel;
  const labelKey = input.labelKey ?? defaultCrossNavLabelKey(input.sourceModule);

  const payload: CrossNavPayloadV1 = {
    v: 1,
    sourceModule: input.sourceModule,
    returnTo,
    focusId,
    openPanel,
    labelKey,
    ts: Date.now(),
  };
  writeCrossNavPayload(payload);

  const base = input.targetPath.split("?")[0];
  const q = buildCrossNavTargetQuery({ ...input, returnTo, focusId, openPanel });
  push(`${base}?${q}`);
}

/**
 * Elimina de `searchParams` las claves de contexto entrante; devuelve pathname + query limpia.
 */
export function stripIncomingCrossNavQuery(pathname: string, searchParams: URLSearchParams): string {
  const sp = new URLSearchParams(searchParams.toString());
  sp.delete(QS_FROM);
  sp.delete(QS_RETURN_TO);
  sp.delete(QS_FOCUS);
  sp.delete(QS_OPEN_PANEL);
  const q = sp.toString();
  return q ? `${pathname}?${q}` : pathname;
}

/** Limpia solo el foco en Compras tras hacer scroll (mantiene hm_from / retorno visible). */
export function stripComprasFocusFromQuery(pathname: string, searchParams: URLSearchParams): string {
  const sp = new URLSearchParams(searchParams.toString());
  sp.delete(QS_FOCUS);
  const q = sp.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export function stripRestoreQuery(pathname: string, searchParams: URLSearchParams): string {
  const sp = new URLSearchParams(searchParams.toString());
  sp.delete(QS_RESTORE_FOCUS);
  sp.delete(QS_RESTORE_PANEL);
  const q = sp.toString();
  return q ? `${pathname}?${q}` : pathname;
}

/** Alias documental para el mismo contrato que `buildReturnUrlWithRestore`. */
export const buildReturnUrl = buildReturnUrlWithRestore;

/** Alias documental: contexto activo en la URL actual + storage. */
export const getReturnContext = resolveActiveCrossNav;

/** Alias documental para `navigateWithCrossContext`. */
export const navigateWithContext = navigateWithCrossContext;
