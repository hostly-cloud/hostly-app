/**
 * Smart Snap — Editor Sala V2 (Pass 1).
 * Snap suave a rejilla y alineación entre elementos (coordenadas de centro).
 */

import type { OperationalElementPosition } from "@/lib/sala-editor/ose/operational-element";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import {
  getOperationalInstanceCanvasSize,
  type OperationalInstanceCanvasSize,
} from "@/lib/sala-editor/canvas/operational-instance-layout";

/** Coincide con dot-grid del canvas (16px, offset 8px). */
export const OPERATIONAL_CANVAS_GRID_SIZE = 16;
export const OPERATIONAL_CANVAS_GRID_OFFSET = 8;

/** Umbral suave: no fuerza snap si el puntero está lejos. */
export const OPERATIONAL_GRID_SNAP_THRESHOLD_PX = 8;
export const OPERATIONAL_PEER_SNAP_THRESHOLD_PX = 11;

export type OperationalSnapGuides = {
  v: number[];
  h: number[];
};

export const EMPTY_OPERATIONAL_SNAP_GUIDES: OperationalSnapGuides = { v: [], h: [] };

export type SnapOperationalCenterContext = {
  draggingInstanceId: string;
  instances: OperationalElementInstance[];
  size: OperationalInstanceCanvasSize;
};

export type SnapOperationalCenterResult = {
  position: OperationalElementPosition;
  guides: OperationalSnapGuides;
};

function nearestGridValue(value: number): number {
  return (
    Math.round(
      (value - OPERATIONAL_CANVAS_GRID_OFFSET) / OPERATIONAL_CANVAS_GRID_SIZE,
    ) *
      OPERATIONAL_CANVAS_GRID_SIZE +
    OPERATIONAL_CANVAS_GRID_OFFSET
  );
}

type AxisSnapCandidate = {
  value: number;
  guide: number | null;
  score: number;
};

function softSnapAxisToGrid(raw: number): AxisSnapCandidate {
  const nearest = nearestGridValue(raw);
  const delta = nearest - raw;
  const distance = Math.abs(delta);

  if (distance <= OPERATIONAL_GRID_SNAP_THRESHOLD_PX) {
    return { value: nearest, guide: nearest, score: distance };
  }

  return {
    value: raw,
    guide: null,
    score: OPERATIONAL_GRID_SNAP_THRESHOLD_PX + 1,
  };
}

function snapAxisToPeers(
  rawCenter: number,
  halfSize: number,
  axis: "x" | "y",
  selfId: string,
  instances: OperationalElementInstance[],
): AxisSnapCandidate {
  let bestValue = rawCenter;
  let bestScore = OPERATIONAL_PEER_SNAP_THRESHOLD_PX + 1;
  let bestGuide: number | null = null;

  for (const peer of instances) {
    if (peer.id === selfId) continue;

    const peerSize = getOperationalInstanceCanvasSize(peer);
    const peerCenter = axis === "x" ? peer.position.x : peer.position.y;
    const peerHalf = axis === "x" ? peerSize.width / 2 : peerSize.height / 2;

    const peerMin = peerCenter - peerHalf;
    const peerMax = peerCenter + peerHalf;

    const candidates: Array<{ targetCenter: number; guide: number }> = [
      { targetCenter: peerMin + halfSize, guide: peerMin },
      { targetCenter: peerMax - halfSize, guide: peerMax },
      { targetCenter: peerCenter, guide: peerCenter },
      { targetCenter: peerMax + halfSize, guide: peerMax },
      { targetCenter: peerMin - halfSize, guide: peerMin },
    ];

    for (const candidate of candidates) {
      const delta = candidate.targetCenter - rawCenter;
      const distance = Math.abs(delta);
      if (distance <= OPERATIONAL_PEER_SNAP_THRESHOLD_PX && distance < bestScore) {
        bestScore = distance;
        bestValue = rawCenter + delta;
        bestGuide = candidate.guide;
      }
    }
  }

  return {
    value: bestValue,
    guide: bestGuide,
    score: bestScore,
  };
}

function pickAxisSnap(
  raw: number,
  gridCandidate: AxisSnapCandidate,
  peerCandidate: AxisSnapCandidate,
): AxisSnapCandidate {
  const gridActive = gridCandidate.score <= OPERATIONAL_GRID_SNAP_THRESHOLD_PX;
  const peerActive = peerCandidate.score <= OPERATIONAL_PEER_SNAP_THRESHOLD_PX;

  if (gridActive && peerActive) {
    return gridCandidate.score <= peerCandidate.score ? gridCandidate : peerCandidate;
  }
  if (peerActive) return peerCandidate;
  if (gridActive) return gridCandidate;
  return { value: raw, guide: null, score: Number.POSITIVE_INFINITY };
}

export function snapOperationalCenterPosition(
  raw: OperationalElementPosition,
  ctx: SnapOperationalCenterContext,
): SnapOperationalCenterResult {
  const halfW = ctx.size.width / 2;
  const halfH = ctx.size.height / 2;

  const gridX = softSnapAxisToGrid(raw.x);
  const gridY = softSnapAxisToGrid(raw.y);
  const peerX = snapAxisToPeers(
    raw.x,
    halfW,
    "x",
    ctx.draggingInstanceId,
    ctx.instances,
  );
  const peerY = snapAxisToPeers(
    raw.y,
    halfH,
    "y",
    ctx.draggingInstanceId,
    ctx.instances,
  );

  const pickedX = pickAxisSnap(raw.x, gridX, peerX);
  const pickedY = pickAxisSnap(raw.y, gridY, peerY);

  const guides: OperationalSnapGuides = { v: [], h: [] };
  if (pickedX.guide != null) guides.v.push(pickedX.guide);
  if (pickedY.guide != null) guides.h.push(pickedY.guide);

  return {
    position: {
      x: Math.round(pickedX.value),
      y: Math.round(pickedY.value),
    },
    guides,
  };
}
