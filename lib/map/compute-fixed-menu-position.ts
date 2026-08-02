/**
 * Posicionamiento viewport-fixed para menús contextuales del mapa TPV.
 * Independiente del zoom/pan del canvas (usa coordenadas de pantalla).
 */

export type FixedMenuAnchorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type FixedMenuViewport = {
  width: number;
  height: number;
};

export type FixedMenuPosition = {
  /** Coordenada CSS `top` (esquina superior del menú). */
  top: number;
  /** Coordenada CSS `left` (esquina izquierda del menú). */
  left: number;
  placement: "below" | "above";
};

export const DEFAULT_FIXED_MENU_MARGIN_PX = 8;
export const DEFAULT_FIXED_MENU_GAP_PX = 8;

/** Estimación inicial del menú “Separar mesas” antes de medir el DOM. */
export const GROUP_SEPARATE_MENU_ESTIMATED_SIZE = {
  width: 220,
  height: 148,
} as const;

function clamp(n: number, min: number, max: number): number {
  if (max < min) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * Calcula top/left en coordenadas de viewport para `position: fixed`.
 * Preferencia: debajo del ancla; si no cabe, encima; clamp en ambos ejes.
 */
export function computeFixedMenuPosition(args: {
  anchor: FixedMenuAnchorRect;
  menuSize: { width: number; height: number };
  viewport: FixedMenuViewport;
  margin?: number;
  gap?: number;
}): FixedMenuPosition {
  const margin = args.margin ?? DEFAULT_FIXED_MENU_MARGIN_PX;
  const gap = args.gap ?? DEFAULT_FIXED_MENU_GAP_PX;
  const menuW = Math.max(0, args.menuSize.width);
  const menuH = Math.max(0, args.menuSize.height);
  const vw = Math.max(0, args.viewport.width);
  const vh = Math.max(0, args.viewport.height);

  const anchorBottom = args.anchor.top + args.anchor.height;
  const spaceBelow = vh - margin - (anchorBottom + gap);
  const spaceAbove = args.anchor.top - margin - gap;

  let placement: "below" | "above" = "below";
  if (spaceBelow < menuH && spaceAbove > spaceBelow) {
    placement = "above";
  }

  let top =
    placement === "below"
      ? anchorBottom + gap
      : args.anchor.top - gap - menuH;

  const minTop = margin;
  const maxTop = Math.max(margin, vh - margin - menuH);
  top = clamp(top, minTop, maxTop);

  const centerX = args.anchor.left + args.anchor.width / 2;
  let left = centerX - menuW / 2;
  const minLeft = margin;
  const maxLeft = Math.max(margin, vw - margin - menuW);
  left = clamp(left, minLeft, maxLeft);

  return { top, left, placement };
}

export function rectFromDomRect(r: DOMRectReadOnly): FixedMenuAnchorRect {
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
  };
}

export function readViewportSize(): FixedMenuViewport {
  if (typeof window === "undefined") {
    return { width: 1024, height: 768 };
  }
  const vv = window.visualViewport;
  if (vv && Number.isFinite(vv.width) && Number.isFinite(vv.height)) {
    return { width: vv.width, height: vv.height };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}
