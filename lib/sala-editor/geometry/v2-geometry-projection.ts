import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import {
  getOperationalInstanceCanvasSize,
  type OperationalInstanceCanvasSize,
} from "@/lib/sala-editor/canvas/operational-instance-layout";

export type V2GeometryOrigin = "center" | "top-left";

export type V2ProjectedGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
};

export type ProjectV2GeometryInput = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  coordinateScale?: number;
  origin?: V2GeometryOrigin;
};

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeCoordinateScale(value: unknown): number {
  const scale = finiteNumber(value, 1);
  return scale > 0 ? scale : 1;
}

export function projectV2Geometry({
  x,
  y,
  width,
  height,
  rotation = 0,
  coordinateScale = 1,
  origin = "top-left",
}: ProjectV2GeometryInput): V2ProjectedGeometry {
  const scale = safeCoordinateScale(coordinateScale);
  const projectedWidth = finiteNumber(width, 0) * scale;
  const projectedHeight = finiteNumber(height, 0) * scale;
  const projectedX = finiteNumber(x, 0) * scale;
  const projectedY = finiteNumber(y, 0) * scale;

  return {
    x: origin === "center" ? projectedX - projectedWidth / 2 : projectedX,
    y: origin === "center" ? projectedY - projectedHeight / 2 : projectedY,
    width: projectedWidth,
    height: projectedHeight,
    rotation: finiteNumber(rotation, 0),
    scale,
  };
}

export function projectOperationalElement(
  instance: OperationalElementInstance,
  params: {
    coordinateScale?: number;
    size?: OperationalInstanceCanvasSize;
  } = {},
): V2ProjectedGeometry {
  const size = params.size ?? getOperationalInstanceCanvasSize(instance);
  return projectV2Geometry({
    x: instance.position.x,
    y: instance.position.y,
    width: size.width,
    height: size.height,
    rotation: instance.rotation,
    coordinateScale: params.coordinateScale,
    origin: "center",
  });
}
