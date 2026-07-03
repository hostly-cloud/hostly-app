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
  SnapResizableEdges,
  SnapRect,
} from "@/lib/sala-editor/snap/snap-types";

type AxisSnapCandidate = {
  axis: SnapAxis;
  value: number;
  delta: number;
  distance: number;
  peer: SnapRect;
  guide: SnapGuide;
  movingAnchor: Anchor;
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

function getMovingAxisAnchors(
  rect: SnapRect,
  axis: SnapAxis,
  activeEdges?: SnapResizableEdges,
): Anchor[] {
  if (!activeEdges) return getAxisAnchors(rect, axis);

  if (axis === "x") {
    const anchors: Anchor[] = [];
    if (activeEdges.left) anchors.push({ value: rect.x, kind: "edge" });
    if (activeEdges.left || activeEdges.right) {
      anchors.push({ value: rect.x + rect.width / 2, kind: "center" });
    }
    if (activeEdges.right) anchors.push({ value: rect.x + rect.width, kind: "edge" });
    return anchors;
  }

  const anchors: Anchor[] = [];
  if (activeEdges.top) anchors.push({ value: rect.y, kind: "edge" });
  if (activeEdges.top || activeEdges.bottom) {
    anchors.push({ value: rect.y + rect.height / 2, kind: "center" });
  }
  if (activeEdges.bottom) anchors.push({ value: rect.y + rect.height, kind: "edge" });
  return anchors;
}

function moveRectOnAxis(rect: SnapRect, axis: SnapAxis, delta: number): SnapRect {
  if (axis === "x") return { ...rect, x: rect.x + delta };
  return { ...rect, y: rect.y + delta };
}

function resizeRectOnAxis(
  rect: SnapRect,
  axis: SnapAxis,
  delta: number,
  anchorKind: SnapPointKind,
  activeEdges?: SnapResizableEdges,
): SnapRect {
  if (!activeEdges) return moveRectOnAxis(rect, axis, delta);

  if (axis === "x") {
    const edgeDelta =
      anchorKind === "center" && activeEdges.left !== activeEdges.right
        ? delta * 2
        : delta;

    if (activeEdges.left && !activeEdges.right) {
      return { ...rect, x: rect.x + edgeDelta, width: rect.width - edgeDelta };
    }
    if (activeEdges.right && !activeEdges.left) {
      return { ...rect, width: rect.width + edgeDelta };
    }
  }

  if (axis === "y") {
    const edgeDelta =
      anchorKind === "center" && activeEdges.top !== activeEdges.bottom
        ? delta * 2
        : delta;

    if (activeEdges.top && !activeEdges.bottom) {
      return { ...rect, y: rect.y + edgeDelta, height: rect.height - edgeDelta };
    }
    if (activeEdges.bottom && !activeEdges.top) {
      return { ...rect, height: rect.height + edgeDelta };
    }
  }

  return moveRectOnAxis(rect, axis, delta);
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
  activeEdges?: SnapResizableEdges,
): AxisSnapCandidate | null {
  let best: AxisSnapCandidate | null = null;
  const movingAnchors = getMovingAxisAnchors(moving, axis, activeEdges);

  for (const peer of peers) {
    if (peer.id === moving.id) continue;
    const peerAnchors = getAxisAnchors(peer, axis);

    for (const movingAnchor of movingAnchors) {
      for (const peerAnchor of peerAnchors) {
        const delta = peerAnchor.value - movingAnchor.value;
        const distance = Math.abs(delta);
        if (distance > threshold) continue;
        if (best && distance >= best.distance) continue;

        const guideKind = resolveGuideKind(movingAnchor, peerAnchor);
        const snappedRect = resizeRectOnAxis(
          moving,
          axis,
          delta,
          movingAnchor.kind,
          activeEdges,
        );

        best = {
          axis,
          value: peerAnchor.value,
          delta,
          distance,
          peer,
          movingAnchor,
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
  const xCandidate = getBestAxisCandidate(
    moving,
    peers,
    "x",
    threshold,
    options.activeEdges,
  );
  const afterX = xCandidate
    ? resizeRectOnAxis(
        moving,
        "x",
        xCandidate.delta,
        xCandidate.movingAnchor.kind,
        options.activeEdges,
      )
    : moving;
  const yCandidate = getBestAxisCandidate(
    afterX,
    peers,
    "y",
    threshold,
    options.activeEdges,
  );
  const snappedRect = yCandidate
    ? resizeRectOnAxis(
        afterX,
        "y",
        yCandidate.delta,
        yCandidate.movingAnchor.kind,
        options.activeEdges,
      )
    : afterX;
  const guides = [xCandidate?.guide, yCandidate?.guide].filter(
    (guide): guide is SnapGuide => guide != null,
  );

  return {
    rect: snappedRect,
    guides,
    snapped: guides.length > 0,
  };
}
