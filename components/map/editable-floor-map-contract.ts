import type {
  MutableRefObject,
  ReactNode,
  Ref,
  WheelEvent as ReactWheelEvent,
} from "react";
import type { FloorPlanCanvasSize } from "@/lib/firestore/floorPlans";
import {
  getDefaultSizeForPlanElementType,
  type PlanElementType,
  type Table,
} from "@/lib/firestore/tables";

export type { FloorPlanCanvasSize } from "@/lib/firestore/floorPlans";

export const DEFAULT_MAP_TILE_WIDTH =
  getDefaultSizeForPlanElementType("table").width;
export const DEFAULT_MAP_TILE_HEIGHT =
  getDefaultSizeForPlanElementType("table").height;

const ZOOM_MAX = 1.35;
const FIT_ZOOM_MAX = 1.05;
const VIEW_PADDING_PX = 80;

export type FloorSurfacePresetId =
  | "ice"
  | "stone"
  | "warm"
  | "coolGray"
  | "sand"
  | "cement"
  | "lightWood"
  | "slate";

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

export type EditableFloorMapViewportControls = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetNaturalZoom: () => void;
  fitToViewport: () => void;
};

export type EditableFloorMapProps = {
  elements: Table[];
  editable: boolean;
  selectedId?: string | null;
  selectedIds?: string[];
  onSelect?: (id: string, modifiers?: { shiftKey?: boolean }) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onMoveMany?: (updates: { id: string; x: number; y: number }[]) => void;
  onResize?: (id: string, width: number, height: number) => void;
  onRename?: (id: string, newName: string) => void;
  onCreate?: (planType: PlanElementType, x: number, y: number) => void;
  createType?: PlanElementType | null;
  renderElement?: (ctx: FloorMapRenderContext) => ReactNode;
  readonlyUnderlay?: ReactNode;
  editorPlanSurface?: boolean;
  floorSurfacePreset?: FloorSurfacePresetId;
  planSize?: FloorPlanCanvasSize | null;
  viewportFitElements?: Table[];
  viewportFitZones?: EditableFloorMapZone[];
  viewportFitMode?: "plan" | "content";
  viewportFitZoomMax?: number;
  viewportFitAlign?: "center" | "start";
  viewportFitOffsetX?: number;
  viewportFitOffsetY?: number;
  viewportFitZoomMultiplier?: number;
  zones?: EditableFloorMapZone[];
  zoneHighlight?: EditableFloorMapZoneHighlight;
  editingZones?: boolean;
  selectedZoneId?: string | null;
  onSelectZone?: (zoneId: string) => void;
  onMoveZone?: (zoneId: string, x: number, y: number) => void;
  onResizeZone?: (zoneId: string, width: number, height: number) => void;
  editorVisualPreset?: "default" | "premium";
  placementRequest?: { id: number; planType: PlanElementType } | null;
  onPlacementRequestHandled?: () => void;
  onWheel?: (e: ReactWheelEvent<HTMLDivElement>) => void;
  className?: string;
  mapAutoFitKey?: string;
  mapAutoFitNonce?: number;
  hideInlineZoomControls?: boolean;
  viewportControlsRef?: Ref<EditableFloorMapViewportControls | null>;
  viewportFitPaddingPx?: number;
  mapLayoutEmphasis?: boolean;
  hideZoneOverlays?: boolean;
  selectedIdsRef?: MutableRefObject<string[]>;
  onSelectionScreenRect?: (rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null) => void;
  onZoneScreenRect?: (rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null) => void;
  onBoxSelect?: (ids: string[]) => void;
  preferredPlacementMapPoint?: { x: number; y: number } | null;
};

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
  paddingPx: number;
  maxZoom: number;
  fitZoomMax: number;
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

function elementSize(element: Table): { w: number; h: number } {
  const defaults = getDefaultSizeForPlanElementType(element.type);
  return {
    w:
      typeof element.width === "number" && Number.isFinite(element.width)
        ? element.width
        : defaults.width,
    h:
      typeof element.height === "number" && Number.isFinite(element.height)
        ? element.height
        : defaults.height,
  };
}

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
    Number.isFinite(planSize.width) &&
    Number.isFinite(planSize.height) &&
    planSize.width > 0 &&
    planSize.height > 0
  ) {
    extend(0, 0, planSize.width, planSize.height);
  }

  for (const element of tables) {
    const { w, h } = elementSize(element);
    const x = typeof element.x === "number" && Number.isFinite(element.x) ? element.x : 0;
    const y = typeof element.y === "number" && Number.isFinite(element.y) ? element.y : 0;
    extend(x, y, w, h);
  }

  for (const zone of zones ?? []) {
    if (
      typeof zone.x === "number" &&
      typeof zone.y === "number" &&
      typeof zone.width === "number" &&
      typeof zone.height === "number" &&
      Number.isFinite(zone.x) &&
      Number.isFinite(zone.y) &&
      Number.isFinite(zone.width) &&
      Number.isFinite(zone.height) &&
      zone.width > 0 &&
      zone.height > 0
    ) {
      extend(zone.x, zone.y, zone.width, zone.height);
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

export function fitBoundsToViewport(
  bounds: PlanContentBounds,
  viewportWidth: number,
  viewportHeight: number,
  options: Partial<FitBoundsToViewportOptions> = {},
): { zoom: number; pan: { x: number; y: number } } {
  const paddingPx = options.paddingPx ?? VIEW_PADDING_PX;
  const maxZoom = options.maxZoom ?? ZOOM_MAX;
  const fitZoomMax = options.fitZoomMax ?? options.maxZoom ?? FIT_ZOOM_MAX;
  const align = options.align ?? "center";

  const vw = Math.max(1, viewportWidth);
  const vh = Math.max(1, viewportHeight);
  const usableW = Math.max(32, vw - paddingPx);
  const usableH = Math.max(32, vh - paddingPx);
  const naturalFit = Math.min(
    usableW / Math.max(1, bounds.width),
    usableH / Math.max(1, bounds.height),
  );
  const zoom = Math.min(naturalFit, fitZoomMax, maxZoom);
  const z = Number.isFinite(zoom) && zoom > 0 ? Math.max(zoom, 0.06) : 0.06;
  const inset = paddingPx / 2;

  return {
    zoom: z,
    pan:
      align === "start"
        ? {
            x: inset - bounds.minX * z,
            y: inset - bounds.minY * z,
          }
        : {
            x: vw / 2 - bounds.centerX * z,
            y: vh / 2 - bounds.centerY * z,
          },
  };
}
