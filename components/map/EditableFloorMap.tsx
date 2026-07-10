"use client";

import type { CSSProperties, WheelEvent as ReactWheelEvent } from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MutableRefObject, Ref } from "react";
import {
  getDefaultSizeForPlanElementType,
  isDecorativePlanElementType,
  type PlanElementType,
  type Table,
} from "@/lib/firestore/tables";
import type { FloorPlanCanvasSize } from "@/lib/firestore/floorPlans";
import { inferSpatialAreaVisual } from "@/lib/map/editor-spatial-visual";
import { resolvePlanElementDisplayName } from "@/lib/map/plan-element-labels";
import {
  MAP_TABLE_CHAIR_BORDER,
  MAP_TABLE_CHAIR_FILL,
  MAP_TABLE_CHAIR_SHADOW,
  mapTableChairLayouts,
  mapTableSeatCount,
} from "./map-table-chairs-visual";

export type { FloorPlanCanvasSize } from "@/lib/firestore/floorPlans";

export const DEFAULT_MAP_TILE_WIDTH =
  getDefaultSizeForPlanElementType("table").width;
export const DEFAULT_MAP_TILE_HEIGHT =
  getDefaultSizeForPlanElementType("table").height;
/** Límite inferior al acercar/alejar con botones o rueda (no aplica al fit automático). */
const ZOOM_MIN = 0.45;
/** Límite superior manual; el fit inicial no supera `FIT_ZOOM_MAX`. */
const ZOOM_MAX = 1.35;
/** Tope de zoom al abrir / Centrar para no “meter lupa” en planos casi vacíos. */
const FIT_ZOOM_MAX = 1.05;
/** Margen al encajar / centrar (aprox. 40 px por lado). */
const VIEW_PADDING_PX = 80;

const GRID_SIZE = 10;

function snapToGrid(n: number): number {
  return Math.round(n / GRID_SIZE) * GRID_SIZE;
}

export type FloorSurfacePresetId =
  | "ice"
  | "stone"
  | "warm"
  | "coolGray"
  | "sand"
  | "cement"
  | "lightWood"
  | "slate";

const FLOOR_SURFACE_PRESETS: Record<
  FloorSurfacePresetId,
  { color: string; image: string }
> = {
  ice: {
    color: "#eef4f9",
    image:
      "linear-gradient(180deg, rgba(248, 251, 254, 0.36) 0%, rgba(218, 229, 239, 0.28) 100%)",
  },
  stone: {
    color: "#edf1f4",
    image:
      "linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(210, 219, 227, 0.2) 100%)",
  },
  warm: {
    color: "#f1ede4",
    image:
      "linear-gradient(180deg, rgba(255, 252, 246, 0.3) 0%, rgba(224, 216, 204, 0.22) 100%)",
  },
  coolGray: {
    color: "#edf2f6",
    image:
      "linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(218, 226, 234, 0.22) 100%)",
  },
  sand: {
    color: "#f0eadf",
    image:
      "linear-gradient(180deg, rgba(255, 252, 244, 0.32) 0%, rgba(222, 211, 194, 0.2) 100%)",
  },
  cement: {
    color: "#e7edf1",
    image:
      "linear-gradient(180deg, rgba(250,252,254,0.24) 0%, rgba(203, 215, 224, 0.2) 100%)",
  },
  lightWood: {
    color: "#efe8dc",
    image:
      "linear-gradient(90deg, rgba(255,255,255,0.16) 0%, transparent 42%, rgba(120, 96, 68, 0.035) 100%)",
  },
  slate: {
    color: "#e4edf5",
    image:
      "linear-gradient(180deg, rgba(248,251,254,0.28) 0%, rgba(195, 211, 225, 0.2) 100%)",
  },
};

function minSizeForPlanType(planType: PlanElementType): { w: number; h: number } {
  if (planType === "sunbed") return { w: 64, h: 28 };
  if (planType === "bed") return { w: 72, h: 44 };
  if (planType === "wall") return { w: 10, h: 4 };
  if (planType === "bar") return { w: 44, h: 16 };
  if (planType === "column") return { w: 10, h: 10 };
  if (planType === "pool") return { w: 48, h: 28 };
  if (planType === "door") return { w: 10, h: 10 };
  if (planType === "planter") return { w: 12, h: 8 };
  return { w: 36, h: 36 };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function clampPositionKeepVisible(
  x: number,
  y: number,
  w: number,
  h: number,
  floorW: number,
  floorH: number,
): { x: number; y: number } {
  // Keep at least half the element inside the map so it can't be fully lost.
  const minX = -w / 2;
  const maxX = floorW - w / 2;
  const minY = -h / 2;
  const maxY = floorH - h / 2;
  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY),
  };
}

/**
 * Editor de planos (superficie operativa): la etiqueta escala con el área lógica del tile
 * para que al agrandar mesa/cama/tumbona el nombre siga proporcionado (TPV no usa `editorPlanSurface`).
 */
function editorOperativoSurfaceLabelFontPx(
  mapTileWidth: number,
  mapTileHeight: number,
  selected: boolean,
): number {
  const area = Math.max(1, mapTileWidth) * Math.max(1, mapTileHeight);
  const geo = Math.sqrt(area);
  const bump = selected ? 0.75 : 0;
  const raw = geo * 0.132 + bump;
  return Math.round(clamp(raw, 10, 20) * 4) / 4;
}

export type FloorMapRenderContext = {
  element: Table;
  elementId: string;
  mapLayoutX: number;
  mapLayoutY: number;
  mapTileWidth: number;
  mapTileHeight: number;
  setNodeRef?: (el: HTMLDivElement | null) => void;
};

export type EditableFloorMapZone = {
  id: string;
  name: string;
  color?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type EditableFloorMapZoneHighlight = "all" | "unassigned" | string;

/** Controles de zoom/pan expuestos al padre (p. ej. rail izquierdo del editor). */
export type EditableFloorMapViewportControls = {
  zoomIn: () => void;
  zoomOut: () => void;
  /** Zoom 1:1 y pan centrado en el contenido (no muta datos). */
  resetNaturalZoom: () => void;
  /** Encaje completo en el viewport (no muta datos). */
  fitToViewport: () => void;
};

export type EditableFloorMapProps = {
  elements: Table[];
  editable: boolean;
  selectedId?: string | null;
  /** Si se pasa y no está vacío, sustituye la lógica de `selectedId` para el resaltado. */
  selectedIds?: string[];
  onSelect?: (id: string, modifiers?: { shiftKey?: boolean }) => void;
  onMove?: (id: string, x: number, y: number) => void;
  /** Un solo commit al mover varias piezas a la vez (arrastre en grupo). */
  onMoveMany?: (updates: { id: string; x: number; y: number }[]) => void;
  onResize?: (id: string, width: number, height: number) => void;
  /** Renombrar desde doble clic en la etiqueta (editor). */
  onRename?: (id: string, newName: string) => void;
  onCreate?: (planType: PlanElementType, x: number, y: number) => void;
  /** Tipo a crear al hacer click en el fondo (modo editor). */
  createType?: PlanElementType | null;
  renderElement?: (ctx: FloorMapRenderContext) => React.ReactNode;
  /** Solo modo editor: fondo de plano (rejilla) para alinear elementos. */
  editorPlanSurface?: boolean;
  /** Solo visual: material base del suelo del restaurante. No altera coordenadas ni datos. */
  floorSurfacePreset?: FloorSurfacePresetId;
  /** Tamaño lógico del plano. Si existe, gobierna límites y auto-fit. */
  planSize?: FloorPlanCanvasSize | null;
  /** Fuente opcional para calcular auto-fit sin cambiar los elementos renderizados. */
  viewportFitElements?: Table[];
  viewportFitZones?: EditableFloorMapZone[];
  /** `plan` encaja el marco lógico; `content` encaja solo el restaurante real. */
  viewportFitMode?: "plan" | "content";
  /** Tope de escala para el auto-fit. Permite al TPV llenar mejor el espacio útil. */
  viewportFitZoomMax?: number;
  /** Alineación del encuadre automático (`start` = anclar arriba-izquierda del contenido). */
  viewportFitAlign?: "center" | "start";
  /**
   * Desplazamiento (px de pantalla) aplicado al pan tras el encuadre. Solo UX
   * (p. ej. recentrar el restaurante en TPV); no altera datos ni zoom.
   */
  viewportFitOffsetX?: number;
  viewportFitOffsetY?: number;
  /**
   * Multiplicador aplicado al zoom final del encuadre (solo UX). Permite que una
   * superficie (p. ej. TPV operativo) aproveche más pantalla sin tocar el pan ni
   * el algoritmo de fit. Default `1` = sin efecto.
   */
  viewportFitZoomMultiplier?: number;
  /** Solo modo editor: zonas conocidas (para color / badge). */
  zones?: EditableFloorMapZone[];
  /** Solo modo editor: resaltar zona (opacidad atenuada en el resto). */
  zoneHighlight?: EditableFloorMapZoneHighlight;
  /** Solo modo editor: modo edición de zonas (desactiva mover/redimensionar elementos). */
  editingZones?: boolean;
  selectedZoneId?: string | null;
  onSelectZone?: (zoneId: string) => void;
  onMoveZone?: (zoneId: string, x: number, y: number) => void;
  onResizeZone?: (zoneId: string, width: number, height: number) => void;
  /** Estética del lienzo: `premium` activa grid suave, zonas tipo “plano” y cromas más editoriales. */
  editorVisualPreset?: "default" | "premium";
  /**
   * Coloca un elemento en el centro visible del mapa (respeta zoom/pan).
   * Tras consumirse, llamar `onPlacementRequestHandled` desde el padre.
   */
  placementRequest?: { id: number; planType: PlanElementType } | null;
  onPlacementRequestHandled?: () => void;
  mapRef?: React.Ref<HTMLDivElement | null>;
  onWheel?: (e: ReactWheelEvent<HTMLDivElement>) => void;
  className?: string;
  /**
   * Clave estable (p. ej. id de plano): al cambiar, se recalcula encuadre premium.
   * No afecta a datos ni persistencia.
   */
  mapAutoFitKey?: string;
  /**
   * Incrementar cuando el contenido del mapa pasa de vacío a con elementos (p. ej. seed).
   * Dispara un nuevo auto-fit sin depender del id de plano.
   */
  mapAutoFitNonce?: number;
  /** Oculta el bloque flotante de zoom/centrar (cuando el padre los muestra en otro panel). */
  hideInlineZoomControls?: boolean;
  /** API imperativa para zoom/encaje desde fuera del mapa. */
  viewportControlsRef?: Ref<EditableFloorMapViewportControls | null>;
  /**
   * Margen total (px) al calcular encaje en viewport; menor = contenido algo mayor.
   * Solo UX; no altera coordenadas de elementos.
   */
  viewportFitPaddingPx?: number;
  /** Editor de plano “denso”: mesas más presentes, encaje algo más cercano, lienzo con más relieve. */
  mapLayoutEmphasis?: boolean;
  /**
   * Oculta la capa visual de zonas (rectángulos de ambiente). En edición de zonas
   * (`editingZones`) se fuerza la capa visible para no bloquear el layout.
   */
  hideZoneOverlays?: boolean;
  /** Ref con `selectedIds` actualizado en el mismo tick que `onSelect` (arrastre en grupo). */
  selectedIdsRef?: MutableRefObject<string[]>;
  /** Rectángulo de pantalla del bloque seleccionado (toolbar contextual). */
  onSelectionScreenRect?: (rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null) => void;
  /** Rectángulo de pantalla de la zona en edición (HUD discreto). */
  onZoneScreenRect?: (rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null) => void;
  /** Selección por marco (Shift + arrastrar en el fondo). */
  onBoxSelect?: (ids: string[]) => void;
  /** Punto preferido en coords de mapa para colocar piezas desde el rail. */
  preferredPlacementMapPoint?: { x: number; y: number } | null;
};

function assignDomRef<T>(
  ref: Ref<T> | undefined,
  value: T,
): void {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as MutableRefObject<T>).current = value;
}

function elementSize(el: Table) {
  const def = getDefaultSizeForPlanElementType(el.type);
  const w =
    typeof el.width === "number" && Number.isFinite(el.width) ? el.width : def.width;
  const h =
    typeof el.height === "number" && Number.isFinite(el.height)
      ? el.height
      : def.height;
  return { w, h };
}

/** Alineación suave a bordes/centros de otros elementos (solo editor denso; guías finas). */
const PEER_SNAP_PX = 11;

function snapDragPositionToPeers(
  rawX: number,
  rawY: number,
  w: number,
  h: number,
  selfId: string,
  peers: Table[],
): { x: number; y: number; guides: { v: number[]; h: number[] } } {
  const x0 = snapToGrid(rawX);
  const y0 = snapToGrid(rawY);
  let bestX = x0;
  let bestScoreX = PEER_SNAP_PX + 1;
  let guideX: number | null = null;
  let bestY = y0;
  let bestScoreY = PEER_SNAP_PX + 1;
  let guideY: number | null = null;

  for (const el of peers) {
    if (String(el.id).trim() === String(selfId).trim()) continue;
    const { w: ow, h: oh } = elementSize(el);
    const ox = snapToGrid(el.x ?? 0);
    const oy = snapToGrid(el.y ?? 0);
    const ol = ox;
    const ot = oy;
    const or = ox + ow;
    const ob = oy + oh;
    const oc = ox + ow / 2;
    const ocY = ot + oh / 2;

    const xCandidates: [number, number][] = [
      [ol, ol],
      [or, or],
      [oc - w / 2, oc],
      [ol - w, ol],
      [or - w, or],
    ];
    for (const [targetLeft, guide] of xCandidates) {
      const d = targetLeft - x0;
      const ad = Math.abs(d);
      if (ad < bestScoreX && ad <= PEER_SNAP_PX) {
        bestScoreX = ad;
        bestX = x0 + d;
        guideX = guide;
      }
    }

    const yCandidates: [number, number][] = [
      [ot, ot],
      [ob - h, ob],
      [ocY - h / 2, ocY],
      [ot - h, ot],
      [ob, ob],
    ];
    for (const [targetTop, guide] of yCandidates) {
      const d = targetTop - y0;
      const ad = Math.abs(d);
      if (ad < bestScoreY && ad <= PEER_SNAP_PX) {
        bestScoreY = ad;
        bestY = y0 + d;
        guideY = guide;
      }
    }
  }

  const guides = { v: [] as number[], h: [] as number[] };
  if (guideX != null && bestScoreX <= PEER_SNAP_PX) guides.v.push(guideX);
  if (guideY != null && bestScoreY <= PEER_SNAP_PX) guides.h.push(guideY);

  return { x: bestX, y: bestY, guides };
}

/** Rectángulo que envuelve mesas, zonas con rect y estructuras (solo layout). */
export type PlanContentBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type FitBoundsToViewportOptions = {
  /** Suma aproximada del margen horizontal + vertical (se reparte por lados al restar del viewport). */
  paddingPx: number;
  maxZoom: number;
  fitZoomMax: number;
  /** `start` ancla el contenido arriba-izquierda; `center` centra el cluster (default). */
  align?: "center" | "start";
};

const DEFAULT_PLAN_BOUNDS: PlanContentBounds = {
  minX: 0,
  minY: 0,
  maxX: 800,
  maxY: 560,
  width: 800,
  height: 560,
  centerX: 400,
  centerY: 280,
};

/**
 * Calcula bounds en coordenadas de plano (px) a partir de elementos y zonas con rect.
 * No modifica datos; ignora entradas sin posición/tamaño válidos.
 */
export function getPlanContentBounds(
  tables: Table[],
  zones: EditableFloorMapZone[] | undefined,
  planSize?: FloorPlanCanvasSize | null,
): PlanContentBounds {
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

  if (
    planSize &&
    typeof planSize.width === "number" &&
    typeof planSize.height === "number" &&
    Number.isFinite(planSize.width) &&
    Number.isFinite(planSize.height) &&
    planSize.width > 0 &&
    planSize.height > 0
  ) {
    extend(0, 0, planSize.width, planSize.height);
  }

  for (const e of tables) {
    const { w, h } = elementSize(e);
    const x = typeof e.x === "number" && Number.isFinite(e.x) ? e.x : 0;
    const y = typeof e.y === "number" && Number.isFinite(e.y) ? e.y : 0;
    extend(x, y, w, h);
  }

  if (zones) {
    for (const z of zones) {
      if (
        typeof z.x === "number" &&
        typeof z.y === "number" &&
        typeof z.width === "number" &&
        typeof z.height === "number" &&
        Number.isFinite(z.x) &&
        Number.isFinite(z.y) &&
        Number.isFinite(z.width) &&
        Number.isFinite(z.height) &&
        z.width > 0 &&
        z.height > 0
      ) {
        extend(z.x, z.y, z.width, z.height);
      }
    }
  }

  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) {
    return { ...DEFAULT_PLAN_BOUNDS };
  }

  const width = maxX - minX;
  const height = maxY - minY;
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

/**
 * Ajusta zoom y pan (píxeles de pantalla del contenedor) para encajar bounds sin recortar.
 * `transform` del mapa: translate(pan) scale(zoom), origen arriba-izquierda.
 */
export function fitBoundsToViewport(
  bounds: PlanContentBounds,
  viewportWidth: number,
  viewportHeight: number,
  options: Partial<FitBoundsToViewportOptions> = {},
): { zoom: number; pan: { x: number; y: number } } {
  const paddingPx = options.paddingPx ?? VIEW_PADDING_PX;
  const maxZoom = options.maxZoom ?? ZOOM_MAX;
  const fitZoomMax = options.fitZoomMax ?? FIT_ZOOM_MAX;
  const align = options.align ?? "center";

  const vw = Math.max(1, viewportWidth);
  const vh = Math.max(1, viewportHeight);
  const usableW = Math.max(32, vw - paddingPx);
  const usableH = Math.max(32, vh - paddingPx);

  const bw = Math.max(1, bounds.width);
  const bh = Math.max(1, bounds.height);

  const naturalFit = Math.min(usableW / bw, usableH / bh);
  const zoom = Math.min(naturalFit, fitZoomMax, maxZoom);
  const z = Number.isFinite(zoom) && zoom > 0 ? Math.max(zoom, 0.06) : 0.06;

  const inset = paddingPx / 2;
  const pan =
    align === "start"
      ? {
          x: inset - bounds.minX * z,
          y: inset - bounds.minY * z,
        }
      : {
          x: vw / 2 - bounds.centerX * z,
          y: vh / 2 - bounds.centerY * z,
        };
  return { zoom: z, pan };
}

function getPlanSizeBounds(
  planSize?: FloorPlanCanvasSize | null,
): PlanContentBounds | null {
  if (
    !planSize ||
    typeof planSize.width !== "number" ||
    typeof planSize.height !== "number" ||
    !Number.isFinite(planSize.width) ||
    !Number.isFinite(planSize.height) ||
    planSize.width <= 0 ||
    planSize.height <= 0
  ) {
    return null;
  }
  return {
    minX: 0,
    minY: 0,
    maxX: planSize.width,
    maxY: planSize.height,
    width: planSize.width,
    height: planSize.height,
    centerX: planSize.width / 2,
    centerY: planSize.height / 2,
  };
}

function editorChromeForPlanType(
  planType: PlanElementType,
  tableShape: Table["tableShape"],
  preset: "default" | "premium" = "default",
): { borderRadius: number; background: string } {
  if (preset === "premium") {
    switch (planType) {
      case "sunbed":
        return { borderRadius: 7, background: "rgba(87, 83, 78, 0.45)" };
      case "bed":
        return { borderRadius: 16, background: "rgba(71, 85, 105, 0.4)" };
      case "wall":
        return {
          borderRadius: 2,
          background:
            "linear-gradient(180deg, rgba(37, 39, 36, 0.98) 0%, rgba(22, 24, 23, 1) 100%)",
        };
      case "bar":
        return {
          borderRadius: 12,
          background: [
            "linear-gradient(180deg, rgba(255, 248, 238, 0.06) 0%, transparent 22%)",
            "linear-gradient(180deg, rgba(78, 64, 50, 0.98) 0%, rgba(46, 38, 31, 0.99) 100%)",
          ].join(", "),
        };
      case "column":
        return { borderRadius: 999, background: "rgba(71, 85, 105, 0.85)" };
      case "pool":
        return {
          borderRadius: 16,
          background: [
            "repeating-linear-gradient(105deg, transparent 0, transparent 12px, rgba(255,255,255,0.035) 12px, rgba(255,255,255,0.035) 13px)",
            "radial-gradient(ellipse 95% 58% at 50% 16%, rgba(186, 230, 253, 0.22) 0%, transparent 60%)",
            "linear-gradient(172deg, rgba(56, 189, 248, 0.32) 0%, rgba(14, 100, 145, 0.4) 42%, rgba(6, 40, 62, 0.46) 100%)",
          ].join(", "),
        };
      case "door":
        return {
          borderRadius: 3,
          background:
            "linear-gradient(90deg, rgba(218, 196, 164, 0.5) 0%, rgba(245, 232, 206, 0.62) 50%, rgba(218, 196, 164, 0.5) 100%)",
        };
      case "planter":
        return {
          borderRadius: 999,
          background: [
            "linear-gradient(180deg, rgba(62, 124, 82, 0.5) 0%, rgba(32, 78, 52, 0.55) 100%)",
          ].join(", "),
        };
      case "custom":
        return {
          borderRadius: tableShape === "round" ? 999 : 10,
          background: "rgba(45, 55, 72, 0.58)",
        };
      default:
        return {
          borderRadius: tableShape === "round" ? 999 : 14,
          background:
            tableShape === "round"
              ? "linear-gradient(180deg, rgba(232, 225, 214, 0.96) 0%, rgba(202, 192, 176, 0.96) 100%)"
              : "linear-gradient(180deg, rgba(230, 224, 213, 0.96) 0%, rgba(199, 189, 173, 0.96) 100%)",
        };
    }

  }
  switch (planType) {
    case "sunbed":
      return { borderRadius: 6, background: "rgba(234, 179, 8, 0.42)" };
    case "bed":
      return { borderRadius: 16, background: "rgba(167, 139, 250, 0.4)" };
    case "wall":
      return {
        borderRadius: 2,
        background: "rgba(148, 163, 184, 0.35)",
      };
    case "bar":
      return {
        borderRadius: 8,
        background: "rgba(30, 41, 59, 0.95)",
      };
    case "column":
      return {
        borderRadius: 999,
        background: "rgba(51, 65, 85, 0.95)",
      };
    case "pool":
      return {
        borderRadius: 12,
        background: "rgba(125, 211, 252, 0.5)",
      };
    case "door":
      return {
        borderRadius: 4,
        background: "rgba(100, 116, 139, 0.55)",
      };
    case "planter":
      return {
        borderRadius: 8,
        background: "rgba(22, 101, 52, 0.45)",
      };
    case "custom":
      return {
        borderRadius: tableShape === "round" ? 999 : 12,
        background: "rgba(34, 197, 94, 0.38)",
      };
    default:
      return {
        borderRadius: tableShape === "round" ? 999 : 12,
        background: "rgba(34, 197, 94, 0.38)",
      };
  }
}

function editorBaseBorderForPlanType(
  planType: PlanElementType | undefined,
  preset: "default" | "premium" = "default",
  zoneColor?: string | null,
): string {
  const zoneBorder = zoneColor ? `1px solid ${zoneColor}` : undefined;
  if (preset === "premium") {
    if (planType === "wall") return zoneBorder ?? "1px solid rgba(18, 21, 24, 0.9)";
    if (planType === "door") return zoneBorder ?? "1px solid rgba(245, 222, 186, 0.46)";
    if (planType === "planter") return zoneBorder ?? "1px solid rgba(104, 168, 122, 0.42)";
    if (planType === "pool") return zoneBorder ?? "1px solid rgba(125, 211, 252, 0.48)";
    if (planType === "bar") return zoneBorder ?? "1px solid rgba(184, 160, 132, 0.42)";
    return zoneBorder ?? "1px solid rgba(125, 115, 98, 0.38)";
  }
  if (planType === "wall") return zoneBorder ?? "1px solid rgba(71, 85, 105, 0.52)";
  if (planType === "door") return zoneBorder ?? "1px solid rgba(180, 83, 9, 0.22)";
  if (planType === "planter") return zoneBorder ?? "1px solid rgba(22, 101, 52, 0.42)";
  if (planType === "pool") return zoneBorder ?? "1px solid rgba(56, 189, 248, 0.32)";
  return zoneBorder ?? "1px solid rgba(100, 116, 139, 0.38)";
}

function editorBaseShadowForPlanType(
  planType: PlanElementType | undefined,
  preset: "default" | "premium" = "default",
  zoneColor?: string | null,
): string {
  if (preset === "premium") {
    if (zoneColor) return `inset 0 1px 0 ${zoneColor}33, 0 4px 10px rgba(2, 6, 23, 0.12)`;
    if (planType === "pool") {
      return "inset 0 1px 0 rgba(255,255,255,0.08), 0 5px 14px rgba(8, 60, 90, 0.14), 0 2px 6px rgba(2, 6, 23, 0.12)";
    }
    if (planType === "bar") {
      return "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -7px 14px rgba(0,0,0,0.22), 0 5px 12px rgba(40, 34, 26, 0.18), 0 1px 3px rgba(0,0,0,0.12)";
    }
    if (planType && isDecorativePlanElementType(planType)) {
      return "inset 0 1px 0 rgba(255,255,255,0.05), 0 3px 9px rgba(2, 6, 23, 0.16), 0 1px 3px rgba(2, 6, 23, 0.1)";
    }
    return "inset 0 1px 0 rgba(255,255,255,0.22), 0 3px 8px rgba(40, 34, 26, 0.1), 0 1px 2px rgba(40, 34, 26, 0.06)";
  }
  if (zoneColor) return `inset 0 3px 0 ${zoneColor}, 0 1px 2px rgba(15, 23, 42, 0.12)`;
  return "0 1px 2px rgba(15, 23, 42, 0.12)";
}

export function getPlanElementBaseVisualStyle(
  element: Pick<Table, "type" | "tableShape">,
  preset: "default" | "premium" = "premium",
  zoneColor?: string | null,
): Pick<CSSProperties, "borderRadius" | "background" | "border" | "boxShadow"> {
  const chrome = editorChromeForPlanType(element.type, element.tableShape, preset);
  return {
    borderRadius: chrome.borderRadius,
    background: chrome.background,
    border: editorBaseBorderForPlanType(element.type, preset, zoneColor),
    boxShadow: editorBaseShadowForPlanType(element.type, preset, zoneColor),
  };
}

function readPlanElementRotation(element: Table): number | null {
  const direct = (element as { rotation?: unknown }).rotation;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const metadata = (element as { metadata?: unknown }).metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const raw = (metadata as { rotation?: unknown }).rotation;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

type ReadonlyDecorativeRenderBranch =
  | "readonly-wall"
  | "readonly-bar"
  | "readonly-column"
  | "readonly-pool"
  | "readonly-door"
  | "readonly-planter";

function readonlyDecorativeRenderBranch(
  element: Table,
): ReadonlyDecorativeRenderBranch | null {
  if (element.type === "wall") return "readonly-wall";
  if (element.type === "bar") return "readonly-bar";
  if (element.type === "column") return "readonly-column";
  if (element.type === "pool") return "readonly-pool";
  if (element.type === "door") return "readonly-door";
  if (element.type === "planter") return "readonly-planter";
  return null;
}

function readonlyDecorativeElementStyle(
  element: Table,
  x: number,
  y: number,
  width: number,
  height: number,
): CSSProperties {
  const rotation = readPlanElementRotation(element);
  const baseVisual = getPlanElementBaseVisualStyle(element, "premium");
  const branch = readonlyDecorativeRenderBranch(element);
  const zIndex =
    branch === "readonly-wall"
      ? 3
      : branch === "readonly-pool" || branch === "readonly-planter"
        ? 5
        : branch === "readonly-bar" || branch === "readonly-door"
          ? 8
          : 7;
  return {
    position: "absolute",
    left: x,
    top: y,
    width,
    height,
    boxSizing: "border-box",
    pointerEvents: "none",
    userSelect: "none",
    overflow: "hidden",
    zIndex,
    ...baseVisual,
    ...(branch === "readonly-pool"
      ? {
          borderRadius: Math.min(24, Math.max(10, height / 2)),
          border: "1px solid rgba(56, 189, 248, 0.5)",
          background: [
            "repeating-linear-gradient(105deg, transparent 0, transparent 13px, rgba(255,255,255,0.12) 13px, rgba(255,255,255,0.12) 14px)",
            "radial-gradient(ellipse 95% 70% at 50% 12%, rgba(224, 242, 254, 0.44) 0%, transparent 62%)",
            "linear-gradient(172deg, rgba(56, 189, 248, 0.62) 0%, rgba(14, 116, 144, 0.66) 46%, rgba(8, 47, 73, 0.72) 100%)",
          ].join(", "),
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -10px 18px rgba(8, 47, 73, 0.16), 0 6px 16px rgba(8, 60, 90, 0.2)",
        }
      : {}),
    ...(branch === "readonly-bar"
      ? {
          borderRadius: Math.min(18, Math.max(8, height / 3)),
          border: "1px solid rgba(120, 75, 42, 0.62)",
          background: [
            "linear-gradient(180deg, rgba(255, 244, 219, 0.24) 0%, transparent 24%)",
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 2px, transparent 2px, transparent 18px)",
            "linear-gradient(180deg, rgba(111, 72, 42, 0.98) 0%, rgba(74, 48, 31, 0.99) 52%, rgba(47, 32, 24, 1) 100%)",
          ].join(", "),
          boxShadow:
            "inset 0 3px 0 rgba(251, 226, 184, 0.38), inset 0 -9px 16px rgba(24, 16, 10, 0.34), 0 8px 18px rgba(44, 30, 18, 0.22)",
        }
      : {}),
    ...(branch === "readonly-planter"
      ? {
          borderRadius: Math.min(20, Math.max(9, height / 2)),
          border: "1px solid rgba(45, 110, 72, 0.62)",
          background: [
            "radial-gradient(circle at 12% 34%, rgba(134, 239, 172, 0.96) 0 5px, transparent 6px)",
            "radial-gradient(circle at 28% 24%, rgba(74, 222, 128, 0.92) 0 6px, transparent 7px)",
            "radial-gradient(circle at 46% 36%, rgba(22, 163, 74, 0.94) 0 7px, transparent 8px)",
            "radial-gradient(circle at 65% 25%, rgba(132, 204, 22, 0.9) 0 6px, transparent 7px)",
            "radial-gradient(circle at 82% 36%, rgba(34, 197, 94, 0.92) 0 5px, transparent 6px)",
            "linear-gradient(180deg, rgba(31, 125, 75, 0.96) 0%, rgba(20, 83, 45, 0.96) 52%, rgba(121, 85, 55, 0.96) 53%, rgba(77, 52, 37, 0.98) 100%)",
          ].join(", "),
          boxShadow:
            "inset 0 2px 0 rgba(220, 252, 231, 0.28), inset 0 -7px 11px rgba(48, 31, 19, 0.24), 0 5px 13px rgba(20, 83, 45, 0.2)",
        }
      : {}),
    ...(branch === "readonly-wall"
      ? {
          borderRadius: 3,
          border: "1px solid rgba(15, 23, 42, 0.74)",
          background:
            "linear-gradient(180deg, rgba(51, 55, 50, 0.98) 0%, rgba(20, 23, 24, 1) 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.08), 0 3px 8px rgba(2, 6, 23, 0.18)",
        }
      : {}),
    transform:
      rotation != null && rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: "center center",
  };
}

function renderReadonlyDecorativeElement(
  element: Table,
  elementId: string,
  mapLayoutX: number,
  mapLayoutY: number,
  mapTileWidth: number,
  mapTileHeight: number,
): React.ReactNode {
  const branch = readonlyDecorativeRenderBranch(element);
  if (!branch) return null;
  return (
    <div
      key={elementId}
      aria-hidden
      data-hostly-readonly-decorative-id={elementId}
      data-hostly-readonly-decorative-type={element.type}
      style={readonlyDecorativeElementStyle(
        element,
        mapLayoutX,
        mapLayoutY,
        mapTileWidth,
        mapTileHeight,
      )}
    />
  );
}

export function EditableFloorMap({
  elements,
  editable,
  selectedId = null,
  selectedIds,
  onSelect,
  onMove,
  onMoveMany,
  onResize,
  onRename,
  onCreate,
  createType,
  renderElement,
  editorPlanSurface = false,
  floorSurfacePreset = "ice",
  planSize = null,
  viewportFitElements,
  viewportFitZones,
  viewportFitMode = "plan",
  viewportFitZoomMax,
  viewportFitAlign = "center",
  viewportFitOffsetX = 0,
  viewportFitOffsetY = 0,
  viewportFitZoomMultiplier = 1,
  zones,
  zoneHighlight = "all",
  editingZones = false,
  selectedZoneId = null,
  onSelectZone,
  onMoveZone,
  onResizeZone,
  mapRef,
  onWheel,
  className,
  editorVisualPreset = "default",
  placementRequest = null,
  onPlacementRequestHandled,
  mapAutoFitKey,
  mapAutoFitNonce = 0,
  hideInlineZoomControls = false,
  viewportControlsRef,
  viewportFitPaddingPx,
  mapLayoutEmphasis = false,
  hideZoneOverlays = false,
  selectedIdsRef,
  onSelectionScreenRect,
  onZoneScreenRect,
  onBoxSelect,
  preferredPlacementMapPoint = null,
}: EditableFloorMapProps) {
  const zonesById = (() => {
    const map: Record<string, EditableFloorMapZone> = {};
    if (zones) {
      for (const z of zones) map[z.id] = z;
    }
    return map;
  })();
  const showZoneLayer = !hideZoneOverlays || editingZones;
  const floorRef = useRef<HTMLDivElement | null>(null);
  const spaceHeldRef = useRef(false);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const lastElementRenderDiagnosticSignatureRef = useRef<string | null>(null);
  const lastViewportFitDiagnosticSignatureRef = useRef<string | null>(null);
  const lastPlanterRectDiagnosticSignatureRef = useRef<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const processedPlacementIdsRef = useRef(new Set<number>());
  const [dragGroupSnapshot, setDragGroupSnapshot] = useState<
    Record<string, { x: number; y: number }> | null
  >(null);

  useEffect(() => {
    if (editable) return;
    const decorativeElements = elements.filter((element) =>
      isDecorativePlanElementType(element.type),
    );
    const rows = decorativeElements.slice(0, 32).map((element) => {
      const { w, h } = elementSize(element);
      const renderBranch = readonlyDecorativeRenderBranch(element);
      const style = readonlyDecorativeElementStyle(
        element,
        element.x ?? 0,
        element.y ?? 0,
        w,
        h,
      );
      return {
        id: element.id,
        type: element.type,
        renderBranch,
        computedWidth: w,
        computedHeight: h,
        rotation: readPlanElementRotation(element),
        background: style.background ?? null,
        border: style.border ?? null,
        borderRadius: style.borderRadius ?? null,
        opacity: style.opacity ?? null,
        boxShadow: style.boxShadow ?? null,
        zIndex: style.zIndex ?? null,
        overflow: style.overflow ?? null,
      };
    });
    const signature = JSON.stringify({
      rows,
    });
    if (lastElementRenderDiagnosticSignatureRef.current === signature) return;
    lastElementRenderDiagnosticSignatureRef.current = signature;
    console.info("[TPV][MapDiag] decorative visual renderer", {
      editable,
      editorPlanSurface,
      source: "EditableFloorMap",
      elements: rows,
    });
  }, [editable, editorPlanSurface, elements]);

  useLayoutEffect(() => {
    if (editable) return;
    const root = floorRef.current;
    if (!root) return;
    const planterElements = elements.filter((element) => element.type === "planter");
    if (planterElements.length === 0) return;

    const viewportRect = root.getBoundingClientRect();
    const planterNodes = Array.from(
      root.querySelectorAll<HTMLElement>(
        '[data-hostly-readonly-decorative-type="planter"]',
      ),
    );
    const planterById = new Map(
      planterElements.map((element) => [String(element.id).trim(), element]),
    );
    const rows = planterNodes.map((node) => {
      const id = node.dataset.hostlyReadonlyDecorativeId ?? "";
      const element = planterById.get(id);
      const { w, h } = element ? elementSize(element) : { w: 0, h: 0 };
      const rect = node.getBoundingClientRect();
      const outsideLeft = rect.right < viewportRect.left;
      const outsideRight = rect.left > viewportRect.right;
      const outsideTop = rect.bottom < viewportRect.top;
      const outsideBottom = rect.top > viewportRect.bottom;
      const partiallyClipped =
        rect.left < viewportRect.left ||
        rect.right > viewportRect.right ||
        rect.top < viewportRect.top ||
        rect.bottom > viewportRect.bottom;
      return {
        id,
        type: "planter" as const,
        mapX: element?.x ?? null,
        mapY: element?.y ?? null,
        mapWidth: w,
        mapHeight: h,
        scale: zoom,
        translate: pan,
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        expectedScreenRect: element
          ? {
              left: viewportRect.left + pan.x + (element.x ?? 0) * zoom,
              top: viewportRect.top + pan.y + (element.y ?? 0) * zoom,
              width: w * zoom,
              height: h * zoom,
            }
          : null,
        domRect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        viewportRect: {
          left: viewportRect.left,
          top: viewportRect.top,
          right: viewportRect.right,
          bottom: viewportRect.bottom,
          width: viewportRect.width,
          height: viewportRect.height,
        },
        visibleInViewport:
          !outsideLeft && !outsideRight && !outsideTop && !outsideBottom,
        clipping: {
          outsideLeft,
          outsideRight,
          outsideTop,
          outsideBottom,
          partiallyClipped,
        },
      };
    });
    const missingDomNodes = planterElements
      .filter(
        (element) =>
          !planterNodes.some(
            (node) =>
              node.dataset.hostlyReadonlyDecorativeId === String(element.id).trim(),
          ),
      )
      .map((element) => ({
        id: element.id,
        type: element.type,
        reason: "missingDomNode",
      }));
    const payload = {
      source: "EditableFloorMap",
      scale: zoom,
      translate: pan,
      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
      planterCount: planterElements.length,
      domPlanterCount: planterNodes.length,
      rows,
      missingDomNodes,
    };
    const signature = JSON.stringify(payload);
    if (lastPlanterRectDiagnosticSignatureRef.current === signature) return;
    lastPlanterRectDiagnosticSignatureRef.current = signature;
    console.info("[TPV][MapDiag] planter viewport rects", payload);
  }, [editable, elements, pan, zoom]);

  useEffect(() => {
    if (!placementRequest || !editable || editingZones || !onCreate) return;
    if (processedPlacementIdsRef.current.has(placementRequest.id)) return;
    processedPlacementIdsRef.current.add(placementRequest.id);
    const fr = floorRef.current?.getBoundingClientRect();
    if (!fr) {
      onPlacementRequestHandled?.();
      return;
    }
    const planType = placementRequest.planType;
    const def = getDefaultSizeForPlanElementType(planType);
    const mins = minSizeForPlanType(planType);
    const w = planType === "wall" ? 80 : Math.max(mins.w, def.width);
    const h = planType === "wall" ? 10 : Math.max(mins.h, def.height);
    const staggerIdx = elements.filter((e) =>
      isDecorativePlanElementType(e.type),
    ).length;
    const st = 22;
    const hint = preferredPlacementMapPoint;
    const cx = hint
      ? hint.x
      : (fr.width / 2 - pan.x) / zoom + (staggerIdx % 5) * st;
    const cy = hint
      ? hint.y
      : (fr.height / 2 - pan.y) / zoom + (staggerIdx % 5) * st;
    let x = Math.round(cx - w / 2);
    let y = Math.round(cy - h / 2);
    x = snapToGrid(x);
    y = snapToGrid(y);
    const { x: xClamped, y: yClamped } = clampPositionKeepVisible(
      x,
      y,
      w,
      h,
      fr.width,
      fr.height,
    );
    onCreate(planType, xClamped, yClamped);
    onPlacementRequestHandled?.();
  }, [
    placementRequest,
    editable,
    editingZones,
    onCreate,
    pan.x,
    pan.y,
    zoom,
    elements,
    onPlacementRequestHandled,
    preferredPlacementMapPoint,
  ]);

  const [panSession, setPanSession] = useState<{
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const setFloorRef = useCallback(
    (el: HTMLDivElement | null) => {
      floorRef.current = el;
      assignDomRef(mapRef, el);
    },
    [mapRef],
  );

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const mapFitElementsRef = useRef(viewportFitElements ?? elements);
  const mapFitZonesRef = useRef(viewportFitZones ?? zones ?? []);
  useEffect(() => {
    mapFitElementsRef.current = viewportFitElements ?? elements;
  }, [viewportFitElements, elements]);
  useEffect(() => {
    mapFitZonesRef.current = viewportFitZones ?? zones ?? [];
  }, [viewportFitZones, zones]);

  const logicalPlanWidth =
    planSize &&
    Number.isFinite(planSize.width) &&
    planSize.width > 0
      ? planSize.width
      : null;
  const logicalPlanHeight =
    planSize &&
    Number.isFinite(planSize.height) &&
    planSize.height > 0
      ? planSize.height
      : null;

  const fitPaddingPx = viewportFitPaddingPx ?? VIEW_PADDING_PX;
  const fitZoomMax = viewportFitZoomMax ?? FIT_ZOOM_MAX;

  const applyFitToViewport = useCallback(() => {
    if (!editorPlanSurface) return;
    const root = floorRef.current;
    if (!root) return;
    const vw = root.clientWidth;
    const vh = root.clientHeight;
    if (vw < 32 || vh < 32) return;
    const planBounds = getPlanSizeBounds(planSize);
    const usePlanFit = viewportFitMode === "plan" && planBounds != null;
    const bounds = usePlanFit
      ? planBounds
      : getPlanContentBounds(mapFitElementsRef.current, mapFitZonesRef.current, null);
    let z: number;
    let p: { x: number; y: number };
    if (usePlanFit) {
      const availableWidth = Math.max(32, vw - fitPaddingPx);
      const availableHeight = Math.max(32, vh - fitPaddingPx);
      const rawScale = Math.min(
        availableWidth / bounds.width,
        availableHeight / bounds.height,
      );
      z = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 0.06;
      const renderedWidthForPlan = bounds.width * z;
      const renderedHeightForPlan = bounds.height * z;
      p = {
        x: (vw - renderedWidthForPlan) / 2,
        y: (vh - renderedHeightForPlan) / 2,
      };
    } else {
      ({ zoom: z, pan: p } = fitBoundsToViewport(bounds, vw, vh, {
        paddingPx: fitPaddingPx,
        maxZoom: Math.max(ZOOM_MAX, fitZoomMax),
        fitZoomMax,
        align: viewportFitAlign,
      }));
      if (mapLayoutEmphasis) {
        const cap = Math.min(Math.max(ZOOM_MAX, fitZoomMax), fitZoomMax);
        z = clamp(z * 1.085, 0.06, cap);
      }
      if (
        viewportFitZoomMultiplier !== 1 &&
        Number.isFinite(viewportFitZoomMultiplier) &&
        viewportFitZoomMultiplier > 0
      ) {
        const zoomCeil = Math.max(ZOOM_MAX, fitZoomMax);
        z = clamp(z * viewportFitZoomMultiplier, 0.06, zoomCeil);
      }
      const inset = fitPaddingPx / 2;
      p =
        viewportFitAlign === "start"
          ? {
              x: inset - bounds.minX * z,
              y: inset - bounds.minY * z,
            }
          : {
              x: vw / 2 - bounds.centerX * z,
              y: vh / 2 - bounds.centerY * z,
            };
    }
    if (viewportFitOffsetX !== 0 || viewportFitOffsetY !== 0) {
      p = { x: p.x + viewportFitOffsetX, y: p.y + viewportFitOffsetY };
    }
    setZoom(z);
    setPan(p);
    const renderedWidth = bounds.width * z;
    const renderedHeight = bounds.height * z;
    const planTransformDiagnostic = {
      planWidth: usePlanFit ? bounds.width : null,
      planHeight: usePlanFit ? bounds.height : null,
      viewportWidth: vw,
      viewportHeight: vh,
      padding: fitPaddingPx,
      scale: z,
      translateX: p.x,
      translateY: p.y,
      renderedWidth,
      renderedHeight,
      aspectRatioPreserved:
        bounds.width > 0 &&
        bounds.height > 0 &&
        Math.abs(renderedWidth / renderedHeight - bounds.width / bounds.height) <
          0.0001,
    };
    const planTransformSignature = JSON.stringify(planTransformDiagnostic);
    if (
      lastViewportFitDiagnosticSignatureRef.current !== planTransformSignature
    ) {
      lastViewportFitDiagnosticSignatureRef.current = planTransformSignature;
      console.info(
        "[TPV][MapDiag] plan-to-viewport transform",
        planTransformDiagnostic,
      );
    }
  }, [
    editorPlanSurface,
    fitPaddingPx,
    fitZoomMax,
    mapLayoutEmphasis,
    planSize,
    viewportFitAlign,
    viewportFitOffsetX,
    viewportFitOffsetY,
    viewportFitZoomMultiplier,
    viewportFitMode,
  ]);

  const applyNaturalZoomCentered = useCallback(() => {
    const root = floorRef.current;
    if (!root) return;
    const vw = root.clientWidth;
    const vh = root.clientHeight;
    if (vw < 32 || vh < 32) return;
    const bounds = getPlanContentBounds(
      mapFitElementsRef.current,
      mapFitZonesRef.current,
      viewportFitMode === "plan" ? planSize : null,
    );
    setZoom(1);
    setPan({
      x: vw / 2 - bounds.centerX,
      y: vh / 2 - bounds.centerY,
    });
  }, [planSize, viewportFitMode]);

  const viewportControlsFallbackRef =
    useRef<EditableFloorMapViewportControls | null>(null);
  useImperativeHandle(
    viewportControlsRef ?? viewportControlsFallbackRef,
    () => ({
      zoomIn: () =>
        setZoom((z) => clamp(z + 0.1, ZOOM_MIN, ZOOM_MAX)),
      zoomOut: () =>
        setZoom((z) => clamp(z - 0.1, ZOOM_MIN, ZOOM_MAX)),
      resetNaturalZoom: () => {
        applyNaturalZoomCentered();
      },
      fitToViewport: () => {
        applyFitToViewport();
      },
    }),
    [applyNaturalZoomCentered, applyFitToViewport],
  );

  useLayoutEffect(() => {
    if (!editorPlanSurface) return;
    const root = floorRef.current;
    if (!root) return;
    const run = () => {
      applyFitToViewport();
    };
    const id = requestAnimationFrame(run);
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(run);
    });
    ro.observe(root);
    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, [
    editorPlanSurface,
    mapAutoFitKey,
    mapAutoFitNonce,
    editorVisualPreset,
    applyFitToViewport,
  ]);

  const beginPan = useCallback((e: React.PointerEvent) => {
    const wantsPan =
      e.button === 1 || (e.button === 0 && spaceHeldRef.current);
    if (!wantsPan) return;
    e.preventDefault();
    const p = panRef.current;
    setPanSession({
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: p.x,
      startPanY: p.y,
    });
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (
        t?.closest(
          "input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']",
        )
      ) {
        return;
      }
      e.preventDefault();
      spaceHeldRef.current = true;
      setSpacePressed(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      spaceHeldRef.current = false;
      setSpacePressed(false);
    };
    const onBlur = () => {
      spaceHeldRef.current = false;
      setSpacePressed(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    if (!panSession) return;
    const session = panSession;
    const onMove = (e: PointerEvent) => {
      setPan({
        x: session.startPanX + (e.clientX - session.startClientX),
        y: session.startPanY + (e.clientY - session.startClientY),
      });
    };
    const onUp = () => setPanSession(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [panSession]);

  const [drag, setDrag] = useState<{
    id: string;
    startPx: number;
    startPy: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [resize, setResize] = useState<{
    id: string;
    startPx: number;
    startPy: number;
    origW: number;
    origH: number;
  } | null>(null);
  const [preview, setPreview] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});

  const [zoneDrag, setZoneDrag] = useState<{
    id: string;
    startPx: number;
    startPy: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [zoneResize, setZoneResize] = useState<{
    id: string;
    startPx: number;
    startPy: number;
    origW: number;
    origH: number;
  } | null>(null);
  const [zonePreview, setZonePreview] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});

  const [peerSnapGuides, setPeerSnapGuides] = useState<{
    v: number[];
    h: number[];
  }>({ v: [], h: [] });

  const [marqueeToken, setMarqueeToken] = useState(0);
  const marqueeStartRef = useRef<{ ax: number; ay: number } | null>(null);
  const marqueeEndRef = useRef<{ bx: number; by: number } | null>(null);
  const marqueePointerIdRef = useRef<number | null>(null);
  const elementsForMarqueeRef = useRef(elements);
  useEffect(() => {
    elementsForMarqueeRef.current = elements;
  }, [elements]);
  const [marqueeBox, setMarqueeBox] = useState<{
    ax: number;
    ay: number;
    bx: number;
    by: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const skipBlurSaveRef = useRef(false);
  const activeEditingId = useMemo(() => {
    if (editingZones || !editingId) return null;
    return elements.some((e) => String(e.id).trim() === String(editingId).trim())
      ? editingId
      : null;
  }, [editingZones, editingId, elements]);

  const saveName = useCallback(() => {
    if (skipBlurSaveRef.current) return;
    if (!activeEditingId) return;
    onRename?.(activeEditingId, editingName.trim());
    setEditingId(null);
  }, [activeEditingId, editingName, onRename]);

  const cancelEditName = useCallback(() => {
    skipBlurSaveRef.current = true;
    setEditingId(null);
    queueMicrotask(() => {
      skipBlurSaveRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (!drag && !resize && !zoneDrag && !zoneResize) return;
    const onMoveEv = (e: PointerEvent) => {
      if (drag) {
        const nx =
          drag.origX + (e.clientX - drag.startPx) / zoom;
        const ny =
          drag.origY + (e.clientY - drag.startPy) / zoom;
        const el = elements.find((item) => String(item.id).trim() === drag.id);
        if (!el) {
          setDrag(null);
          setPeerSnapGuides({ v: [], h: [] });
          setPreview((p) => {
            if (!(drag.id in p)) return p;
            const next = { ...p };
            delete next[drag.id];
            return next;
          });
          return;
        }
        const { w, h } = elementSize(el);
        let sx = snapToGrid(nx);
        let sy = snapToGrid(ny);
        let guides = { v: [] as number[], h: [] as number[] };
        if (mapLayoutEmphasis) {
          const r = snapDragPositionToPeers(nx, ny, w, h, drag.id, elements);
          sx = r.x;
          sy = r.y;
          guides = r.guides;
        }
        setPeerSnapGuides(guides);
        const snapGroup = dragGroupSnapshot;
        const deltaX = sx - drag.origX;
        const deltaY = sy - drag.origY;
        setPreview((p) => {
          const next = { ...p };
          if (snapGroup && Object.keys(snapGroup).length > 1) {
            for (const oid of Object.keys(snapGroup)) {
              const elO = elements.find(
                (item) => String(item.id).trim() === oid,
              );
              if (!elO) continue;
              const { w: ow, h: oh } = elementSize(elO);
              const origO = snapGroup[oid];
              const ox = snapToGrid(origO.x + deltaX);
              const oy = snapToGrid(origO.y + deltaY);
              next[oid] = {
                x: ox,
                y: oy,
                w: p[oid]?.w ?? ow,
                h: p[oid]?.h ?? oh,
              };
            }
          } else {
            next[drag.id] = {
              x: sx,
              y: sy,
              w: p[drag.id]?.w ?? w,
              h: p[drag.id]?.h ?? h,
            };
          }
          return next;
        });
      } else if (resize) {
        const el = elements.find((x) => String(x.id).trim() === resize.id);
        if (!el) {
          setResize(null);
          setPreview((p) => {
            if (!(resize.id in p)) return p;
            const next = { ...p };
            delete next[resize.id];
            return next;
          });
          return;
        }
        const mins = minSizeForPlanType(el.type ?? "table");
        let nw = Math.max(
          mins.w,
          resize.origW + (e.clientX - resize.startPx) / zoom,
        );
        let nh = Math.max(
          mins.h,
          resize.origH + (e.clientY - resize.startPy) / zoom,
        );
        nw = snapToGrid(nw);
        nh = snapToGrid(nh);
        nw = Math.max(mins.w, nw);
        nh = Math.max(mins.h, nh);
        const ox = el.x ?? 0;
        const oy = el.y ?? 0;
        setPreview((p) => ({
          ...p,
          [resize.id]: {
            x: p[resize.id]?.x ?? ox,
            y: p[resize.id]?.y ?? oy,
            w: nw,
            h: nh,
          },
        }));
      } else if (zoneDrag) {
        const nx =
          zoneDrag.origX + (e.clientX - zoneDrag.startPx) / zoom;
        const ny =
          zoneDrag.origY + (e.clientY - zoneDrag.startPy) / zoom;
        const z = zonesById[zoneDrag.id];
        const ow =
          z && typeof z.width === "number" && Number.isFinite(z.width)
            ? z.width
            : 260;
        const oh =
          z && typeof z.height === "number" && Number.isFinite(z.height)
            ? z.height
            : 180;
        setZonePreview((p) => ({
          ...p,
          [zoneDrag.id]: {
            x: nx,
            y: ny,
            w: p[zoneDrag.id]?.w ?? ow,
            h: p[zoneDrag.id]?.h ?? oh,
          },
        }));
      } else if (zoneResize) {
        const nw = Math.max(
          120,
          zoneResize.origW + (e.clientX - zoneResize.startPx) / zoom,
        );
        const nh = Math.max(
          90,
          zoneResize.origH + (e.clientY - zoneResize.startPy) / zoom,
        );
        const z = zonesById[zoneResize.id];
        const ox =
          z && typeof z.x === "number" && Number.isFinite(z.x) ? z.x : 40;
        const oy =
          z && typeof z.y === "number" && Number.isFinite(z.y) ? z.y : 40;
        setZonePreview((p) => ({
          ...p,
          [zoneResize.id]: {
            x: p[zoneResize.id]?.x ?? ox,
            y: p[zoneResize.id]?.y ?? oy,
            w: nw,
            h: nh,
          },
        }));
      }
    };
    const onUp = (e: PointerEvent) => {
      if (drag) {
        const nx =
          drag.origX + (e.clientX - drag.startPx) / zoom;
        const ny =
          drag.origY + (e.clientY - drag.startPy) / zoom;
        const el = elements.find((x) => String(x.id).trim() === drag.id);
        const { w, h } = el ? elementSize(el) : { w: 100, h: 80 };
        let sx = snapToGrid(nx);
        let sy = snapToGrid(ny);
        if (mapLayoutEmphasis && el) {
          const r = snapDragPositionToPeers(nx, ny, w, h, drag.id, elements);
          sx = r.x;
          sy = r.y;
        }
        const floorW = logicalPlanWidth ?? floorRef.current?.clientWidth ?? 0;
        const floorH = logicalPlanHeight ?? floorRef.current?.clientHeight ?? 0;
        const snapGroup = dragGroupSnapshot;
        const deltaX = sx - drag.origX;
        const deltaY = sy - drag.origY;

        if (snapGroup && Object.keys(snapGroup).length > 1 && onMoveMany) {
          const updates: { id: string; x: number; y: number }[] = [];
          for (const oid of Object.keys(snapGroup)) {
            const elO = elements.find(
              (item) => String(item.id).trim() === oid,
            );
            if (!elO) continue;
            const os = snapGroup[oid];
            const { w: ow, h: oh } = elementSize(elO);
            const fx = snapToGrid(os.x + deltaX);
            const fy = snapToGrid(os.y + deltaY);
            const pos =
              floorW > 0 && floorH > 0
                ? clampPositionKeepVisible(fx, fy, ow, oh, floorW, floorH)
                : { x: fx, y: fy };
            updates.push({ id: oid, x: Math.round(pos.x), y: Math.round(pos.y) });
          }
          onMoveMany(updates);
        } else if (snapGroup && Object.keys(snapGroup).length > 1) {
          for (const oid of Object.keys(snapGroup)) {
            const elO = elements.find(
              (item) => String(item.id).trim() === oid,
            );
            if (!elO) continue;
            const os = snapGroup[oid];
            const { w: ow, h: oh } = elementSize(elO);
            const fx = snapToGrid(os.x + deltaX);
            const fy = snapToGrid(os.y + deltaY);
            const pos =
              floorW > 0 && floorH > 0
                ? clampPositionKeepVisible(fx, fy, ow, oh, floorW, floorH)
                : { x: fx, y: fy };
            onMove?.(oid, Math.round(pos.x), Math.round(pos.y));
          }
        } else {
          const pos =
            floorW > 0 && floorH > 0
              ? clampPositionKeepVisible(sx, sy, w, h, floorW, floorH)
              : { x: sx, y: sy };
          onMove?.(drag.id, Math.round(pos.x), Math.round(pos.y));
        }
        setDragGroupSnapshot(null);
        setDrag(null);
        setPreview({});
        setPeerSnapGuides({ v: [], h: [] });
      } else if (resize) {
        const el = elements.find((x) => String(x.id).trim() === resize.id);
        const planType = el?.type ?? "table";
        const mins = minSizeForPlanType(planType);
        const floorW = logicalPlanWidth ?? floorRef.current?.clientWidth ?? 0;
        const floorH = logicalPlanHeight ?? floorRef.current?.clientHeight ?? 0;
        const ox = el?.x ?? 0;
        const oy = el?.y ?? 0;
        const rawW = resize.origW + (e.clientX - resize.startPx) / zoom;
        const rawH = resize.origH + (e.clientY - resize.startPy) / zoom;
        const maxW =
          floorW > 0 ? Math.max(mins.w, floorW - ox + mins.w / 2) : rawW;
        const maxH =
          floorH > 0 ? Math.max(mins.h, floorH - oy + mins.h / 2) : rawH;
        let nw = clamp(rawW, mins.w, maxW);
        let nh = clamp(rawH, mins.h, maxH);
        nw = snapToGrid(nw);
        nh = snapToGrid(nh);
        nw = clamp(nw, mins.w, maxW);
        nh = clamp(nh, mins.h, maxH);
        onResize?.(resize.id, Math.round(nw), Math.round(nh));
        setResize(null);
        setPreview({});
        setPeerSnapGuides({ v: [], h: [] });
      } else if (zoneDrag) {
        const nx =
          zoneDrag.origX + (e.clientX - zoneDrag.startPx) / zoom;
        const ny =
          zoneDrag.origY + (e.clientY - zoneDrag.startPy) / zoom;
        const z = zonesById[zoneDrag.id];
        const ow =
          z && typeof z.width === "number" && Number.isFinite(z.width)
            ? z.width
            : 260;
        const oh =
          z && typeof z.height === "number" && Number.isFinite(z.height)
            ? z.height
            : 180;
        const floorW = logicalPlanWidth ?? 0;
        const floorH = logicalPlanHeight ?? 0;
        const pos =
          floorW > 0 && floorH > 0
            ? clampPositionKeepVisible(nx, ny, ow, oh, floorW, floorH)
            : { x: nx, y: ny };
        onMoveZone?.(zoneDrag.id, Math.round(pos.x), Math.round(pos.y));
        setZoneDrag(null);
        setZonePreview({});
      } else if (zoneResize) {
        const rawW = zoneResize.origW + (e.clientX - zoneResize.startPx) / zoom;
        const rawH = zoneResize.origH + (e.clientY - zoneResize.startPy) / zoom;
        const z = zonesById[zoneResize.id];
        const ox =
          z && typeof z.x === "number" && Number.isFinite(z.x) ? z.x : 40;
        const oy =
          z && typeof z.y === "number" && Number.isFinite(z.y) ? z.y : 40;
        const maxW =
          logicalPlanWidth != null ? Math.max(120, logicalPlanWidth - ox) : rawW;
        const maxH =
          logicalPlanHeight != null ? Math.max(90, logicalPlanHeight - oy) : rawH;
        const nw = clamp(
          rawW,
          120,
          maxW,
        );
        const nh = clamp(
          rawH,
          90,
          maxH,
        );
        onResizeZone?.(zoneResize.id, Math.round(nw), Math.round(nh));
        setZoneResize(null);
        setZonePreview({});
      }
    };
    window.addEventListener("pointermove", onMoveEv);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMoveEv);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    drag,
    resize,
    zoneDrag,
    zoneResize,
    onMove,
    onResize,
    onMoveZone,
    onResizeZone,
    elements,
    zonesById,
    zoom,
    mapLayoutEmphasis,
    onMoveMany,
    logicalPlanWidth,
    logicalPlanHeight,
    dragGroupSnapshot,
  ]);

  useLayoutEffect(() => {
    if (!onSelectionScreenRect || !editable || editingZones) {
      onSelectionScreenRect?.(null);
      return;
    }
    const ids =
      selectedIds != null && selectedIds.length > 0
        ? selectedIds.map((s) => String(s).trim())
        : selectedId
          ? [String(selectedId).trim()]
          : [];
    if (ids.length === 0) {
      onSelectionScreenRect(null);
      return;
    }
    const floorEl = floorRef.current;
    if (!floorEl) {
      onSelectionScreenRect(null);
      return;
    }
    const fr = floorEl.getBoundingClientRect();
    const z = zoom;
    const px = pan.x;
    const py = pan.y;
    const idSet = new Set(ids);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of elements) {
      if (!idSet.has(String(el.id).trim())) continue;
      const eid = String(el.id).trim();
      const pv = preview[eid];
      const { w, h } = elementSize(el);
      const ex = pv?.x ?? (el.x ?? 0);
      const ey = pv?.y ?? (el.y ?? 0);
      const ww = pv?.w ?? w;
      const hh = pv?.h ?? h;
      minX = Math.min(minX, ex);
      minY = Math.min(minY, ey);
      maxX = Math.max(maxX, ex + ww);
      maxY = Math.max(maxY, ey + hh);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      onSelectionScreenRect(null);
      return;
    }
    onSelectionScreenRect({
      left: fr.left + px + minX * z,
      top: fr.top + py + minY * z,
      width: (maxX - minX) * z,
      height: (maxY - minY) * z,
    });
  }, [
    onSelectionScreenRect,
    editable,
    editingZones,
    elements,
    selectedIds,
    selectedId,
    preview,
    zoom,
    pan.x,
    pan.y,
  ]);

  useLayoutEffect(() => {
    if (!onZoneScreenRect || !editable || !editingZones || !selectedZoneId) {
      onZoneScreenRect?.(null);
      return;
    }
    const zlist = zones;
    if (!zlist) {
      onZoneScreenRect(null);
      return;
    }
    const zone = zlist.find((zz) => zz.id === selectedZoneId);
    if (
      !zone ||
      typeof zone.x !== "number" ||
      typeof zone.y !== "number" ||
      typeof zone.width !== "number" ||
      typeof zone.height !== "number" ||
      !Number.isFinite(zone.x) ||
      !Number.isFinite(zone.y) ||
      !Number.isFinite(zone.width) ||
      !Number.isFinite(zone.height)
    ) {
      onZoneScreenRect(null);
      return;
    }
    const floorEl = floorRef.current;
    if (!floorEl) {
      onZoneScreenRect(null);
      return;
    }
    const fr = floorEl.getBoundingClientRect();
    const zm = zoom;
    const px = pan.x;
    const py = pan.y;
    const pv = zonePreview[zone.id];
    const zx = pv?.x ?? zone.x;
    const zy = pv?.y ?? zone.y;
    const zw = pv?.w ?? zone.width;
    const zh = pv?.h ?? zone.height;
    onZoneScreenRect({
      left: fr.left + px + zx * zm,
      top: fr.top + py + zy * zm,
      width: zw * zm,
      height: zh * zm,
    });
  }, [
    onZoneScreenRect,
    editable,
    editingZones,
    selectedZoneId,
    zones,
    zonePreview,
    zoom,
    pan.x,
    pan.y,
  ]);

  useLayoutEffect(() => {
    if (!editable) return;
    const el = floorRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.94 : 1.06;
        setZoom((z) => clamp(z * factor, ZOOM_MIN, ZOOM_MAX));
        return;
      }
      onWheel?.(e as unknown as ReactWheelEvent<HTMLDivElement>);
    };
    el.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", onNativeWheel);
  }, [editable, onWheel]);

  const handleFloorPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!editable) return;
      if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
        beginPan(e);
        return;
      }
      if (e.target !== e.currentTarget) return;
      if (editingZones) return;
      const fr = floorRef.current?.getBoundingClientRect();
      if (!fr) return;
      const x = (e.clientX - fr.left - pan.x) / zoom;
      const y = (e.clientY - fr.top - pan.y) / zoom;
      if (e.shiftKey && onBoxSelect) {
        e.preventDefault();
        marqueeStartRef.current = { ax: x, ay: y };
        marqueeEndRef.current = { bx: x, by: y };
        marqueePointerIdRef.current = e.pointerId;
        setMarqueeBox({ ax: x, ay: y, bx: x, by: y });
        setMarqueeToken((t) => t + 1);
        try {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
        return;
      }
      if (!onCreate || !createType) return;
      onCreate(createType, x, y);
    },
    [
      editable,
      onCreate,
      editingZones,
      createType,
      zoom,
      pan.x,
      pan.y,
      beginPan,
      onBoxSelect,
    ],
  );

  useEffect(() => {
    if (!marqueeToken) return;
    const onMovePtr = (ev: PointerEvent) => {
      const floor = floorRef.current;
      if (!floor) return;
      const fr = floor.getBoundingClientRect();
      const p = panRef.current;
      const z = zoomRef.current;
      const bx = (ev.clientX - fr.left - p.x) / z;
      const by = (ev.clientY - fr.top - p.y) / z;
      marqueeEndRef.current = { bx, by };
      const start = marqueeStartRef.current;
      if (start) {
        setMarqueeBox({ ax: start.ax, ay: start.ay, bx, by });
      }
    };
    const finish = () => {
      const start = marqueeStartRef.current;
      const end = marqueeEndRef.current;
      const pid = marqueePointerIdRef.current;
      marqueeStartRef.current = null;
      marqueeEndRef.current = null;
      marqueePointerIdRef.current = null;
      setMarqueeBox(null);
      setMarqueeToken(0);
      try {
        const floor = floorRef.current;
        if (floor && pid != null) {
          floor.releasePointerCapture(pid);
        }
      } catch {
        /* noop */
      }
      if (!start || !end || !onBoxSelect) return;
      const [x1, x2] = [start.ax, end.bx].sort((a, b) => a - b);
      const [y1, y2] = [start.ay, end.by].sort((a, b) => a - b);
      if (Math.abs(x2 - x1) < 6 && Math.abs(y2 - y1) < 6) return;
      const ids: string[] = [];
      for (const fel of elementsForMarqueeRef.current) {
        const { w, h } = elementSize(fel);
        const ex = fel.x ?? 0;
        const ey = fel.y ?? 0;
        const intersects = !(ex + w < x1 || ex > x2 || ey + h < y1 || ey > y2);
        if (intersects) ids.push(String(fel.id).trim());
      }
      if (ids.length > 0) {
        queueMicrotask(() => {
          onBoxSelect(ids);
        });
      }
    };
    window.addEventListener("pointermove", onMovePtr);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", onMovePtr);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [marqueeToken, onBoxSelect]);

  const viewportSurfaceStyle: CSSProperties | undefined =
    editorPlanSurface
      ? editorVisualPreset === "premium"
        ? (() => {
            const surface =
              FLOOR_SURFACE_PRESETS[floorSurfacePreset] ??
              FLOOR_SURFACE_PRESETS.ice;
            return {
              backgroundColor: surface.color,
              backgroundImage: surface.image,
              backgroundSize: "100% 100%",
              backgroundPosition: "0 0",
            };
          })()
        : {
            backgroundColor: "rgba(15, 23, 42, 0.5)",
            backgroundImage: [
              "linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px)",
              "linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
            backgroundPosition: "0 0",
          }
      : undefined;

  const logicalFrameStyle: CSSProperties | null =
    editorPlanSurface && logicalPlanWidth != null && logicalPlanHeight != null
      ? {
          position: "absolute",
          left: 0,
          top: 0,
          width: logicalPlanWidth,
          height: logicalPlanHeight,
          boxSizing: "border-box",
          border:
            editorVisualPreset === "premium"
              ? "1px solid rgba(71, 85, 105, 0.16)"
              : "1px dashed rgba(148, 163, 184, 0.28)",
          borderRadius: editorVisualPreset === "premium" ? 22 : 16,
          pointerEvents: "none",
          zIndex: 0,
          boxShadow:
            editorVisualPreset === "premium"
              ? "inset 0 0 0 1px rgba(255,255,255,0.18)"
              : undefined,
        }
      : null;

  if (!editable) {
    const hasReadonlyDecorativeElements = elements.some(
      (element) => readonlyDecorativeRenderBranch(element) != null,
    );
    if (!renderElement && !hasReadonlyDecorativeElements) return null;
    return (
      <div
        ref={setFloorRef}
        className={className}
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
          zIndex: 2,
          ...viewportSurfaceStyle,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {logicalFrameStyle ? <div aria-hidden style={logicalFrameStyle} /> : null}
          {zones && showZoneLayer
            ? zones.map((z) => {
                const hasRect =
                  typeof z.x === "number" &&
                  typeof z.y === "number" &&
                  typeof z.width === "number" &&
                  typeof z.height === "number" &&
                  Number.isFinite(z.x) &&
                  Number.isFinite(z.y) &&
                  Number.isFinite(z.width) &&
                  Number.isFinite(z.height);
                if (!hasRect) return null;
                const inferred =
                  editorVisualPreset === "premium"
                    ? inferSpatialAreaVisual(z.name)
                    : null;
                const border = z.color
                  ? `1px solid ${z.color}`
                  : inferred
                    ? `1px solid ${inferred.border}`
                    : "1px solid rgba(148, 163, 184, 0.18)";
                const bg = z.color
                  ? editorVisualPreset === "premium"
                    ? `${z.color}1C`
                    : `${z.color}14`
                  : inferred
                    ? inferred.fill
                    : "rgba(148, 163, 184, 0.05)";
                return (
                  <div
                    key={z.id}
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: z.x,
                      top: z.y,
                      width: z.width,
                      height: z.height,
                      boxSizing: "border-box",
                      borderRadius: editorVisualPreset === "premium" ? 18 : 14,
                      border,
                      background: bg,
                      zIndex: 1,
                      pointerEvents: "none",
                      userSelect: "none",
                      boxShadow:
                        editorVisualPreset === "premium"
                          ? "inset 0 1px 0 rgba(255,255,255,0.08)"
                          : undefined,
                    }}
                  />
                );
              })
            : null}
          {elements.map((element) => {
            const elementId = String(element.id).trim();
            const { w, h } = elementSize(element);
            const mapLayoutX = element.x ?? 0;
            const mapLayoutY = element.y ?? 0;
            const readonlyDecorative = renderReadonlyDecorativeElement(
              element,
              elementId,
              mapLayoutX,
              mapLayoutY,
              w,
              h,
            );
            if (readonlyDecorative) {
              return <Fragment key={element.id}>{readonlyDecorative}</Fragment>;
            }
            if (!renderElement) return null;
            return (
              <Fragment key={element.id}>
                {renderElement({
                  element,
                  elementId,
                  mapLayoutX,
                  mapLayoutY,
                  mapTileWidth: w,
                  mapTileHeight: h,
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setFloorRef}
      className={className}
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        width: "100%",
        overflow: "hidden",
        zIndex: 2,
        ...viewportSurfaceStyle,
      }}
    >
      {!hideInlineZoomControls ? (
      <div
        style={{
          position: "absolute",
          ...(editorVisualPreset === "premium"
            ? { bottom: 8, right: 8, top: "auto" }
            : { top: 6, right: 6 }),
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          gap: editorVisualPreset === "premium" ? 0 : 4,
          pointerEvents: "auto",
          opacity: editorVisualPreset === "premium" ? 1 : 0.88,
          ...(editorVisualPreset === "premium"
            ? {
                padding: "2px 4px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.06)",
                background: "rgba(15, 23, 42, 0.38)",
                boxShadow:
                  "0 2px 12px rgba(2, 6, 23, 0.14), inset 0 1px 0 rgba(255,255,255,0.04)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }
            : {}),
        }}
      >
        {editorVisualPreset === "premium" ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 20,
            }}
          >
            <button
              type="button"
              aria-label="Alejar"
              onClick={() =>
                setZoom((z) => clamp(z - 0.1, ZOOM_MIN, ZOOM_MAX))
              }
              style={{
                border: "none",
                borderRight: "1px solid rgba(148, 163, 184, 0.12)",
                background: "transparent",
                color: "#94a3b8",
                fontSize: 12,
                fontWeight: 500,
                minWidth: 22,
                padding: "0 5px",
                cursor: "pointer",
                lineHeight: 1,
                borderRadius: "10px 0 0 10px",
              }}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Acercar"
              onClick={() =>
                setZoom((z) => clamp(z + 0.1, ZOOM_MIN, ZOOM_MAX))
              }
              style={{
                border: "none",
                borderRight: "1px solid rgba(148, 163, 184, 0.12)",
                background: "transparent",
                color: "#94a3b8",
                fontSize: 12,
                fontWeight: 500,
                minWidth: 22,
                padding: "0 5px",
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Restablecer zoom al 100%"
              title="100%"
              onClick={applyNaturalZoomCentered}
              style={{
                border: "none",
                borderRight: "1px solid rgba(148, 163, 184, 0.12)",
                background: "transparent",
                color: "#64748b",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.03em",
                minWidth: 36,
                padding: "0 5px",
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Centrar plano"
              onClick={applyFitToViewport}
              style={{
                border: "none",
                background: "transparent",
                color: "#64748b",
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "0 7px",
                cursor: "pointer",
                lineHeight: 1,
                borderRadius: "0 10px 10px 0",
              }}
            >
              Centrar
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              aria-label="Acercar"
              onClick={() =>
                setZoom((z) => clamp(z + 0.1, ZOOM_MIN, ZOOM_MAX))
              }
              style={{
                minWidth: 28,
                height: 28,
                padding: "0 7px",
                borderRadius: 7,
                border: "1px solid rgba(148, 163, 184, 0.22)",
                background: "rgba(15, 23, 42, 0.55)",
                color: "#cbd5e1",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Alejar"
              onClick={() =>
                setZoom((z) => clamp(z - 0.1, ZOOM_MIN, ZOOM_MAX))
              }
              style={{
                minWidth: 28,
                height: 28,
                padding: "0 7px",
                borderRadius: 7,
                border: "1px solid rgba(148, 163, 184, 0.22)",
                background: "rgba(15, 23, 42, 0.55)",
                color: "#cbd5e1",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Restablecer zoom"
              onClick={applyNaturalZoomCentered}
              style={{
                height: 28,
                padding: "0 7px",
                borderRadius: 7,
                border: "1px solid rgba(148, 163, 184, 0.2)",
                background: "rgba(15, 23, 42, 0.45)",
                color: "#94a3b8",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
            <button
              type="button"
              aria-label="Centrar plano"
              onClick={applyFitToViewport}
              style={{
                height: 28,
                padding: "0 7px",
                borderRadius: 7,
                border: "1px solid rgba(148, 163, 184, 0.2)",
                background: "rgba(15, 23, 42, 0.45)",
                color: "#94a3b8",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Centrar
            </button>
          </>
        )}
      </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "top left",
          transition: panSession ? undefined : "transform 0.15s ease-out",
          cursor: panSession ? "grabbing" : spacePressed ? "grab" : "default",
        }}
      >
      {logicalFrameStyle ? <div aria-hidden style={logicalFrameStyle} /> : null}
      <div
        onPointerDown={handleFloorPointerDown}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
        }}
      />
      {marqueeBox ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: Math.min(marqueeBox.ax, marqueeBox.bx),
            top: Math.min(marqueeBox.ay, marqueeBox.by),
            width: Math.abs(marqueeBox.bx - marqueeBox.ax),
            height: Math.abs(marqueeBox.by - marqueeBox.ay),
            border: "1px dashed rgba(56, 189, 248, 0.55)",
            background: "rgba(56, 189, 248, 0.07)",
            borderRadius: 4,
            pointerEvents: "none",
            zIndex: 5,
            transition: "opacity 140ms ease",
          }}
        />
      ) : null}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          minHeight: 0,
          pointerEvents: "none",
        }}
      >
        {zones && showZoneLayer
          ? zones.map((z) => {
              const hasRect =
                typeof z.x === "number" &&
                typeof z.y === "number" &&
                typeof z.width === "number" &&
                typeof z.height === "number" &&
                Number.isFinite(z.x) &&
                Number.isFinite(z.y) &&
                Number.isFinite(z.width) &&
                Number.isFinite(z.height);
              if (!hasRect) return null;
              const pv = zonePreview[z.id];
              const x = pv?.x ?? (z.x as number);
              const y = pv?.y ?? (z.y as number);
              const w = pv?.w ?? (z.width as number);
              const h = pv?.h ?? (z.height as number);
              const selected = selectedZoneId === z.id;
              const inferred =
                editorVisualPreset === "premium"
                  ? inferSpatialAreaVisual(z.name)
                  : null;
              const border = z.color
                ? `1px solid ${z.color}`
                : inferred
                  ? `1px solid ${inferred.border}`
                  : "1px solid rgba(148, 163, 184, 0.24)";
              const bg = z.color
                ? editorVisualPreset === "premium"
                  ? `${z.color}22`
                  : `${z.color}1A`
                : inferred
                  ? inferred.fill
                  : editorVisualPreset === "premium"
                    ? "linear-gradient(160deg, rgba(245, 240, 230, 0.08) 0%, rgba(86, 78, 68, 0.12) 100%)"
                    : "rgba(148, 163, 184, 0.06)";
              return (
                <div
                  key={z.id}
                  style={{
                    position: "absolute",
                    left: x,
                    top: y,
                    width: w,
                    height: h,
                    boxSizing: "border-box",
                    borderRadius: editorVisualPreset === "premium" ? 18 : 14,
                    border: selected ? "1.5px solid rgba(56, 189, 248, 0.55)" : border,
                    background: bg,
                    zIndex: editingZones ? (selected ? 24 : 20) : mapLayoutEmphasis ? 1 : 3,
                    pointerEvents: editingZones ? "auto" : "none",
                    userSelect: "none",
                    touchAction: "none",
                    transition: "opacity 140ms ease-out, box-shadow 140ms ease-out",
                    opacity: 1,
                    boxShadow:
                      editorVisualPreset === "premium"
                        ? [
                            "inset 0 1px 0 rgba(255,255,255,0.08)",
                            "inset 0 0 0 1px rgba(255,255,255,0.06)",
                            "inset 0 -12px 24px rgba(80, 70, 56, 0.025)",
                          ].join(", ")
                        : undefined,
                  }}
                  onPointerDown={(e) => {
                    if (!editingZones) return;
                    if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
                      e.preventDefault();
                      e.stopPropagation();
                      beginPan(e);
                      return;
                    }
                    e.stopPropagation();
                    onSelectZone?.(z.id);
                    setZoneDrag({
                      id: z.id,
                      startPx: e.clientX,
                      startPy: e.clientY,
                      origX: x,
                      origY: y,
                    });
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: editorVisualPreset === "premium" ? 12 : 6,
                      left: editorVisualPreset === "premium" ? 14 : 8,
                      fontSize: editorVisualPreset === "premium" ? 11 : 10,
                      fontWeight: editorVisualPreset === "premium" ? 650 : 800,
                      letterSpacing: editorVisualPreset === "premium" ? "0.14em" : "0.04em",
                      textTransform: "uppercase",
                      fontFamily:
                        editorVisualPreset === "premium"
                          ? 'ui-sans-serif, system-ui, "Segoe UI", sans-serif'
                          : undefined,
                      color:
                        editorVisualPreset === "premium" && inferred
                          ? inferred.labelTint
                          : "#e2e8f0",
                      padding: editorVisualPreset === "premium" ? "4px 10px" : "2px 8px",
                      borderRadius: editorVisualPreset === "premium" ? 7 : 999,
                      background:
                        editorVisualPreset === "premium" && inferred
                          ? inferred.labelPlate
                          : editorVisualPreset === "premium"
                            ? "rgba(18, 18, 16, 0.42)"
                            : "rgba(15, 23, 42, 0.55)",
                      border:
                        editorVisualPreset === "premium"
                          ? "1px solid rgba(255,255,255,0.08)"
                          : "1px solid rgba(148, 163, 184, 0.22)",
                      boxShadow:
                        editorVisualPreset === "premium"
                          ? "0 1px 2px rgba(2, 6, 23, 0.18)"
                          : undefined,
                      pointerEvents: "none",
                      maxWidth: "calc(100% - 20px)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {z.name}
                  </span>
                  {editingZones ? (
                    <button
                      type="button"
                      aria-label="Redimensionar zona"
                      onPointerDown={(e) => {
                        if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
                          e.preventDefault();
                          e.stopPropagation();
                          beginPan(e);
                          return;
                        }
                        e.stopPropagation();
                        onSelectZone?.(z.id);
                        setZoneResize({
                          id: z.id,
                          startPx: e.clientX,
                          startPy: e.clientY,
                          origW: w,
                          origH: h,
                        });
                      }}
                      style={{
                        position: "absolute",
                        right: 0,
                        bottom: 0,
                        width: 14,
                        height: 14,
                        padding: 0,
                        border: "none",
                        borderRadius: "0 0 14px 0",
                        background: "rgba(15, 23, 42, 0.5)",
                        cursor: "nwse-resize",
                        pointerEvents: "auto",
                      }}
                    />
                  ) : null}
                </div>
              );
            })
          : null}
        {mapLayoutEmphasis &&
        (peerSnapGuides.v.length > 0 || peerSnapGuides.h.length > 0) ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 8,
            }}
          >
            {peerSnapGuides.v.map((gx, i) => (
              <div
                key={`snapv-${i}-${gx}`}
                style={{
                  position: "absolute",
                  left: gx,
                  top: -80,
                  width: 1,
                  height: 5200,
                  background: "rgba(125, 211, 252, 0.36)",
                  transition: "opacity 140ms ease-out",
                }}
              />
            ))}
            {peerSnapGuides.h.map((gy, i) => (
              <div
                key={`snaph-${i}-${gy}`}
                style={{
                  position: "absolute",
                  left: -80,
                  top: gy,
                  width: 5200,
                  height: 1,
                  background: "rgba(125, 211, 252, 0.36)",
                  transition: "opacity 140ms ease-out",
                }}
              />
            ))}
          </div>
        ) : null}
        {elements.map((element) => {
          const elementId = String(element.id).trim();
          const { w: dw, h: dh } = elementSize(element);
          const pv = preview[elementId];
          const baseX = element.x ?? 0;
          const baseY = element.y ?? 0;
          const mapLayoutX = pv?.x ?? baseX;
          const mapLayoutY = pv?.y ?? baseY;
          const mapTileWidth = pv?.w ?? dw;
          const mapTileHeight = pv?.h ?? dh;
          const selected =
            selectedIds != null && selectedIds.length > 0
              ? selectedIds.some((s) => String(s).trim() === elementId)
              : selectedId === elementId;
          const locked = element.locked === true;
          const snapLive = dragGroupSnapshot;
          const inMultiDrag =
            drag != null &&
            snapLive != null &&
            Object.keys(snapLive).length > 1 &&
            snapLive[elementId] != null;
          const isBeingDragged =
            mapLayoutEmphasis &&
            drag != null &&
            (inMultiDrag || String(drag.id).trim() === elementId) &&
            (mapLayoutX !== baseX || mapLayoutY !== baseY);
          const zoneIdStr =
            typeof element.zoneId === "string" && element.zoneId.trim() !== ""
              ? element.zoneId.trim()
              : "";
          const zoneInfo = zoneIdStr ? zonesById[zoneIdStr] : undefined;
          const zoneNameFallback =
            typeof element.zoneName === "string" && element.zoneName.trim() !== ""
              ? element.zoneName.trim()
              : undefined;
          const zoneDisplayName = zoneInfo?.name ?? zoneNameFallback;
          const zoneColor = zoneInfo?.color;
          const baseVisual = getPlanElementBaseVisualStyle(
            element,
            editorVisualPreset,
            zoneColor,
          );
          const hasZone = !!zoneIdStr || !!zoneNameFallback;

          let dimmed = false;
          if (zoneHighlight !== "all") {
            if (zoneHighlight === "unassigned") {
              dimmed = hasZone;
            } else {
              dimmed = zoneIdStr !== zoneHighlight;
            }
          }
          let displayOpacity = selected ? 1 : dimmed ? 0.32 : 0.9;
          if (locked && !selected) displayOpacity *= 0.92;

          const normalBorder = String(baseVisual.border ?? "1px solid var(--hostly-line)");
          const darkDecorLabel =
            element.type === "bar" ||
            element.type === "column" ||
            element.type === "wall" ||
            element.type === "pool" ||
            element.type === "door" ||
            element.type === "planter";
          const operativoSuperficie =
            element.type === "table" ||
            element.type === "sunbed" ||
            element.type === "bed" ||
            element.type === "custom";
          const editorOperativoLabelPx =
            editorPlanSurface && operativoSuperficie
              ? editorOperativoSurfaceLabelFontPx(
                  mapTileWidth,
                  mapTileHeight,
                  selected,
                )
              : null;
          if (
            editorVisualPreset === "premium" &&
            operativoSuperficie &&
            !selected &&
            !dimmed
          ) {
            displayOpacity *= mapLayoutEmphasis ? 0.98 : 0.94;
          }
          const tileBorder = selected
            ? editorVisualPreset === "premium" && operativoSuperficie
              ? mapLayoutEmphasis
                ? "1px solid rgba(56, 189, 248, 0.62)"
                : "1px solid rgba(125, 211, 252, 0.58)"
              : "3px solid #38bdf8"
            : locked
              ? zoneColor
                ? `1px dashed ${zoneColor}`
                : `1px dashed rgba(148, 163, 184, 0.55)`
              : normalBorder;

          return (
            <div
              key={element.id}
              className="hostly-floor-editor-element"
              data-hostly-editor-selected={selected ? "true" : undefined}
              data-hostly-editor-type={element.type}
              style={{
                position: "absolute",
                left: mapLayoutX,
                top: mapLayoutY,
                width: mapTileWidth,
                height: mapTileHeight,
                boxSizing: "border-box",
                borderRadius: baseVisual.borderRadius,
                background: baseVisual.background,
                border: tileBorder,
                boxShadow:
                  editorVisualPreset === "premium"
                    ? selected
                      ? operativoSuperficie
                        ? mapLayoutEmphasis
                          ? "inset 0 1px 0 rgba(255,255,255,0.34), 0 2px 5px rgba(40, 34, 26, 0.13), 0 0 0 2px rgba(125, 211, 252, 0.1)"
                          : "inset 0 1px 0 rgba(255,255,255,0.34), 0 0 0 1px rgba(125, 211, 252, 0.12), 0 5px 12px rgba(40, 34, 26, 0.13)"
                        : "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px rgba(90, 100, 118, 0.2), 0 5px 12px rgba(2, 6, 23, 0.16)"
                      : locked
                        ? "inset 0 0 0 1px rgba(148, 163, 184, 0.1), 0 3px 10px rgba(2, 6, 23, 0.16)"
                        : zoneColor
                          ? `inset 0 1px 0 ${zoneColor}33, 0 4px 10px rgba(2, 6, 23, 0.12)`
                          : element.type === "pool"
                            ? "inset 0 1px 0 rgba(255,255,255,0.08), 0 5px 14px rgba(8, 60, 90, 0.14), 0 2px 6px rgba(2, 6, 23, 0.12)"
                            : element.type === "bar"
                              ? "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -7px 14px rgba(0,0,0,0.22), 0 5px 12px rgba(40, 34, 26, 0.18), 0 1px 3px rgba(0,0,0,0.12)"
                            : operativoSuperficie
                              ? mapLayoutEmphasis
                                ? "inset 0 1px 0 rgba(255,255,255,0.24), 0 1px 2px rgba(40, 34, 26, 0.08)"
                                : "inset 0 1px 0 rgba(255,255,255,0.22), 0 3px 8px rgba(40, 34, 26, 0.1), 0 1px 2px rgba(40, 34, 26, 0.06)"
                              : isDecorativePlanElementType(element.type)
                                ? "inset 0 1px 0 rgba(255,255,255,0.05), 0 3px 9px rgba(2, 6, 23, 0.16), 0 1px 3px rgba(2, 6, 23, 0.1)"
                                : "0 3px 10px rgba(2, 6, 23, 0.14)"
                    : selected
                      ? "0 0 0 4px rgba(56, 189, 248, 0.22), 0 10px 28px rgba(15, 23, 42, 0.32), 0 4px 12px rgba(56, 189, 248, 0.28)"
                      : locked
                        ? "inset 0 0 0 1px rgba(148, 163, 184, 0.12), 0 1px 2px rgba(15, 23, 42, 0.1)"
                        : zoneColor
                          ? `inset 0 3px 0 ${zoneColor}, 0 1px 2px rgba(15, 23, 42, 0.12)`
                          : "0 1px 2px rgba(15, 23, 42, 0.12)",
                opacity: displayOpacity,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap:
                  editorOperativoLabelPx != null
                    ? Math.max(1, Math.round(editorOperativoLabelPx * 0.12))
                    : 2,
                cursor: panSession
                  ? "grabbing"
                  : spacePressed
                    ? "grab"
                    : locked
                      ? "default"
                      : "grab",
                userSelect: "none",
                touchAction: "none",
                zIndex: (() => {
                  const tableLike =
                    element.type === "table" ||
                    element.type === "sunbed" ||
                    element.type === "bed" ||
                    element.type === "custom";
                  if (
                    activeEditingId != null &&
                    String(activeEditingId).trim() === elementId
                  )
                    return 40;
                  if (selected) return tableLike ? 34 : 26;
                  if (dimmed) return 4;
                  if (tableLike) return mapLayoutEmphasis ? 18 : 16;
                  if (
                    editorVisualPreset === "premium" &&
                    element.type === "bar" &&
                    !selected
                  )
                    return mapLayoutEmphasis ? 8 : 13;
                  if (element.type === "wall") return mapLayoutEmphasis ? 3 : 7;
                  if (element.type === "door") return mapLayoutEmphasis ? 8 : 11;
                  if (isDecorativePlanElementType(element.type))
                    return mapLayoutEmphasis ? 5 : 9;
                  return 12;
                })(),
                pointerEvents: "auto",
                transform:
                  selected
                    ? `scale(${
                        editorVisualPreset === "premium"
                          ? isDecorativePlanElementType(element.type)
                            ? 1.005
                            : operativoSuperficie
                              ? mapLayoutEmphasis
                                ? 1.014
                                : 1.03
                              : 1.02
                          : isDecorativePlanElementType(element.type)
                            ? 1.01
                            : 1.02
                      })`
                    : editorVisualPreset === "premium" && operativoSuperficie
                      ? mapLayoutEmphasis
                        ? "scale(1)"
                        : "scale(1.042)"
                      : undefined,
                transformOrigin: "center center",
                transition:
                  "opacity 140ms ease-out, box-shadow 140ms ease-out, transform 140ms ease-out, border-color 140ms ease-out, filter 140ms ease-out",
                filter: isBeingDragged
                  ? "drop-shadow(0 10px 18px rgba(2, 6, 23, 0.22))"
                  : undefined,
              }}
              onDoubleClick={(e) => {
                if (editingZones) return;
                if (locked) return;
                if (!onRename) return;
                e.stopPropagation();
                setEditingId(elementId);
                setEditingName(
                  typeof element.name === "string" ? element.name : "",
                );
              }}
              onPointerDown={(e) => {
                if (editingZones) return;
                if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
                  e.preventDefault();
                  e.stopPropagation();
                  beginPan(e);
                  return;
                }
                if (
                  activeEditingId != null &&
                  String(activeEditingId).trim() === elementId
                ) {
                  e.stopPropagation();
                  return;
                }
                e.stopPropagation();
                const tid = elementId;
                let nextSel: string[];
                if (e.shiftKey && selectedIds != null && selectedIds.length > 0) {
                  const trimmed = selectedIds.map((s) => String(s).trim());
                  const i = trimmed.indexOf(tid);
                  nextSel =
                    i >= 0
                      ? selectedIds.filter((_, idx) => idx !== i)
                      : [...selectedIds, tid];
                } else {
                  nextSel = [tid];
                }

                const dragIds = nextSel
                  .map((s) => String(s).trim())
                  .filter((sid) => {
                    const hit = elements.find(
                      (hitEl) => String(hitEl.id).trim() === sid,
                    );
                    return hit && hit.locked !== true;
                  });

                setDragGroupSnapshot(null);
                if (dragIds.length > 1) {
                  const snap: Record<string, { x: number; y: number }> = {};
                  for (const sid of dragIds) {
                    const hit = elements.find(
                      (hitEl) => String(hitEl.id).trim() === sid,
                    );
                    if (!hit) continue;
                    snap[sid] = { x: hit.x ?? 0, y: hit.y ?? 0 };
                  }
                  if (Object.keys(snap).length > 1) {
                    setDragGroupSnapshot(snap);
                  }
                }

                onSelect?.(elementId, { shiftKey: e.shiftKey });
                if (locked) return;
                setDrag({
                  id: elementId,
                  startPx: e.clientX,
                  startPy: e.clientY,
                  origX: mapLayoutX,
                  origY: mapLayoutY,
                });
              }}
            >
              {editorPlanSurface && element.type === "table" ? (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 0,
                    borderRadius: baseVisual.borderRadius,
                    overflow: "hidden",
                    pointerEvents: "none",
                  }}
                >
                  {mapTableChairLayouts(
                    mapTileWidth,
                    mapTileHeight,
                    element.tableShape,
                    mapTableSeatCount(element),
                  ).map((layout, chairIdx) => (
                    <span
                      key={chairIdx}
                      style={{
                        position: "absolute",
                        left: layout.left,
                        top: layout.top,
                        width: layout.width,
                        height: layout.height,
                        boxSizing: "border-box",
                        borderRadius: 999,
                        background:
                          editorVisualPreset === "premium"
                            ? "linear-gradient(180deg, rgba(232, 225, 213, 0.72) 0%, rgba(198, 188, 172, 0.62) 100%)"
                            : MAP_TABLE_CHAIR_FILL,
                        border:
                          editorVisualPreset === "premium"
                            ? "1px solid rgba(120, 113, 104, 0.18)"
                            : MAP_TABLE_CHAIR_BORDER,
                        boxShadow:
                          editorVisualPreset === "premium"
                            ? "inset 0 1px 0 rgba(255,255,255,0.24), 0 1px 1px rgba(40, 34, 26, 0.08)"
                            : MAP_TABLE_CHAIR_SHADOW,
                        transform: `rotate(${layout.rotation}deg)`,
                        transformOrigin: "center center",
                      }}
                    />
                  ))}
                </span>
              ) : null}
              {editorPlanSurface &&
              editorVisualPreset === "premium" &&
              element.type === "bar" ? (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    zIndex: 1,
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "rgba(248, 250, 252, 0.68)",
                  }}
                >
                  Barra
                </span>
              ) : null}
              {zoneDisplayName ? (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    left: 6,
                    maxWidth: "calc(100% - 12px)",
                    padding: "1px 6px",
                    borderRadius: 999,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: zoneColor ? "#0f172a" : "#e2e8f0",
                    background: zoneColor ?? "rgba(15, 23, 42, 0.55)",
                    border: zoneColor
                      ? "1px solid rgba(15, 23, 42, 0.18)"
                      : "1px solid rgba(148, 163, 184, 0.28)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  {zoneDisplayName}
                </span>
              ) : null}
              {locked ? (
                <span
                  title="Elemento bloqueado"
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 6,
                    fontSize: 11,
                    lineHeight: 1,
                    pointerEvents: "none",
                    filter:
                      mapLayoutEmphasis
                        ? undefined
                        : selected
                          ? "drop-shadow(0 0 2px rgba(255,255,255,0.6))"
                          : undefined,
                  }}
                >
                  🔒
                </span>
              ) : null}
              {activeEditingId != null &&
              String(activeEditingId).trim() === elementId &&
              onRename ? (
                <input
                  value={editingName}
                  autoFocus
                  aria-label="Nombre del elemento"
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => saveName()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEditName();
                    }
                  }}
                  style={{
                    width: "100%",
                    maxWidth: "calc(100% - 12px)",
                    fontWeight: selected ? 800 : 600,
                    fontSize:
                      editorOperativoLabelPx != null
                        ? clamp(
                            editorOperativoLabelPx + (selected ? 0.35 : 0),
                            11,
                            18,
                          )
                        : selected
                          ? 13
                          : 12,
                    color: "#0f172a",
                    textAlign: "center",
                    padding: "2px 4px",
                    lineHeight: 1.25,
                    borderRadius: 6,
                    border: "1px solid rgba(56, 189, 248, 0.65)",
                    background: "rgba(255, 255, 255, 0.95)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              ) : editorPlanSurface &&
                editorVisualPreset === "premium" &&
                element.type === "bar" ? null : (
                <span
                  style={{
                    fontWeight: darkDecorLabel
                      ? selected
                        ? 800
                        : 600
                      : mapLayoutEmphasis &&
                          editorVisualPreset === "premium" &&
                          operativoSuperficie
                        ? selected
                          ? 700
                          : 600
                        : selected
                          ? 800
                          : 600,
                    fontSize:
                      editorOperativoLabelPx != null
                        ? editorOperativoLabelPx +
                          (darkDecorLabel
                            ? 0
                            : editorVisualPreset === "premium" &&
                                operativoSuperficie
                              ? 0.35
                              : 0)
                        : editorVisualPreset === "premium" && operativoSuperficie
                          ? selected
                            ? mapLayoutEmphasis
                              ? 14.5
                              : 14
                            : mapLayoutEmphasis
                              ? 13.5
                              : 13
                          : selected
                            ? 13
                            : 12,
                    maxWidth: "100%",
                    boxSizing: "border-box",
                    padding:
                      editorOperativoLabelPx != null
                        ? `0 ${Math.max(4, Math.min(14, Math.round(editorOperativoLabelPx * 0.42)))}px`
                        : "0 6px",
                    color: darkDecorLabel
                      ? selected
                        ? "#f8fafc"
                        : "#e2e8f0"
                      : mapLayoutEmphasis &&
                          editorVisualPreset === "premium" &&
                          operativoSuperficie
                        ? selected
                          ? "#020617"
                          : "#0f172a"
                        : selected
                          ? "#0f172a"
                          : "#1e293b",
                    textAlign: "center",
                    lineHeight:
                      editorOperativoLabelPx != null
                        ? editorOperativoLabelPx >= 15
                          ? 1.2
                          : 1.22
                        : 1.25,
                    textShadow:
                      editorVisualPreset === "premium" && operativoSuperficie
                        ? mapLayoutEmphasis
                          ? selected
                            ? "0 1px 1px rgba(15, 23, 42, 0.14)"
                            : "0 1px 1px rgba(15, 23, 42, 0.08)"
                          : selected
                            ? "0 1px 2px rgba(2, 6, 23, 0.45)"
                            : "0 1px 2px rgba(2, 6, 23, 0.28)"
                        : selected
                          ? "0 1px 0 rgba(255,255,255,0.35)"
                          : "none",
                  }}
                >
                  {resolvePlanElementDisplayName(element)}
                </span>
              )}
              <button
                type="button"
                aria-label="Redimensionar elemento"
                onPointerDown={(e) => {
                  if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
                    e.preventDefault();
                    e.stopPropagation();
                    beginPan(e);
                    return;
                  }
                  if (editingZones) return;
                  if (locked) return;
                  e.stopPropagation();
                  onSelect?.(elementId, { shiftKey: false });
                  setResize({
                    id: elementId,
                    startPx: e.clientX,
                    startPy: e.clientY,
                    origW: mapTileWidth,
                    origH: mapTileHeight,
                  });
                }}
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: 0,
                  width:
                    editorVisualPreset === "premium"
                      ? mapLayoutEmphasis
                        ? 10
                        : 12
                      : 14,
                  height:
                    editorVisualPreset === "premium"
                      ? mapLayoutEmphasis
                        ? 10
                        : 12
                      : 14,
                  padding: 0,
                  border: "none",
                  borderRadius:
                    Number(baseVisual.borderRadius) >= 999
                      ? "0 0 999px 0"
                      : "0 0 10px 0",
                  background:
                    editorVisualPreset === "premium"
                      ? mapLayoutEmphasis
                        ? "rgba(248, 250, 252, 0.95)"
                        : "rgba(15, 23, 42, 0.62)"
                      : "rgba(15, 23, 42, 0.5)",
                  boxShadow:
                    editorVisualPreset === "premium"
                      ? mapLayoutEmphasis
                        ? "inset 0 0 0 1px rgba(148, 163, 184, 0.35)"
                        : "inset 0 0 0 1px rgba(255,255,255,0.14)"
                      : undefined,
                  cursor: "nwse-resize",
                  pointerEvents: locked ? "none" : "auto",
                  opacity:
                    editingZones || locked
                      ? 0
                      : mapLayoutEmphasis
                        ? selected
                          ? 1
                          : 0
                        : 1,
                  transition: mapLayoutEmphasis
                    ? "opacity 140ms ease-out, background-color 140ms ease-out, box-shadow 140ms ease-out"
                    : undefined,
                }}
              />
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
