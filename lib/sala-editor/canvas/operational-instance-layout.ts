/**
 * Layout de instancias operativas en el canvas del editor V2.
 * Tamaño en metadata — sin modificar el modelo OSE canónico.
 */

import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";

export const OPERATIONAL_INSTANCE_CANVAS_SIZE_KEY = "canvasSize";

export type OperationalInstanceCanvasSize = {
  width: number;
  height: number;
};

export const MIN_OPERATIONAL_INSTANCE_CANVAS_SIZE: OperationalInstanceCanvasSize = {
  width: 56,
  height: 44,
};

const DEFAULT_SIZE_BY_TYPE: Record<OperationalElementType, OperationalInstanceCanvasSize> = {
  TABLE: { width: 116, height: 76 },
  HIGH_TABLE: { width: 72, height: 72 },
  BAR_SEAT: { width: 44, height: 44 },
  BAR_STRAIGHT: { width: 220, height: 68 },
  BAR_L: { width: 180, height: 140 },
  SOFA: { width: 180, height: 90 },
  SUNBED: { width: 200, height: 52 },
  BALINESE_BED: { width: 160, height: 110 },
  ROOM: { width: 140, height: 100 },
  CABANA: { width: 150, height: 110 },
  PICKUP_POINT: { width: 96, height: 56 },
  CUSTOM: { width: 116, height: 76 },
};

function isCanvasSize(value: unknown): value is OperationalInstanceCanvasSize {
  if (!value || typeof value !== "object") return false;
  const candidate = value as OperationalInstanceCanvasSize;
  return (
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    candidate.width > 0 &&
    candidate.height > 0
  );
}

export function getDefaultOperationalInstanceCanvasSize(
  elementType: OperationalElementType,
): OperationalInstanceCanvasSize {
  return DEFAULT_SIZE_BY_TYPE[elementType] ?? DEFAULT_SIZE_BY_TYPE.TABLE;
}

export function getOperationalInstanceCanvasSize(
  instance: OperationalElementInstance,
): OperationalInstanceCanvasSize {
  const fromMeta = instance.metadata[OPERATIONAL_INSTANCE_CANVAS_SIZE_KEY];
  if (isCanvasSize(fromMeta)) return fromMeta;
  return getDefaultOperationalInstanceCanvasSize(instance.elementType);
}

export function clampOperationalInstanceCanvasSize(
  size: OperationalInstanceCanvasSize,
): OperationalInstanceCanvasSize {
  return {
    width: Math.max(MIN_OPERATIONAL_INSTANCE_CANVAS_SIZE.width, Math.round(size.width)),
    height: Math.max(MIN_OPERATIONAL_INSTANCE_CANVAS_SIZE.height, Math.round(size.height)),
  };
}

export function withOperationalInstanceCanvasSize(
  metadata: Record<string, unknown>,
  size: OperationalInstanceCanvasSize,
): Record<string, unknown> {
  return {
    ...metadata,
    [OPERATIONAL_INSTANCE_CANVAS_SIZE_KEY]: clampOperationalInstanceCanvasSize(size),
  };
}

export type OperationalInstanceResizeCorner = "nw" | "ne" | "sw" | "se";

export function computeResizedOperationalInstanceLayout(params: {
  corner: OperationalInstanceResizeCorner;
  originSize: OperationalInstanceCanvasSize;
  originPosition: { x: number; y: number };
  pointerDelta: { x: number; y: number };
}): { size: OperationalInstanceCanvasSize; position: { x: number; y: number } } {
  const { corner, originSize, originPosition, pointerDelta } = params;
  const dx = pointerDelta.x;
  const dy = pointerDelta.y;

  let width = originSize.width;
  let height = originSize.height;
  let x = originPosition.x;
  let y = originPosition.y;

  switch (corner) {
    case "se":
      width = originSize.width + dx * 2;
      height = originSize.height + dy * 2;
      break;
    case "sw":
      width = originSize.width - dx * 2;
      height = originSize.height + dy * 2;
      x = originPosition.x + dx;
      break;
    case "ne":
      width = originSize.width + dx * 2;
      height = originSize.height - dy * 2;
      y = originPosition.y + dy;
      break;
    case "nw":
      width = originSize.width - dx * 2;
      height = originSize.height - dy * 2;
      x = originPosition.x + dx;
      y = originPosition.y + dy;
      break;
  }

  const size = clampOperationalInstanceCanvasSize({ width, height });

  if (size.width !== width || size.height !== height) {
    const widthRatio = size.width / Math.max(width, 1);
    const heightRatio = size.height / Math.max(height, 1);
    if (corner === "nw" || corner === "sw") {
      x = originPosition.x + dx * widthRatio;
    }
    if (corner === "nw" || corner === "ne") {
      y = originPosition.y + dy * heightRatio;
    }
  }

  return {
    size,
    position: { x: Math.round(x), y: Math.round(y) },
  };
}
