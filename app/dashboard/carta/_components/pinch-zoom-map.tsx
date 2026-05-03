"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wrapper de gestos táctiles para el mapa de mesas de Carta/TPV.
 *
 * - Pellizco con dos dedos = zoom (clamp a `[minZoom, maxZoom]`).
 * - Arrastre con un dedo = pan (con umbral de 6 px para distinguir tap vs drag,
 *   así una mesa sigue siendo "tappable").
 * - `touch-action: none` solo cuando `enabled`, así no afecta a desktop ni a otras
 *   zonas de la pantalla (cabecera, filtros, métricas).
 *
 * Cuando `enabled === false` se renderiza un Fragment con los hijos directamente,
 * sin DOM extra, para no introducir cambios de layout en desktop.
 *
 * No toca lógica de datos ni de navegación: el zoom/pan vive solo en estado local.
 */

const DEFAULT_MIN = 0.6;
const DEFAULT_MAX = 2.5;
const PAN_THRESHOLD_PX = 6;
const POST_PAN_CLICK_BLOCK_MS = 80;
/** Margen extra (px de pantalla) que se permite arrastrar más allá del borde natural. */
const PAN_PADDING = 80;
/** Pon a `true` para volcar en consola cada cálculo de límites de pan. */
const PAN_DEBUG = false;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export type PinchZoomMapProps = {
  /** Si `false`, no se monta nada (Fragment con children). Útil para desktop. */
  enabled?: boolean;
  /** Zoom mínimo. Por defecto 0.6. */
  minZoom?: number;
  /** Zoom máximo. Por defecto 2.5. */
  maxZoom?: number;
  /** Zoom inicial. Por defecto 1. */
  initialZoom?: number;
  /** Estilos extra para el contenedor de gestos (cuando `enabled`). */
  containerStyle?: CSSProperties;
  /** Clase opcional para el contenedor de gestos. */
  className?: string;
  children: ReactNode;
};

export function PinchZoomMap({
  enabled = true,
  minZoom = DEFAULT_MIN,
  maxZoom = DEFAULT_MAX,
  initialZoom = 1,
  containerStyle,
  className,
  children,
}: PinchZoomMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<number>(initialZoom);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const zoomRef = useRef<number>(zoom);
  const panRef = useRef<{ x: number; y: number }>(pan);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const pointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(
    new Map(),
  );
  const pinchRef = useRef<{
    startZoom: number;
    startDist: number;
    startMidLocal: { x: number; y: number };
  } | null>(null);
  const panSessionRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPan: { x: number; y: number };
    isPanning: boolean;
  } | null>(null);
  const justPannedRef = useRef<boolean>(false);
  const justPannedTimeoutRef = useRef<number | null>(null);

  const flagJustPanned = useCallback(() => {
    justPannedRef.current = true;
    if (justPannedTimeoutRef.current != null) {
      window.clearTimeout(justPannedTimeoutRef.current);
    }
    justPannedTimeoutRef.current = window.setTimeout(() => {
      justPannedRef.current = false;
      justPannedTimeoutRef.current = null;
    }, POST_PAN_CLICK_BLOCK_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (justPannedTimeoutRef.current != null) {
        window.clearTimeout(justPannedTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Mide el contenido real (sin escalar) del transform layer iterando sus hijos
   * directos y cogiendo `offsetLeft + offsetWidth` / `offsetTop + offsetHeight`.
   * No usamos `scrollWidth/scrollHeight` porque el transform layer tiene
   * `inset: 0` y por tanto su scroll size mínimo es el del contenedor, lo que
   * impediría detectar el caso "contenido más pequeño que el contenedor".
   */
  const measureContent = useCallback((): { w: number; h: number } => {
    const layer = transformRef.current;
    if (!layer) return { w: 0, h: 0 };
    let maxR = 0;
    let maxB = 0;
    for (const node of Array.from(layer.children)) {
      const el = node as HTMLElement;
      const r = el.offsetLeft + el.offsetWidth;
      const b = el.offsetTop + el.offsetHeight;
      if (r > maxR) maxR = r;
      if (b > maxB) maxB = b;
    }
    return { w: maxR, h: maxB };
  }, []);

  /**
   * Limita `nextPan` al rango natural según el zoom y el tamaño del contenedor.
   *
   * GARANTÍA: NUNCA devuelve un pan sin clamp. Aunque la medida del contenido
   * sea 0 o el contenedor aún no esté layouteado, se aplican límites razonables
   * usando un fallback en cascada:
   *   contenido medido > 0  →  usa el contenido medido
   *   contenido medido = 0  →  usa el tamaño del contenedor
   *   contenedor = 0        →  usa `window.innerWidth/Height`
   *   sin window (SSR)      →  usa 800x600 como último recurso
   *
   * Reglas:
   * - Si el contenido escalado es menor que el contenedor → centrado ±PAN_PADDING.
   * - Si es mayor → permite arrastrar todo el rango necesario para verlo entero,
   *   con `PAN_PADDING` extra a cada lado para no notar bordes duros.
   */
  const clampPan = useCallback(
    (next: { x: number; y: number }, zoomValue: number): { x: number; y: number } => {
      const container = containerRef.current;
      const winW =
        typeof window !== "undefined" && Number.isFinite(window.innerWidth)
          ? window.innerWidth
          : 0;
      const winH =
        typeof window !== "undefined" && Number.isFinite(window.innerHeight)
          ? window.innerHeight
          : 0;
      const cW =
        (container?.clientWidth ?? 0) > 0
          ? container!.clientWidth
          : winW > 0
            ? winW
            : 800;
      const cH =
        (container?.clientHeight ?? 0) > 0
          ? container!.clientHeight
          : winH > 0
            ? winH
            : 600;

      const measured = measureContent();
      const contentW = measured.w > 0 ? measured.w : cW;
      const contentH = measured.h > 0 ? measured.h : cH;

      const W = contentW * zoomValue;
      const H = contentH * zoomValue;

      let minX: number;
      let maxX: number;
      let minY: number;
      let maxY: number;
      if (W <= cW) {
        const center = (cW - W) / 2;
        minX = center - PAN_PADDING;
        maxX = center + PAN_PADDING;
      } else {
        minX = cW - W - PAN_PADDING;
        maxX = PAN_PADDING;
      }
      if (H <= cH) {
        const center = (cH - H) / 2;
        minY = center - PAN_PADDING;
        maxY = center + PAN_PADDING;
      } else {
        minY = cH - H - PAN_PADDING;
        maxY = PAN_PADDING;
      }

      const clampedPan = {
        x: clamp(next.x, minX, maxX),
        y: clamp(next.y, minY, maxY),
      };

      if (PAN_DEBUG) {
        // eslint-disable-next-line no-console
        console.log("PAN CLAMP DEBUG", {
          containerWidth: cW,
          containerHeight: cH,
          contentWidth: contentW,
          contentHeight: contentH,
          measured,
          zoom: zoomValue,
          nextPan: next,
          clampedPan,
          minPanX: minX,
          maxPanX: maxX,
          minPanY: minY,
          maxPanY: maxY,
        });
      }

      return clampedPan;
    },
    [measureContent],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      const container = containerRef.current;
      if (!container) return;
      pointersRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
      const count = pointersRef.current.size;

      if (count === 1) {
        panSessionRef.current = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startPan: { ...panRef.current },
          isPanning: false,
        };
      } else if (count === 2) {
        panSessionRef.current = null;
        const rect = container.getBoundingClientRect();
        const pts = Array.from(pointersRef.current.values());
        const a = { x: pts[0].clientX - rect.left, y: pts[0].clientY - rect.top };
        const b = { x: pts[1].clientX - rect.left, y: pts[1].clientY - rect.top };
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const z = zoomRef.current;
        const p = panRef.current;
        pinchRef.current = {
          startZoom: z,
          startDist: dist,
          startMidLocal: {
            x: (mid.x - p.x) / z,
            y: (mid.y - p.y) / z,
          },
        };
        try {
          container.setPointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      }
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      const container = containerRef.current;
      if (!container) return;
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
      const count = pointersRef.current.size;

      if (count === 2 && pinchRef.current) {
        const rect = container.getBoundingClientRect();
        const pts = Array.from(pointersRef.current.values());
        const a = { x: pts[0].clientX - rect.left, y: pts[0].clientY - rect.top };
        const b = { x: pts[1].clientX - rect.left, y: pts[1].clientY - rect.top };
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const ratio = dist / pinchRef.current.startDist;
        const newZoom = clamp(
          pinchRef.current.startZoom * ratio,
          minZoom,
          maxZoom,
        );
        const newPan = {
          x: mid.x - pinchRef.current.startMidLocal.x * newZoom,
          y: mid.y - pinchRef.current.startMidLocal.y * newZoom,
        };
        setZoom(newZoom);
        setPan(clampPan(newPan, newZoom));
        e.preventDefault();
        return;
      }

      const session = panSessionRef.current;
      if (count === 1 && session && session.pointerId === e.pointerId) {
        const dx = e.clientX - session.startClientX;
        const dy = e.clientY - session.startClientY;
        if (!session.isPanning) {
          if (Math.abs(dx) > PAN_THRESHOLD_PX || Math.abs(dy) > PAN_THRESHOLD_PX) {
            session.isPanning = true;
            try {
              container.setPointerCapture(e.pointerId);
            } catch {
              /* noop */
            }
          }
        }
        if (session.isPanning) {
          setPan(
            clampPan(
              {
                x: session.startPan.x + dx,
                y: session.startPan.y + dy,
              },
              zoomRef.current,
            ),
          );
          e.preventDefault();
        }
      }
    },
    [enabled, minZoom, maxZoom, clampPan],
  );

  const endPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      const container = containerRef.current;
      const wasPinching = pinchRef.current != null;
      pointersRef.current.delete(e.pointerId);
      try {
        container?.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }

      if (wasPinching) {
        pinchRef.current = null;
        flagJustPanned();
        if (pointersRef.current.size === 1) {
          const remaining = Array.from(pointersRef.current.entries())[0];
          if (remaining) {
            const [pid, pt] = remaining;
            panSessionRef.current = {
              pointerId: pid,
              startClientX: pt.clientX,
              startClientY: pt.clientY,
              startPan: { ...panRef.current },
              isPanning: true,
            };
          }
        } else {
          panSessionRef.current = null;
        }
        return;
      }

      const session = panSessionRef.current;
      if (session && session.pointerId === e.pointerId) {
        if (session.isPanning) flagJustPanned();
        panSessionRef.current = null;
      }
    },
    [enabled, flagJustPanned],
  );

  const onClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!enabled) return;
      if (justPannedRef.current) {
        e.stopPropagation();
        e.preventDefault();
        justPannedRef.current = false;
      }
    },
    [enabled],
  );

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClickCapture={onClickCapture}
      style={{
        position: "absolute",
        inset: 0,
        touchAction: "none",
        overflow: "hidden",
        ...containerStyle,
      }}
    >
      <div
        ref={transformRef}
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "0 0",
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
