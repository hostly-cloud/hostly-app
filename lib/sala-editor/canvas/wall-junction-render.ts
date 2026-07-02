/**
 * Encuentros visuales entre paredes (Editor V2 · Estructura Pass 3).
 * Solo render: no modifica geometría almacenada.
 */

import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import {
  SALA_WALL_STROKE_COLOR,
  SALA_WALL_STROKE_WIDTH,
  type SalaPoint,
  type SalaWallEndpoint,
} from "@/lib/sala-editor/geometry/wall-geometry";

export const WALL_JUNCTION_TOLERANCE_PX = 6;

/** Ángulo casi colineal (continuación recta) — no recortar extremos. */
const WALL_COLLINEAR_ANGLE_RAD = 0.18;

export type WallEndpointRef = {
  wallId: string;
  endpoint: SalaWallEndpoint;
};

export type WallJunctionArm = {
  ref: WallEndpointRef;
  angle: number;
};

export type WallJunctionNode = {
  key: string;
  x: number;
  y: number;
  arms: WallJunctionArm[];
};

export type WallSegmentVisual = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  capStart: "round" | "butt";
  capEnd: "round" | "butt";
};

export type WallJunctionVisual =
  | {
      key: string;
      kind: "circle";
      cx: number;
      cy: number;
      r: number;
      fill: string;
    }
  | {
      key: string;
      kind: "path";
      d: string;
      fill: string;
    };

export type WallCanvasVisualModel = {
  segments: WallSegmentVisual[];
  draftSegment: WallSegmentVisual | null;
  junctions: WallJunctionVisual[];
};

type EndpointSample = {
  x: number;
  y: number;
  ref: WallEndpointRef;
};

function distanceSq(a: SalaPoint, b: SalaPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function getArmAngle(
  wall: Pick<SalaWallSegment, "x1" | "y1" | "x2" | "y2">,
  endpoint: SalaWallEndpoint,
): number {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy) || 1;
  if (endpoint === "start") {
    return Math.atan2(dy / len, dx / len);
  }
  return Math.atan2(-dy / len, -dx / len);
}

function normalizeAngleDelta(a: number, b: number): number {
  let diff = Math.abs(a - b);
  while (diff > Math.PI) diff = 2 * Math.PI - diff;
  return diff;
}

function isCollinearContinuation(armA: WallJunctionArm, armB: WallJunctionArm): boolean {
  return (
    Math.abs(normalizeAngleDelta(armA.angle, armB.angle) - Math.PI) <
    WALL_COLLINEAR_ANGLE_RAD
  );
}

function clusterEndpoints(samples: EndpointSample[]): WallJunctionNode[] {
  const toleranceSq = WALL_JUNCTION_TOLERANCE_PX * WALL_JUNCTION_TOLERANCE_PX;
  const nodes: WallJunctionNode[] = [];

  for (const sample of samples) {
    let node =
      nodes.find((candidate) =>
        distanceSq(candidate, sample) <= toleranceSq,
      ) ?? null;

    if (!node) {
      node = {
        key: `${Math.round(sample.x)}:${Math.round(sample.y)}:${nodes.length}`,
        x: sample.x,
        y: sample.y,
        arms: [],
      };
      nodes.push(node);
    } else {
      const count = node.arms.length + 1;
      node.x = (node.x * (count - 1) + sample.x) / count;
      node.y = (node.y * (count - 1) + sample.y) / count;
    }

    node.arms.push({
      ref: sample.ref,
      angle: 0,
    });
  }

  return nodes;
}

function buildJunctionNodes(
  walls: readonly Pick<SalaWallSegment, "id" | "x1" | "y1" | "x2" | "y2">[],
  draft?: { x1: number; y1: number; previewX: number; previewY: number } | null,
): WallJunctionNode[] {
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  const draftWall = draft
    ? {
        id: "__draft__",
        x1: draft.x1,
        y1: draft.y1,
        x2: draft.previewX,
        y2: draft.previewY,
      }
    : null;

  const samples: EndpointSample[] = [];
  for (const wall of walls) {
    samples.push(
      { x: wall.x1, y: wall.y1, ref: { wallId: wall.id, endpoint: "start" } },
      { x: wall.x2, y: wall.y2, ref: { wallId: wall.id, endpoint: "end" } },
    );
  }
  if (draftWall) {
    samples.push(
      {
        x: draftWall.x1,
        y: draftWall.y1,
        ref: { wallId: draftWall.id, endpoint: "start" },
      },
      {
        x: draftWall.x2,
        y: draftWall.y2,
        ref: { wallId: draftWall.id, endpoint: "end" },
      },
    );
  }

  return clusterEndpoints(samples).map((node) => ({
    ...node,
    arms: node.arms.map((arm) => {
      const wall =
        arm.ref.wallId === "__draft__"
          ? draftWall
          : wallById.get(arm.ref.wallId);
      if (!wall) return arm;
      return {
        ...arm,
        angle: getArmAngle(wall, arm.ref.endpoint),
      };
    }),
  }));
}

function findJunctionForEndpoint(
  nodes: WallJunctionNode[],
  wallId: string,
  endpoint: SalaWallEndpoint,
): WallJunctionNode | null {
  return (
    nodes.find((node) =>
      node.arms.some(
        (arm) => arm.ref.wallId === wallId && arm.ref.endpoint === endpoint,
      ),
    ) ?? null
  );
}

function shouldTrimEndpoint(
  node: WallJunctionNode | null,
  ref: WallEndpointRef,
): boolean {
  if (!node || node.arms.length < 2) return false;

  if (node.arms.length === 2) {
    const other = node.arms.find(
      (arm) =>
        arm.ref.wallId !== ref.wallId || arm.ref.endpoint !== ref.endpoint,
    );
    const self = node.arms.find(
      (arm) =>
        arm.ref.wallId === ref.wallId && arm.ref.endpoint === ref.endpoint,
    );
    if (other && self && isCollinearContinuation(self, other)) {
      return false;
    }
  }

  return true;
}

function shouldRoundCapAtEndpoint(node: WallJunctionNode | null): boolean {
  return !node || node.arms.length < 2;
}

function trimEndpoint(
  wall: Pick<SalaWallSegment, "x1" | "y1" | "x2" | "y2">,
  endpoint: SalaWallEndpoint,
  halfWidth: number,
): SalaPoint {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  if (endpoint === "start") {
    return { x: wall.x1 + ux * halfWidth, y: wall.y1 + uy * halfWidth };
  }
  return { x: wall.x2 - ux * halfWidth, y: wall.y2 - uy * halfWidth };
}

function buildExteriorMiterPath(
  node: WallJunctionNode,
  halfWidth: number,
): string | null {
  if (node.arms.length !== 2) return null;

  const [arm1, arm2] = node.arms;
  const u1 = { x: Math.cos(arm1.angle), y: Math.sin(arm1.angle) };
  const u2 = { x: Math.cos(arm2.angle), y: Math.sin(arm2.angle) };
  const cross = u1.x * u2.y - u1.y * u2.x;

  if (Math.abs(cross) < 0.05) return null;

  const n1 = { x: -Math.sin(arm1.angle), y: Math.cos(arm1.angle) };
  const n2 = { x: -Math.sin(arm2.angle), y: Math.cos(arm2.angle) };
  const sign = cross > 0 ? 1 : -1;
  const nn1 = { x: n1.x * sign * halfWidth, y: n1.y * sign * halfWidth };
  const nn2 = { x: n2.x * sign * halfWidth, y: n2.y * sign * halfWidth };

  const p1x = node.x + nn1.x;
  const p1y = node.y + nn1.y;
  const p2x = node.x + nn2.x;
  const p2y = node.y + nn2.y;
  const mx = node.x + nn1.x + nn2.x;
  const my = node.y + nn1.y + nn2.y;

  return `M ${node.x} ${node.y} L ${p1x} ${p1y} L ${mx} ${my} L ${p2x} ${p2y} Z`;
}

function buildJunctionVisuals(
  nodes: WallJunctionNode[],
  halfWidth: number,
  fill: string,
): WallJunctionVisual[] {
  const visuals: WallJunctionVisual[] = [];

  for (const node of nodes) {
    if (node.arms.length < 2) continue;

    if (node.arms.length >= 3) {
      visuals.push({
        key: `junction-hub-${node.key}`,
        kind: "circle",
        cx: node.x,
        cy: node.y,
        r: halfWidth + 0.75,
        fill,
      });
      continue;
    }

    const miterPath = buildExteriorMiterPath(node, halfWidth);
    if (miterPath) {
      visuals.push({
        key: `junction-miter-${node.key}`,
        kind: "path",
        d: miterPath,
        fill,
      });
    }

    visuals.push({
      key: `junction-core-${node.key}`,
      kind: "circle",
      cx: node.x,
      cy: node.y,
      r: Math.max(halfWidth - 0.25, 1),
      fill,
    });
  }

  return visuals;
}

function buildSegmentVisual(
  wall: Pick<SalaWallSegment, "id" | "x1" | "y1" | "x2" | "y2">,
  nodes: WallJunctionNode[],
  halfWidth: number,
): WallSegmentVisual {
  const startNode = findJunctionForEndpoint(nodes, wall.id, "start");
  const endNode = findJunctionForEndpoint(nodes, wall.id, "end");
  const trimStart = shouldTrimEndpoint(startNode, {
    wallId: wall.id,
    endpoint: "start",
  });
  const trimEnd = shouldTrimEndpoint(endNode, {
    wallId: wall.id,
    endpoint: "end",
  });
  const roundStart = shouldRoundCapAtEndpoint(startNode);
  const roundEnd = shouldRoundCapAtEndpoint(endNode);

  const start = trimStart
    ? trimEndpoint(wall, "start", halfWidth)
    : { x: wall.x1, y: wall.y1 };
  const end = trimEnd
    ? trimEndpoint(wall, "end", halfWidth)
    : { x: wall.x2, y: wall.y2 };

  return {
    id: wall.id,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    capStart: roundStart ? "round" : "butt",
    capEnd: roundEnd ? "round" : "butt",
  };
}

function isDraftSegmentRenderable(draft: {
  x1: number;
  y1: number;
  previewX: number;
  previewY: number;
}): boolean {
  const dx = draft.previewX - draft.x1;
  const dy = draft.previewY - draft.y1;
  return Math.hypot(dx, dy) >= 1;
}

export function buildWallCanvasVisualModel(params: {
  walls: readonly SalaWallSegment[];
  draft?: { x1: number; y1: number; previewX: number; previewY: number } | null;
  strokeWidth?: number;
  junctionFill?: string;
}): WallCanvasVisualModel {
  const strokeWidth = params.strokeWidth ?? SALA_WALL_STROKE_WIDTH;
  const halfWidth = strokeWidth / 2;
  const junctionFill = params.junctionFill ?? SALA_WALL_STROKE_COLOR;

  const nodes = buildJunctionNodes(params.walls, params.draft);
  const segments = params.walls.map((wall) =>
    buildSegmentVisual(wall, nodes, halfWidth),
  );

  const draftSegment =
    params.draft && isDraftSegmentRenderable(params.draft)
      ? buildSegmentVisual(
          {
            id: "__draft__",
            x1: params.draft.x1,
            y1: params.draft.y1,
            x2: params.draft.previewX,
            y2: params.draft.previewY,
          },
          nodes,
          halfWidth,
        )
      : null;

  return {
    segments,
    draftSegment,
    junctions: buildJunctionVisuals(nodes, halfWidth, junctionFill),
  };
}

export function buildWallJunctionNodes(
  walls: readonly SalaWallSegment[],
  draft?: { x1: number; y1: number; previewX: number; previewY: number } | null,
): WallJunctionNode[] {
  return buildJunctionNodes(walls, draft);
}
