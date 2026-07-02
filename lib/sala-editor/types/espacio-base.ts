/**
 * Base mínima de un mapa/espacio (Editor V2 · fase Base).
 * Información fundacional del plano antes de estructura y operación.
 */

import {
  DEFAULT_FLOOR_PLAN_CONFIG,
  type FloorPlanCanvasSize,
} from "@/lib/firestore/floorPlans";

export type SalaEspacioBaseStatus = "pendiente" | "incompleta" | "lista";

export type SalaEspacioBaseShapeType = "rectangular";

export type SalaEspacioBaseUnit = "metros";

export type SalaEspacioBaseDimensions = {
  width: number;
  height: number;
};

export type SalaEspacioBaseScale = {
  /** Píxeles de lienzo por unidad real (p. ej. metros). */
  pixelsPerUnit: number;
};

export type SalaEspacioBaseOrientation = {
  /** Grados en sentido horario desde el eje vertical del mapa. */
  degrees: number;
};

export type SalaEspacioBaseFloor = {
  /** Superficie visual básica del suelo. */
  kind: "neutral" | "tile" | "wood" | "stone" | "grass" | "sand" | "water";
  color: string;
};

export type SalaEspacioBaseGrid = {
  visible: boolean;
  /** Tamaño de celda en píxeles de lienzo (coincide con dot-grid 16px). */
  size: number;
};

export type SalaEspacioBase = {
  status: SalaEspacioBaseStatus;
  shapeType: SalaEspacioBaseShapeType;
  dimensions: SalaEspacioBaseDimensions;
  unit: SalaEspacioBaseUnit;
  scale: SalaEspacioBaseScale;
  orientation: SalaEspacioBaseOrientation;
  floor: SalaEspacioBaseFloor;
  grid: SalaEspacioBaseGrid;
  updatedAt?: number;
};

export const DEFAULT_SALA_ESPACIO_BASE_GRID_SIZE = 16 as const;

export const DEFAULT_SALA_ESPACIO_BASE_SCALE: SalaEspacioBaseScale = {
  pixelsPerUnit: 100,
};

export const DEFAULT_SALA_ESPACIO_BASE_FLOOR: SalaEspacioBaseFloor = {
  kind: "neutral",
  color: "#e8eef2",
};

export const DEFAULT_SALA_ESPACIO_BASE_DIMENSIONS: SalaEspacioBaseDimensions = {
  width: DEFAULT_FLOOR_PLAN_CONFIG.width / DEFAULT_SALA_ESPACIO_BASE_SCALE.pixelsPerUnit,
  height: DEFAULT_FLOOR_PLAN_CONFIG.height / DEFAULT_SALA_ESPACIO_BASE_SCALE.pixelsPerUnit,
};

export const SALA_ESPACIO_BASE_STATUS_LABELS: Record<SalaEspacioBaseStatus, string> = {
  pendiente: "Pendiente",
  incompleta: "Incompleta",
  lista: "Lista",
};

export const SALA_ESPACIO_BASE_SHAPE_LABELS: Record<SalaEspacioBaseShapeType, string> = {
  rectangular: "Rectangular",
};

export const SALA_ESPACIO_BASE_FLOOR_LABELS: Record<SalaEspacioBaseFloor["kind"], string> = {
  neutral: "Neutro",
  tile: "Baldosa",
  wood: "Madera",
  stone: "Piedra",
  grass: "Césped",
  sand: "Arena",
  water: "Agua",
};

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeOrientationDegrees(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function nearlyEqualBaseNumber(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function isDefaultSalaEspacioBase(base: SalaEspacioBase): boolean {
  return (
    nearlyEqualBaseNumber(base.dimensions.width, DEFAULT_SALA_ESPACIO_BASE_DIMENSIONS.width) &&
    nearlyEqualBaseNumber(base.dimensions.height, DEFAULT_SALA_ESPACIO_BASE_DIMENSIONS.height) &&
    base.floor.kind === DEFAULT_SALA_ESPACIO_BASE_FLOOR.kind &&
    base.grid.visible === true &&
    base.grid.size === DEFAULT_SALA_ESPACIO_BASE_GRID_SIZE
  );
}

export function meetsSalaEspacioBaseListaCriteria(base: SalaEspacioBase): boolean {
  return (
    base.dimensions.width >= 1 &&
    base.dimensions.height >= 1 &&
    base.grid.size >= 4 &&
    base.grid.size <= 128
  );
}

export function deriveSalaEspacioBaseStatus(base: SalaEspacioBase): SalaEspacioBaseStatus {
  if (isDefaultSalaEspacioBase(base)) return "pendiente";
  if (meetsSalaEspacioBaseListaCriteria(base)) return "lista";
  return "incompleta";
}

export function createDefaultSalaEspacioBase(
  overrides?: Partial<SalaEspacioBase>,
): SalaEspacioBase {
  const now = Date.now();
  return normalizeSalaEspacioBase({
    updatedAt: now,
    ...overrides,
  });
}

export function createSalaEspacioBaseFromCanvasSize(
  canvas: FloorPlanCanvasSize,
  overrides?: Partial<SalaEspacioBase>,
): SalaEspacioBase {
  const pixelsPerUnit = overrides?.scale?.pixelsPerUnit ?? DEFAULT_SALA_ESPACIO_BASE_SCALE.pixelsPerUnit;
  return createDefaultSalaEspacioBase({
    status: "incompleta",
    dimensions: {
      width: canvas.width / pixelsPerUnit,
      height: canvas.height / pixelsPerUnit,
    },
    scale: { pixelsPerUnit },
    ...overrides,
  });
}

/** Normaliza una base parcial o ausente con valores seguros por defecto. */
export function normalizeSalaEspacioBase(
  raw?: Partial<SalaEspacioBase> | null,
): SalaEspacioBase {
  const dimensionsRaw = raw?.dimensions;
  const scaleRaw = raw?.scale;
  const orientationRaw = raw?.orientation;
  const floorRaw = raw?.floor;
  const gridRaw = raw?.grid;

  const pixelsPerUnit = isPositiveFiniteNumber(scaleRaw?.pixelsPerUnit)
    ? scaleRaw.pixelsPerUnit
    : DEFAULT_SALA_ESPACIO_BASE_SCALE.pixelsPerUnit;

  const width = isPositiveFiniteNumber(dimensionsRaw?.width)
    ? dimensionsRaw.width
    : DEFAULT_SALA_ESPACIO_BASE_DIMENSIONS.width;
  const height = isPositiveFiniteNumber(dimensionsRaw?.height)
    ? dimensionsRaw.height
    : DEFAULT_SALA_ESPACIO_BASE_DIMENSIONS.height;

  const floorKind = floorRaw?.kind;
  const floorColor =
    typeof floorRaw?.color === "string" && floorRaw.color.trim() !== ""
      ? floorRaw.color.trim()
      : DEFAULT_SALA_ESPACIO_BASE_FLOOR.color;

  const shapeType = raw?.shapeType === "rectangular" ? raw.shapeType : "rectangular";

  const gridSize = isPositiveFiniteNumber(gridRaw?.size)
    ? gridRaw.size
    : DEFAULT_SALA_ESPACIO_BASE_GRID_SIZE;

  const updatedAt =
    typeof raw?.updatedAt === "number" && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : undefined;

  const baseWithoutStatus: SalaEspacioBase = {
    status: "pendiente",
    shapeType,
    dimensions: { width, height },
    unit: "metros",
    scale: { pixelsPerUnit },
    orientation: {
      degrees: normalizeOrientationDegrees(orientationRaw?.degrees),
    },
    floor: {
      kind:
        floorKind === "tile" ||
        floorKind === "wood" ||
        floorKind === "stone" ||
        floorKind === "grass" ||
        floorKind === "sand" ||
        floorKind === "water" ||
        floorKind === "neutral"
          ? floorKind
          : DEFAULT_SALA_ESPACIO_BASE_FLOOR.kind,
      color: floorColor,
    },
    grid: {
      visible: gridRaw?.visible !== false,
      size: gridSize,
    },
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };

  return {
    ...baseWithoutStatus,
    status: deriveSalaEspacioBaseStatus(baseWithoutStatus),
  };
}
