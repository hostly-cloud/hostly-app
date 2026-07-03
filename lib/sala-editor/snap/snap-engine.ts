import {
  SNAP_DISTANCE_PX,
  createHorizontalSnapGuide,
  createVerticalSnapGuide,
} from "@/lib/sala-editor/snap/snap-guides";
import type {
  SnapAxis,
  SnapEngineOptions,
  SnapEngineResult,
  SnapGuide,
  SnapPointKind,
  SnapRect,
} from "@/lib/sala-editor/snap/snap-types";

type AxisSnapCandidate = {
  axis: SnapAxis;
  value: number;
  delta: number;
  distance: number;
  peer: SnapRect;
  guide: SnapGuide;
};

type Anchor = {
  value: number;
  kind: SnapPointKind;
};

function getAxisAnchors(rect: SnapRect, axis: SnapAxis): Anchor[] {
  if (axis === "x") {
    return [
      { value: rect.x, kind: "edge" },
      { value: rect.x + rect.width / 2, kind: "center" },
      { value: rect.x + rect.width, kind: "edge" },
    ];
  }

  return [
    { value: rect.y, kind: "edge" },
    { value: rect.y + rect.height / 2, kind: "center" },
    { value: rect.y + rect.height, kind: "edge" },
  ];
}

function moveRectOnAxis(rect: SnapRect, axis: SnapAxis, delta: number): SnapRect {
  if (axis === "x") return { ...rect, x: rect.x + delta };
  return { ...rect, y: rect.y + delta };
}

function resolveGuideKind(a: Anchor, b: Anchor): SnapPointKind {
  if (a.kind === "center" || b.kind === "center") return "center";
  return "edge";
}

function createGuideForAxis(
  axis: SnapAxis,
  position: number,
  moving: SnapRect,
  peer: SnapRect,
  kind: SnapPointKind,
): SnapGuide {
  if (axis === "x") return createVerticalSnapGuide(position, moving, peer, kind);
  return createHorizontalSnapGuide(position, moving, peer, kind);
}

function getBestAxisCandidate(
  moving: SnapRect,
  peers: readonly SnapRect[],
  axis: SnapAxis,
  threshold: number,
): AxisSnapCandidate | null {
  let best: AxisSnapCandidate | null = null;
  const movingAnchors = getAxisAnchors(moving, axis);

  for (const peer of peers) {
    if (peer.id === moving.id) continue;
    const peerAnchors = getAxisAnchors(peer, axis);

    for (const movingAnchor of movingAnchors) {
      for (const peerAnchor of peerAnchors) {
        const delta = peerAnchor.value - movingAnchor.value;
        const distance = Math.abs(delta);
        if (distance > threshold) continue;
        if (best && distance >= best.distance) continue;

        const snappedRect = moveRectOnAxis(moving, axis, delta);
        const guideKind = resolveGuideKind(movingAnchor, peerAnchor);

        best = {
          axis,
          value: peerAnchor.value,
          delta,
          distance,
          peer,
          guide: createGuideForAxis(
            axis,
            peerAnchor.value,
            snappedRect,
            peer,
            guideKind,
          ),
        };
      }
    }
  }

  return best;
}

export function snapRectToPeers(
  moving: SnapRect,
  peers: readonly SnapRect[],
  options: SnapEngineOptions = {},
): SnapEngineResult {
  const threshold = options.threshold ?? SNAP_DISTANCE_PX;
  const xCandidate = getBestAxisCandidate(moving, peers, "x", threshold);
  const afterX = xCandidate ? moveRectOnAxis(moving, "x", xCandidate.delta) : moving;
  const yCandidate = getBestAxisCandidate(afterX, peers, "y", threshold);
  const snappedRect = yCandidate ? moveRectOnAxis(afterX, "y", yCandidate.delta) : afterX;
  const guides = [xCandidate?.guide, yCandidate?.guide].filter(
    (guide): guide is SnapGuide => guide != null,
  );

  return {
    rect: snappedRect,
    guides,
    snapped: guides.length > 0,
  };
}
