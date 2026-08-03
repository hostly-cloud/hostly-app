import type { FloorPlanCanvasSize } from "@/lib/firestore/floorPlans";
import type { Table } from "@/lib/firestore/tables";

/**
 * Contrato de cámara del mapa TPV readonly.
 * La inicialización depende del plano y del viewport, no de mesas visibles.
 */
export type MapCameraState = {
  scale: number;
  translateX: number;
  translateY: number;
  initializedForPlanId: string | null;
};

export type TpvMapCameraFitSource = "plan" | "legacy-fallback";

export type TpvMapCameraBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type TpvMapCameraFitResult = {
  camera: MapCameraState;
  bounds: TpvMapCameraBounds;
  source: TpvMapCameraFitSource;
};

const DEFAULT_BOUNDS: TpvMapCameraBounds = {
  minX: 0,
  minY: 0,
  maxX: 800,
  maxY: 560,
  width: 800,
  height: 560,
  centerX: 400,
  centerY: 280,
};

function isValidPlanDim(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function hasValidTpvPlanSize(
  planSize: FloorPlanCanvasSize | null | undefined,
): boolean {
  return isValidPlanDim(planSize?.width) && isValidPlanDim(planSize?.height);
}

/**
 * Clave de auto-fit TPV: solo identidad/dimensiones del plano (+ constantes UX).
 * No incluir mesas, filtros, grupos ni conteos de elementos.
 */
export function buildTpvMapCameraFitKey(input: {
  planId: string | null | undefined;
  planWidth: number;
  planHeight: number;
  visualScale?: number;
  paddingPx?: number;
}): string {
  const planKey = String(input.planId ?? "legacy").trim() || "legacy";
  return [
    planKey,
    input.visualScale ?? 1,
    input.planWidth,
    input.planHeight,
    input.paddingPx ?? 0,
  ].join("::");
}

function boundsFromRect(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): TpvMapCameraBounds {
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function boundsFromPersistedElements(
  elements: Table[],
  zones: Array<{ x: number; y: number; width: number; height: number }>,
): TpvMapCameraBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (x: number, y: number, w: number, h: number) => {
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };
  for (const e of elements) {
    const w =
      typeof e.width === "number" && e.width > 0 ? e.width : 80;
    const h =
      typeof e.height === "number" && e.height > 0 ? e.height : 80;
    const x = typeof e.x === "number" && Number.isFinite(e.x) ? e.x : 0;
    const y = typeof e.y === "number" && Number.isFinite(e.y) ? e.y : 0;
    extend(x, y, w, h);
  }
  for (const z of zones) {
    extend(z.x, z.y, z.width, z.height);
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) {
    return { ...DEFAULT_BOUNDS };
  }
  return boundsFromRect(minX, minY, maxX, maxY);
}

/**
 * Bounds estables para el encuadre TPV.
 * Preferencia: dimensiones canónicas del plano.
 * Fallback: todos los elementos persistidos del plano (nunca solo mesas visibles).
 */
export function resolveTpvMapCameraBounds(input: {
  planSize: FloorPlanCanvasSize | null | undefined;
  /** Todos los elementos persistidos del plano (decoración + mesas), no filtrados. */
  persistedElements?: Table[];
  persistedZones?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}): { bounds: TpvMapCameraBounds; source: TpvMapCameraFitSource } {
  if (hasValidTpvPlanSize(input.planSize)) {
    const w = input.planSize!.width;
    const h = input.planSize!.height;
    return {
      bounds: boundsFromRect(0, 0, w, h),
      source: "plan",
    };
  }

  return {
    bounds: boundsFromPersistedElements(
      input.persistedElements ?? [],
      input.persistedZones ?? [],
    ),
    source: "legacy-fallback",
  };
}

/**
 * scale = min(availableW/planW, availableH/planH), centrado, con padding.
 */
export function computeTpvMapCameraFit(input: {
  planId: string | null | undefined;
  planSize: FloorPlanCanvasSize | null | undefined;
  viewportWidth: number;
  viewportHeight: number;
  paddingPx: number;
  fitZoomMax: number;
  maxZoom?: number;
  persistedElements?: Table[];
  persistedZones?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  /** Mesas visibles/filtradas: NO deben influir (solo para tests de invariante). */
  visibleTablesIgnored?: Table[];
}): TpvMapCameraFitResult {
  void input.visibleTablesIgnored;
  const { bounds, source } = resolveTpvMapCameraBounds({
    planSize: input.planSize,
    persistedElements: input.persistedElements,
    persistedZones: input.persistedZones,
  });

  const vw = Math.max(1, input.viewportWidth);
  const vh = Math.max(1, input.viewportHeight);
  const paddingPx = Math.max(0, input.paddingPx);
  const usableW = Math.max(32, vw - paddingPx);
  const usableH = Math.max(32, vh - paddingPx);
  const naturalFit = Math.min(usableW / bounds.width, usableH / bounds.height);
  const zoomCeil = Math.max(input.fitZoomMax, input.maxZoom ?? input.fitZoomMax);
  let scale = Math.min(naturalFit, input.fitZoomMax, zoomCeil);
  if (!Number.isFinite(scale) || scale <= 0) scale = 0.06;
  scale = Math.max(scale, 0.06);

  return {
    source,
    bounds,
    camera: {
      scale,
      translateX: vw / 2 - bounds.centerX * scale,
      translateY: vh / 2 - bounds.centerY * scale,
      initializedForPlanId: input.planId?.trim() || null,
    },
  };
}

export function logTpvMapCamera(
  event: "init" | "preserve" | "plan-change" | "legacy-fallback",
  payload: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof console === "undefined") return;
  console.log(`[Hostly:MapCamera] ${event}`, payload);
}
