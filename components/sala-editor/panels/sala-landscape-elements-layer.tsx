"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type {
  LandscapeElement,
  LandscapeElementDraft,
  LandscapeElementKind,
} from "@/lib/sala-editor/landscape/landscape-element";
import {
  LANDSCAPE_ELEMENT_DEFAULT_SIZE,
  isResizableLandscapeElementKind,
} from "@/lib/sala-editor/landscape/landscape-element";
import { getLandscapeToolboxItem } from "@/lib/sala-editor/catalog/landscape-toolbox";
import type { SurfaceEditOutcome, SurfaceResizeHandle } from "@/lib/sala-editor/surface/surface-interaction";
import { clientToStagePoint } from "@/lib/sala-editor/canvas/canvas-viewport";
import { unscaleEditorPoint } from "@/lib/sala-editor/canvas/editor-visual-scale";
import { useCanvasViewport } from "@/components/sala-editor/canvas/canvas-viewport-context";
import { SalaSmartSnapGuidesLayer } from "@/components/sala-editor/panels/sala-smart-snap-guides-layer";
import { SalaEditorCanvasToolHint } from "@/components/sala-editor/sala-editor-canvas-tool-hint";
import {
  SNAP_DISTANCE_PX,
  snapRectToPeers,
  type SnapGuide,
  type SnapRect,
  type SnapResizableEdges,
} from "@/lib/sala-editor/snap";

export type SalaLandscapeElementsLayerProps = {
  espacioId: string;
  gridSize: number;
  activeLandscapeKind?: LandscapeElementKind | null;
  landscapeElements: readonly LandscapeElement[];
  selectedLandscapeElementId?: string | null;
  onCreateLandscapeElement?: (draft: LandscapeElementDraft) => void;
  onSelectLandscapeElement?: (elementId: string | null) => void;
  onClearLandscapeSelection?: () => void;
  onUpdateLandscapeElement?: (
    elementId: string,
    patch: Partial<Omit<LandscapeElement, "id">>,
  ) => void;
  onMoveStart?: () => void;
  onMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onResizeStart?: () => void;
  onResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  readOnly?: boolean;
};

type LandscapeRect = Pick<LandscapeElement, "x" | "y" | "width" | "height">;

type LandscapeMoveSession = {
  objectId: string;
  originPointer: { x: number; y: number };
  originObject: LandscapeElement;
  active: boolean;
};

type LandscapeResizeSession = LandscapeMoveSession & {
  resizeHandle: SurfaceResizeHandle;
};

const LANDSCAPE_RESIZE_HANDLES: readonly SurfaceResizeHandle[] = [
  "nw",
  "ne",
  "sw",
  "se",
];

const LANDSCAPE_MIN_SIZE = 20;
const PROPORTIONAL_LANDSCAPE_SIZE_LIMITS = {
  roundPlanter: { min: 64, max: 320 },
  palm: { min: 72, max: 320 },
  olive: { min: 72, max: 320 },
} as const;

type ProportionalLandscapeElementKind = keyof typeof PROPORTIONAL_LANDSCAPE_SIZE_LIMITS;

function isProportionalLandscapeElementKind(
  kind: LandscapeElementKind,
): kind is ProportionalLandscapeElementKind {
  return kind === "roundPlanter" || kind === "palm" || kind === "olive";
}

const RECTANGULAR_PLANTER_FLOWERS = [
  { x: 44, y: 23, scale: 1 },
  { x: 83, y: 31, scale: 0.9, white: true },
  { x: 119, y: 21, scale: 0.78 },
] as const;

const ROUND_PLANTER_FLOWERS = [
  { x: 31, y: 39, scale: 1 },
  { x: 67, y: 60, scale: 0.9, white: true },
  { x: 82, y: 33, scale: 0.78 },
] as const;

function PlanterFlowers({ rectangular = false }: { rectangular?: boolean }) {
  const positions = rectangular ? RECTANGULAR_PLANTER_FLOWERS : ROUND_PLANTER_FLOWERS;

  return (
    <g className="hostly-sala-landscape-art__flowers">
      {positions.map((flower) => (
        <g
          key={`${flower.x}-${flower.y}`}
          className={"white" in flower && flower.white ? "is-white" : undefined}
          transform={`translate(${flower.x} ${flower.y}) scale(${flower.scale})`}
        >
          <ellipse cx="-2.2" cy="0" rx="2.6" ry="1.5" />
          <ellipse cx="2.2" cy="0" rx="2.6" ry="1.5" />
          <ellipse cx="0" cy="-2.1" rx="1.5" ry="2.5" />
          <ellipse cx="0" cy="2.1" rx="1.5" ry="2.5" />
          <circle r="1.1" />
        </g>
      ))}
    </g>
  );
}

function LandscapeElementArtwork({ kind }: { kind: LandscapeElementKind }) {
  if (kind === "palm") {
    return (
      <svg className="hostly-sala-landscape-art hostly-sala-landscape-art--palm" viewBox="0 0 100 100" aria-hidden>
        <ellipse className="hostly-sala-landscape-art__shadow" cx="55" cy="58" rx="35" ry="27" />
        <g className="hostly-sala-landscape-art__palm-fronds">
          <path d="M50 50C47 35 45 18 49 4C53 19 54 36 50 50Z" />
          <path d="M51 50C56 34 66 17 82 10C73 24 65 42 51 50Z" />
          <path d="M52 51C69 44 86 42 97 47C82 49 67 54 52 51Z" />
          <path d="M51 52C65 58 77 70 78 86C69 72 59 62 51 52Z" />
          <path d="M49 52C51 69 47 86 38 97C43 80 41 64 49 52Z" />
          <path d="M48 51C35 60 18 65 4 59C20 58 35 54 48 51Z" />
          <path d="M49 49C34 47 20 39 14 24C27 36 40 38 49 49Z" />
          <path className="is-short" d="M51 49C58 40 68 34 77 35C68 39 62 47 51 49Z" />
        </g>
        <g className="hostly-sala-landscape-art__palm-veins">
          <path d="M50 50L47 9M51 50L76 14M52 51L91 46M51 52L78 78M49 52L42 91M48 51L10 59M49 49L19 27" />
        </g>
        <circle className="hostly-sala-landscape-art__trunk-ring" cx="50" cy="51" r="7" />
        <circle className="hostly-sala-landscape-art__trunk" cx="50" cy="51" r="4.3" />
      </svg>
    );
  }

  if (kind === "olive") {
    return (
      <svg className="hostly-sala-landscape-art hostly-sala-landscape-art--olive" viewBox="0 0 100 100" aria-hidden>
        <path className="hostly-sala-landscape-art__shadow" d="M17 58C16 37 31 16 53 14C77 12 91 30 88 54C86 77 68 90 45 87C26 85 13 75 17 58Z" />
        <g className="hostly-sala-landscape-art__olive-branches">
          <path d="M50 54L34 35M50 54L63 29M50 54L72 57M50 54L38 72M50 54L61 76" />
        </g>
        <g className="hostly-sala-landscape-art__olive-clusters">
          <g><ellipse cx="24" cy="31" rx="9" ry="5.5" transform="rotate(-28 24 31)" /><ellipse cx="34" cy="25" rx="8" ry="5" transform="rotate(18 34 25)" /><ellipse cx="32" cy="38" rx="8" ry="5" transform="rotate(-8 32 38)" /></g>
          <g><ellipse cx="45" cy="17" rx="8.5" ry="5" transform="rotate(-16 45 17)" /><ellipse cx="56" cy="22" rx="9" ry="5.5" transform="rotate(24 56 22)" /><ellipse cx="44" cy="28" rx="7.5" ry="4.8" transform="rotate(11 44 28)" /></g>
          <g><ellipse cx="69" cy="27" rx="9" ry="5.5" transform="rotate(19 69 27)" /><ellipse cx="78" cy="36" rx="8.5" ry="5" transform="rotate(-22 78 36)" /><ellipse cx="65" cy="38" rx="8" ry="4.8" transform="rotate(-5 65 38)" /></g>
          <g><ellipse cx="80" cy="52" rx="9" ry="5.5" transform="rotate(12 80 52)" /><ellipse cx="80" cy="64" rx="8" ry="5" transform="rotate(-25 80 64)" /><ellipse cx="69" cy="58" rx="7.5" ry="4.7" transform="rotate(17 69 58)" /></g>
          <g><ellipse cx="66" cy="74" rx="9" ry="5.5" transform="rotate(26 66 74)" /><ellipse cx="55" cy="82" rx="8.5" ry="5" transform="rotate(-13 55 82)" /><ellipse cx="53" cy="70" rx="7.5" ry="4.8" transform="rotate(8 53 70)" /></g>
          <g><ellipse cx="34" cy="75" rx="9" ry="5.5" transform="rotate(-24 34 75)" /><ellipse cx="23" cy="67" rx="8" ry="5" transform="rotate(18 23 67)" /><ellipse cx="37" cy="63" rx="7.5" ry="4.7" transform="rotate(-5 37 63)" /></g>
          <g className="is-inner"><ellipse cx="45" cy="46" rx="7.5" ry="4.7" transform="rotate(20 45 46)" /><ellipse cx="57" cy="49" rx="8" ry="5" transform="rotate(-19 57 49)" /><ellipse cx="48" cy="58" rx="7" ry="4.5" transform="rotate(6 48 58)" /></g>
        </g>
        <circle className="hostly-sala-landscape-art__trunk-ring" cx="50" cy="55" r="6.5" />
        <circle className="hostly-sala-landscape-art__trunk" cx="50" cy="55" r="3.6" />
      </svg>
    );
  }

  if (kind === "roundPlanter") {
    return (
      <svg className="hostly-sala-landscape-art hostly-sala-landscape-art--round-planter" viewBox="0 0 100 100" aria-hidden>
        <circle className="hostly-sala-landscape-art__planter-shadow" cx="53" cy="55" r="42" />
        <circle className="hostly-sala-landscape-art__planter-shell" cx="50" cy="50" r="43" />
        <circle className="hostly-sala-landscape-art__planter-rim" cx="50" cy="50" r="35" />
        <circle className="hostly-sala-landscape-art__soil" cx="50" cy="50" r="29" />
        <g className="hostly-sala-landscape-art__planter-leaves">
          <ellipse cx="38" cy="40" rx="13" ry="9" transform="rotate(-28 38 40)" />
          <ellipse cx="60" cy="37" rx="14" ry="9" transform="rotate(24 60 37)" />
          <ellipse cx="64" cy="59" rx="14" ry="9" transform="rotate(-18 64 59)" />
          <ellipse cx="40" cy="63" rx="13" ry="9" transform="rotate(20 40 63)" />
          <ellipse className="is-light" cx="50" cy="50" rx="12" ry="10" />
        </g>
        <PlanterFlowers />
      </svg>
    );
  }

  return (
    <svg className="hostly-sala-landscape-art hostly-sala-landscape-art--rect-planter" viewBox="0 0 152 50" preserveAspectRatio="none" aria-hidden>
      <rect className="hostly-sala-landscape-art__planter-shadow" x="4" y="7" width="145" height="41" rx="8" />
      <rect className="hostly-sala-landscape-art__planter-shell" x="2" y="3" width="145" height="41" rx="7" />
      <rect className="hostly-sala-landscape-art__planter-rim" x="9" y="9" width="131" height="29" rx="5" />
      <rect className="hostly-sala-landscape-art__soil" x="15" y="14" width="119" height="19" rx="4" />
      <g className="hostly-sala-landscape-art__planter-leaves">
        <ellipse cx="30" cy="23" rx="16" ry="11" transform="rotate(-8 30 23)" />
        <ellipse className="is-light" cx="61" cy="22" rx="18" ry="11" transform="rotate(8 61 22)" />
        <ellipse cx="94" cy="25" rx="17" ry="11" transform="rotate(-7 94 25)" />
        <ellipse className="is-dark" cx="123" cy="21" rx="15" ry="10" transform="rotate(11 123 21)" />
      </g>
      <PlanterFlowers rectangular />
    </svg>
  );
}

function snapPoint(point: { x: number; y: number }, gridSize: number) {
  if (gridSize <= 0) return point;
  const offset = gridSize / 2;
  return {
    x: Math.round((point.x - offset) / gridSize) * gridSize + offset,
    y: Math.round((point.y - offset) / gridSize) * gridSize + offset,
  };
}

function landscapeElementToSnapRect(element: LandscapeElement): SnapRect {
  return {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };
}

function createSnapRect(id: string, rect: LandscapeRect): SnapRect {
  return {
    id,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function getResizeActiveEdges(handle: SurfaceResizeHandle): SnapResizableEdges {
  return {
    left: handle === "nw" || handle === "sw",
    right: handle === "ne" || handle === "se",
    top: handle === "nw" || handle === "ne",
    bottom: handle === "sw" || handle === "se",
  };
}

function isRectUsable(rect: LandscapeRect): boolean {
  return rect.width >= LANDSCAPE_MIN_SIZE && rect.height >= LANDSCAPE_MIN_SIZE;
}

function createElementStyle(
  rect: LandscapeRect,
  coordinateScale: number,
): CSSProperties {
  return {
    left: Math.round(rect.x * coordinateScale),
    top: Math.round(rect.y * coordinateScale),
    width: Math.round(rect.width * coordinateScale),
    height: Math.round(rect.height * coordinateScale),
  };
}

function translateElement(
  element: LandscapeElement,
  delta: { x: number; y: number },
  gridSize: number,
): LandscapeElement {
  const snapped = snapPoint({ x: element.x + delta.x, y: element.y + delta.y }, gridSize);
  return {
    ...element,
    x: snapped.x,
    y: snapped.y,
  };
}

function createRectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
): LandscapeRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

function resizeElement(
  element: LandscapeElement,
  handle: SurfaceResizeHandle,
  delta: { x: number; y: number },
  gridSize: number,
): LandscapeRect {
  const left = element.x;
  const top = element.y;
  const right = element.x + element.width;
  const bottom = element.y + element.height;
  const anchor =
    handle === "nw"
      ? { x: right, y: bottom }
      : handle === "ne"
        ? { x: left, y: bottom }
        : handle === "sw"
          ? { x: right, y: top }
          : { x: left, y: top };
  const dragged =
    handle === "nw"
      ? { x: left + delta.x, y: top + delta.y }
      : handle === "ne"
        ? { x: right + delta.x, y: top + delta.y }
        : handle === "sw"
          ? { x: left + delta.x, y: bottom + delta.y }
          : { x: right + delta.x, y: bottom + delta.y };
  const snappedDragged = snapPoint(dragged, gridSize);

  if (isProportionalLandscapeElementKind(element.kind)) {
    const direction = {
      x: handle === "nw" || handle === "sw" ? -1 : 1,
      y: handle === "nw" || handle === "ne" ? -1 : 1,
    };
    const originVector = {
      x: direction.x * element.width,
      y: direction.y * element.height,
    };
    const draggedVector = {
      x: snappedDragged.x - anchor.x,
      y: snappedDragged.y - anchor.y,
    };
    const originLengthSquared =
      originVector.x * originVector.x + originVector.y * originVector.y;
    const projectedScale =
      originLengthSquared > 0
        ? (draggedVector.x * originVector.x + draggedVector.y * originVector.y) /
          originLengthSquared
        : 1;
    const limits = PROPORTIONAL_LANDSCAPE_SIZE_LIMITS[element.kind];
    const minScale = Math.max(limits.min / element.width, limits.min / element.height);
    const maxScale = Math.min(limits.max / element.width, limits.max / element.height);
    const scale = Math.min(maxScale, Math.max(minScale, projectedScale));
    const width = element.width * scale;
    const height = element.height * scale;

    return {
      x: direction.x < 0 ? anchor.x - width : anchor.x,
      y: direction.y < 0 ? anchor.y - height : anchor.y,
      width,
      height,
    };
  }

  const rect = createRectFromPoints(anchor, snappedDragged);

  if (rect.width < LANDSCAPE_MIN_SIZE) {
    rect.width = LANDSCAPE_MIN_SIZE;
    if (snappedDragged.x < anchor.x) rect.x = anchor.x - LANDSCAPE_MIN_SIZE;
  }
  if (rect.height < LANDSCAPE_MIN_SIZE) {
    rect.height = LANDSCAPE_MIN_SIZE;
    if (snappedDragged.y < anchor.y) rect.y = anchor.y - LANDSCAPE_MIN_SIZE;
  }

  return rect;
}

export function SalaLandscapeElementsLayer({
  espacioId,
  gridSize,
  activeLandscapeKind = null,
  landscapeElements,
  selectedLandscapeElementId = null,
  onCreateLandscapeElement,
  onSelectLandscapeElement,
  onClearLandscapeSelection,
  onUpdateLandscapeElement,
  onMoveStart,
  onMoveEnd,
  onResizeStart,
  onResizeEnd,
  readOnly = false,
}: SalaLandscapeElementsLayerProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const hitAreaRef = useRef<HTMLDivElement>(null);
  const [moveSession, setMoveSession] = useState<LandscapeMoveSession | null>(null);
  const [resizeSession, setResizeSession] = useState<LandscapeResizeSession | null>(null);
  const moveSessionRef = useRef<LandscapeMoveSession | null>(null);
  const resizeSessionRef = useRef<LandscapeResizeSession | null>(null);
  const [smartSnapGuides, setSmartSnapGuides] = useState<SnapGuide[]>([]);
  const activeTool = !readOnly && activeLandscapeKind ? getLandscapeToolboxItem(activeLandscapeKind) : null;

  const resolveLogicalPoint = useCallback(
    (clientX: number, clientY: number) => {
      const fromViewport = canvasViewport?.resolveStagePoint(clientX, clientY);
      const displayPoint =
        fromViewport ??
        (hitAreaRef.current
          ? clientToStagePoint(hitAreaRef.current, clientX, clientY)
          : null);
      if (!displayPoint) return null;
      return snapPoint(unscaleEditorPoint(displayPoint, coordinateScale), gridSize);
    },
    [canvasViewport, coordinateScale, gridSize],
  );

  const resolveSmartSnap = useCallback(
    (elementId: string, rect: LandscapeRect, activeEdges?: SnapResizableEdges) => {
      const peers = landscapeElements
        .filter(
          (element) =>
            element.id !== elementId && element.visible !== false,
        )
        .map(landscapeElementToSnapRect);
      const result = snapRectToPeers(createSnapRect(elementId, rect), peers, {
        activeEdges,
        threshold: SNAP_DISTANCE_PX / Math.max(coordinateScale, 0.001),
      });
      if (!isRectUsable(result.rect)) return { rect, guides: [] };
      return result;
    },
    [coordinateScale, landscapeElements],
  );

  const finishMoveSession = useCallback(() => {
    const session = moveSessionRef.current;
    moveSessionRef.current = null;
    setMoveSession(null);
    setSmartSnapGuides([]);
    if (session?.active) onMoveEnd?.("complete");
  }, [onMoveEnd]);

  const cancelMoveSession = useCallback(() => {
    const session = moveSessionRef.current;
    moveSessionRef.current = null;
    setMoveSession(null);
    setSmartSnapGuides([]);
    if (session?.active) {
      onUpdateLandscapeElement?.(session.objectId, {
        x: session.originObject.x,
        y: session.originObject.y,
      });
      onMoveEnd?.("cancel");
    }
  }, [onMoveEnd, onUpdateLandscapeElement]);

  const finishResizeSession = useCallback(() => {
    const session = resizeSessionRef.current;
    resizeSessionRef.current = null;
    setResizeSession(null);
    setSmartSnapGuides([]);
    if (session?.active) onResizeEnd?.("complete");
  }, [onResizeEnd]);

  const cancelResizeSession = useCallback(() => {
    const session = resizeSessionRef.current;
    resizeSessionRef.current = null;
    setResizeSession(null);
    setSmartSnapGuides([]);
    if (session?.active) {
      onUpdateLandscapeElement?.(session.objectId, {
        x: session.originObject.x,
        y: session.originObject.y,
        width: session.originObject.width,
        height: session.originObject.height,
      });
      onResizeEnd?.("cancel");
    }
  }, [onResizeEnd, onUpdateLandscapeElement]);

  const handlePlacementPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (readOnly || event.button !== 0 || event.target !== event.currentTarget) return;
      if (!activeLandscapeKind || moveSession || resizeSession) return;
      const point = resolveLogicalPoint(event.clientX, event.clientY);
      if (!point) return;
      const size = LANDSCAPE_ELEMENT_DEFAULT_SIZE[activeLandscapeKind];
      onClearLandscapeSelection?.();
      onCreateLandscapeElement?.({
        espacioId,
        kind: activeLandscapeKind,
        x: point.x - size.width / 2,
        y: point.y - size.height / 2,
        width: size.width,
        height: size.height,
        locked: false,
        visible: true,
        metadata: {},
      });
    },
    [
      activeLandscapeKind,
      espacioId,
      moveSession,
      onClearLandscapeSelection,
      onCreateLandscapeElement,
      readOnly,
      resizeSession,
      resolveLogicalPoint,
    ],
  );

  const createMoveHandlers = useCallback(
    (element: LandscapeElement) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (readOnly || event.button !== 0) return;
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelectLandscapeElement?.(element.id);
        const session: LandscapeMoveSession = {
          objectId: element.id,
          originPointer: point,
          originObject: element,
          active: false,
        };
        moveSessionRef.current = session;
        setMoveSession(session);
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        const session = moveSessionRef.current;
        if (!session || session.objectId !== element.id) return;
        const delta = {
          x: point.x - session.originPointer.x,
          y: point.y - session.originPointer.y,
        };
        const shouldActivate =
          session.active || Math.abs(delta.x) >= 1 || Math.abs(delta.y) >= 1;
        if (!shouldActivate) return;
        if (!session.active) onMoveStart?.();
        const moved = translateElement(session.originObject, delta, gridSize);
        const snapResult = resolveSmartSnap(element.id, moved);
        onUpdateLandscapeElement?.(element.id, {
          x: snapResult.rect.x,
          y: snapResult.rect.y,
        });
        setSmartSnapGuides(snapResult.guides);
        const nextSession = { ...session, active: true };
        moveSessionRef.current = nextSession;
        setMoveSession(nextSession);
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finishMoveSession();
      },
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        cancelMoveSession();
      },
    }),
    [
      cancelMoveSession,
      finishMoveSession,
      gridSize,
      onMoveStart,
      onSelectLandscapeElement,
      onUpdateLandscapeElement,
      readOnly,
      resolveLogicalPoint,
      resolveSmartSnap,
    ],
  );

  const createResizeHandlers = useCallback(
    (element: LandscapeElement, handle: SurfaceResizeHandle) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (readOnly || event.button !== 0) return;
        if (!isResizableLandscapeElementKind(element.kind)) return;
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelectLandscapeElement?.(element.id);
        const session: LandscapeResizeSession = {
          objectId: element.id,
          resizeHandle: handle,
          originPointer: point,
          originObject: element,
          active: false,
        };
        resizeSessionRef.current = session;
        setResizeSession(session);
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const point = resolveLogicalPoint(event.clientX, event.clientY);
        if (!point) return;
        const session = resizeSessionRef.current;
        if (!session || session.objectId !== element.id) return;
        const delta = {
          x: point.x - session.originPointer.x,
          y: point.y - session.originPointer.y,
        };
        const shouldActivate =
          session.active || Math.abs(delta.x) >= 1 || Math.abs(delta.y) >= 1;
        if (!shouldActivate) return;
        if (!session.active) onResizeStart?.();
        const resized = resizeElement(
          session.originObject,
          session.resizeHandle,
          delta,
          gridSize,
        );
        const proportional = isProportionalLandscapeElementKind(element.kind);
        const snapResult = proportional
          ? { rect: resized, guides: [] }
          : resolveSmartSnap(
              element.id,
              resized,
              getResizeActiveEdges(session.resizeHandle),
            );
        onUpdateLandscapeElement?.(element.id, {
          x: snapResult.rect.x,
          y: snapResult.rect.y,
          width: snapResult.rect.width,
          height: snapResult.rect.height,
        });
        setSmartSnapGuides(snapResult.guides);
        const nextSession = { ...session, active: true };
        resizeSessionRef.current = nextSession;
        setResizeSession(nextSession);
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finishResizeSession();
      },
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        cancelResizeSession();
      },
    }),
    [
      cancelResizeSession,
      finishResizeSession,
      gridSize,
      onResizeStart,
      onSelectLandscapeElement,
      onUpdateLandscapeElement,
      readOnly,
      resolveLogicalPoint,
      resolveSmartSnap,
    ],
  );

  useEffect(() => {
    if (readOnly) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (moveSession) {
        event.preventDefault();
        cancelMoveSession();
        return;
      }
      if (resizeSession) {
        event.preventDefault();
        cancelResizeSession();
        return;
      }
      if (selectedLandscapeElementId) {
        event.preventDefault();
        onClearLandscapeSelection?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cancelMoveSession,
    cancelResizeSession,
    moveSession,
    onClearLandscapeSelection,
    readOnly,
    resizeSession,
    selectedLandscapeElementId,
  ]);

  const renderedElements = useMemo(
    () => landscapeElements.filter((element) => element.visible !== false),
    [landscapeElements],
  );

  return (
    <>
      <div className="hostly-sala-landscape-elements">
        {renderedElements.map((element) => {
          const selected =
            !readOnly && element.id === selectedLandscapeElementId;
          const dragging =
            !readOnly && moveSession?.objectId === element.id && moveSession.active;
          const resizing =
            !readOnly &&
            resizeSession?.objectId === element.id &&
            resizeSession.active;
          const handlers = !readOnly ? createMoveHandlers(element) : undefined;
          const resizable = isResizableLandscapeElementKind(element.kind);

          return (
            <div
              key={element.id}
              className="hostly-sala-landscape-element-wrap"
              style={createElementStyle(element, coordinateScale)}
            >
              <button
                type="button"
                className={[
                  "hostly-sala-landscape-element",
                  `hostly-sala-landscape-element--${element.kind}`,
                  selected ? "is-selected" : "",
                  dragging ? "is-dragging" : "",
                  resizing ? "is-resizing" : "",
                  readOnly ? "is-readonly" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={getLandscapeToolboxItem(element.kind)?.label ?? "Ambiente"}
                tabIndex={readOnly ? -1 : 0}
                onClick={
                  readOnly
                    ? undefined
                    : () => onSelectLandscapeElement?.(element.id)
                }
                {...handlers}
              >
                <LandscapeElementArtwork kind={element.kind} />
              </button>
              {selected && resizable
                ? LANDSCAPE_RESIZE_HANDLES.map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      className={[
                        "hostly-sala-landscape-element__resize-handle",
                        `hostly-sala-landscape-element__resize-handle--${handle}`,
                      ].join(" ")}
                      aria-label={`Redimensionar elemento Landscape ${handle}`}
                      title="Redimensionar"
                      {...createResizeHandlers(element, handle)}
                    />
                  ))
                : null}
            </div>
          );
        })}
      </div>
      {!readOnly ? (
        <>
          <SalaSmartSnapGuidesLayer
            guides={smartSnapGuides}
            coordinateScale={coordinateScale}
          />
          <div
            ref={hitAreaRef}
            className={[
              "hostly-sala-landscape-placement-hit-area",
              activeLandscapeKind ? "is-creating" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={activeTool ? { cursor: "crosshair" } : undefined}
            onPointerDown={handlePlacementPointerDown}
          />
          {activeTool ? (
            <SalaEditorCanvasToolHint icon={activeTool.icon} text={activeTool.workspaceHint} />
          ) : null}
        </>
      ) : null}
    </>
  );
}
