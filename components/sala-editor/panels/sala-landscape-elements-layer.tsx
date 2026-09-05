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
  onUpdateLandscapeElement?: (elementId: string, patch: Partial<Omit<LandscapeElement, "id">>) => void;
  onMoveStart?: () => void;
  onMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onResizeStart?: () => void;
  onResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  readOnly?: boolean;
};

type LandscapeRect = Pick<LandscapeElement, "x" | "y" | "width" | "height">;
type LandscapeMoveSession = { objectId: string; originPointer: { x: number; y: number }; originObject: LandscapeElement; active: boolean };
type LandscapeResizeSession = LandscapeMoveSession & { resizeHandle: SurfaceResizeHandle };

const LANDSCAPE_RESIZE_HANDLES: readonly SurfaceResizeHandle[] = ["nw", "ne", "sw", "se"];
const LANDSCAPE_MIN_SIZE = 20;
const PROPORTIONAL_LANDSCAPE_SIZE_LIMITS = {
  roundPlanter: { min: 64, max: 320 },
  palm: { min: 72, max: 320 },
  olive: { min: 72, max: 320 },
  tree: { min: 72, max: 360 },
  shrub: { min: 56, max: 280 },
  flowers: { min: 56, max: 280 },
  rock: { min: 48, max: 260 },
  fountain: { min: 64, max: 320 },
} as const;
type ProportionalLandscapeElementKind = keyof typeof PROPORTIONAL_LANDSCAPE_SIZE_LIMITS;

function isProportionalLandscapeElementKind(kind: LandscapeElementKind): kind is ProportionalLandscapeElementKind {
  return kind in PROPORTIONAL_LANDSCAPE_SIZE_LIMITS;
}

function PlanterFlowers({ rectangular = false }: { rectangular?: boolean }) {
  const positions = rectangular
    ? [{ x: 44, y: 23 }, { x: 83, y: 31 }, { x: 119, y: 21 }]
    : [{ x: 31, y: 39 }, { x: 67, y: 60 }, { x: 82, y: 33 }];
  return (
    <g className="hostly-sala-landscape-art__flowers">
      {positions.map((flower) => (
        <g key={`${flower.x}-${flower.y}`} transform={`translate(${flower.x} ${flower.y})`}>
          <ellipse cx="-2.2" cy="0" rx="2.6" ry="1.5" /><ellipse cx="2.2" cy="0" rx="2.6" ry="1.5" />
          <ellipse cx="0" cy="-2.1" rx="1.5" ry="2.5" /><ellipse cx="0" cy="2.1" rx="1.5" ry="2.5" /><circle r="1.1" />
        </g>
      ))}
    </g>
  );
}

function LandscapeElementArtwork({ kind }: { kind: LandscapeElementKind }) {
  if (kind === "palm") return (
    <svg className="hostly-sala-landscape-art hostly-sala-landscape-art--palm" viewBox="0 0 100 100" aria-hidden>
      <ellipse className="hostly-sala-landscape-art__shadow" cx="55" cy="58" rx="35" ry="27" />
      <g className="hostly-sala-landscape-art__palm-fronds">
        <path d="M50 50C47 35 45 18 49 4C53 19 54 36 50 50Z" /><path d="M51 50C56 34 66 17 82 10C73 24 65 42 51 50Z" />
        <path d="M52 51C69 44 86 42 97 47C82 49 67 54 52 51Z" /><path d="M51 52C65 58 77 70 78 86C69 72 59 62 51 52Z" />
        <path d="M49 52C51 69 47 86 38 97C43 80 41 64 49 52Z" /><path d="M48 51C35 60 18 65 4 59C20 58 35 54 48 51Z" />
        <path d="M49 49C34 47 20 39 14 24C27 36 40 38 49 49Z" />
      </g>
      <circle className="hostly-sala-landscape-art__trunk-ring" cx="50" cy="51" r="7" /><circle className="hostly-sala-landscape-art__trunk" cx="50" cy="51" r="4.3" />
    </svg>
  );

  if (kind === "olive") return (
    <svg className="hostly-sala-landscape-art hostly-sala-landscape-art--olive" viewBox="0 0 100 100" aria-hidden>
      <path className="hostly-sala-landscape-art__shadow" d="M17 58C16 37 31 16 53 14C77 12 91 30 88 54C86 77 68 90 45 87C26 85 13 75 17 58Z" />
      <g className="hostly-sala-landscape-art__olive-branches"><path d="M50 54L34 35M50 54L63 29M50 54L72 57M50 54L38 72M50 54L61 76" /></g>
      <g className="hostly-sala-landscape-art__olive-clusters">
        <ellipse cx="27" cy="31" rx="15" ry="10" /><ellipse cx="50" cy="22" rx="17" ry="11" /><ellipse cx="73" cy="34" rx="16" ry="11" />
        <ellipse cx="76" cy="59" rx="16" ry="11" /><ellipse cx="57" cy="76" rx="17" ry="11" /><ellipse cx="32" cy="70" rx="16" ry="11" /><ellipse cx="49" cy="51" rx="18" ry="13" />
      </g>
      <circle className="hostly-sala-landscape-art__trunk-ring" cx="50" cy="55" r="6.5" /><circle className="hostly-sala-landscape-art__trunk" cx="50" cy="55" r="3.6" />
    </svg>
  );

  if (kind === "tree") return (
    <svg className="hostly-sala-landscape-art" viewBox="0 0 100 100" aria-hidden>
      <ellipse cx="52" cy="57" rx="38" ry="34" fill="#dcefe0" stroke="#91b99a" strokeWidth="2" />
      <circle cx="35" cy="43" r="19" fill="#7cab78" /><circle cx="57" cy="34" r="22" fill="#8cbb83" /><circle cx="70" cy="55" r="20" fill="#6f9f70" /><circle cx="43" cy="66" r="21" fill="#78aa74" />
      <path d="M50 58L50 79M50 60L36 45M50 60L66 45" stroke="#80634e" strokeWidth="5" strokeLinecap="round" />
      <circle cx="50" cy="60" r="5" fill="#6d513f" />
    </svg>
  );

  if (kind === "shrub") return (
    <svg className="hostly-sala-landscape-art" viewBox="0 0 100 80" aria-hidden>
      <ellipse cx="50" cy="53" rx="43" ry="23" fill="#dcecdf" />
      <circle cx="28" cy="45" r="22" fill="#78a879" /><circle cx="51" cy="37" r="25" fill="#89b586" /><circle cx="73" cy="47" r="20" fill="#6e9e70" />
      <circle cx="46" cy="58" r="19" fill="#7fab7c" />
    </svg>
  );

  if (kind === "hedge") return (
    <svg className="hostly-sala-landscape-art" viewBox="0 0 160 50" preserveAspectRatio="none" aria-hidden>
      <rect x="3" y="11" width="154" height="35" rx="16" fill="#dcecdf" />
      <rect x="5" y="5" width="150" height="36" rx="14" fill="#6e9e70" stroke="#547f5a" strokeWidth="2" />
      <path d="M16 25C29 10 39 39 53 22S78 35 91 19 114 37 143 18" fill="none" stroke="#8fbd87" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );

  if (kind === "flowers") return (
    <svg className="hostly-sala-landscape-art" viewBox="0 0 120 70" aria-hidden>
      <ellipse cx="60" cy="48" rx="52" ry="18" fill="#dcecdf" />
      <g fill="#76a977"><ellipse cx="28" cy="40" rx="18" ry="13" /><ellipse cx="56" cy="36" rx="21" ry="15" /><ellipse cx="88" cy="42" rx="19" ry="13" /></g>
      <g fill="#d98b9d"><circle cx="28" cy="29" r="6" /><circle cx="58" cy="24" r="7" /><circle cx="88" cy="33" r="6" /></g>
      <g fill="#f3d47a"><circle cx="39" cy="45" r="5" /><circle cx="73" cy="43" r="5" /><circle cx="101" cy="45" r="4" /></g>
      <g fill="#f7f4ec"><circle cx="19" cy="46" r="4" /><circle cx="49" cy="49" r="5" /><circle cx="80" cy="52" r="4" /></g>
    </svg>
  );

  if (kind === "rock") return (
    <svg className="hostly-sala-landscape-art" viewBox="0 0 100 80" aria-hidden>
      <ellipse cx="53" cy="64" rx="39" ry="10" fill="#d7d4cf" />
      <path d="M14 58L25 28L46 14L74 23L89 52L76 66L34 68Z" fill="#a9a59d" stroke="#858179" strokeWidth="2" />
      <path d="M25 28L49 39L74 23M49 39L76 66M49 39L34 68" fill="none" stroke="#c8c4bc" strokeWidth="2" />
    </svg>
  );

  if (kind === "fountain") return (
    <svg className="hostly-sala-landscape-art" viewBox="0 0 100 100" aria-hidden>
      <circle cx="52" cy="54" r="42" fill="#dbeaf0" stroke="#88aebc" strokeWidth="3" />
      <circle cx="50" cy="50" r="34" fill="#9ed2e0" stroke="#eff8fb" strokeWidth="4" />
      <circle cx="50" cy="50" r="10" fill="#d8e1e4" stroke="#829aa3" strokeWidth="2" />
      <path d="M50 47C43 37 46 26 50 19C54 27 57 38 50 47ZM45 52C34 48 27 42 23 36C33 36 43 41 45 52ZM55 52C65 46 74 42 82 43C75 51 65 56 55 52Z" fill="#eaf9ff" stroke="#6eb6cc" strokeWidth="2" />
    </svg>
  );

  if (kind === "roundPlanter") return (
    <svg className="hostly-sala-landscape-art hostly-sala-landscape-art--round-planter" viewBox="0 0 100 100" aria-hidden>
      <circle className="hostly-sala-landscape-art__planter-shadow" cx="53" cy="55" r="42" /><circle className="hostly-sala-landscape-art__planter-shell" cx="50" cy="50" r="43" />
      <circle className="hostly-sala-landscape-art__planter-rim" cx="50" cy="50" r="35" /><circle className="hostly-sala-landscape-art__soil" cx="50" cy="50" r="29" />
      <g className="hostly-sala-landscape-art__planter-leaves"><ellipse cx="38" cy="40" rx="13" ry="9" /><ellipse cx="60" cy="37" rx="14" ry="9" /><ellipse cx="64" cy="59" rx="14" ry="9" /><ellipse cx="40" cy="63" rx="13" ry="9" /></g><PlanterFlowers />
    </svg>
  );

  return (
    <svg className="hostly-sala-landscape-art hostly-sala-landscape-art--rect-planter" viewBox="0 0 152 50" preserveAspectRatio="none" aria-hidden>
      <rect className="hostly-sala-landscape-art__planter-shadow" x="4" y="7" width="145" height="41" rx="8" /><rect className="hostly-sala-landscape-art__planter-shell" x="2" y="3" width="145" height="41" rx="7" />
      <rect className="hostly-sala-landscape-art__planter-rim" x="9" y="9" width="131" height="29" rx="5" /><rect className="hostly-sala-landscape-art__soil" x="15" y="14" width="119" height="19" rx="4" />
      <g className="hostly-sala-landscape-art__planter-leaves"><ellipse cx="30" cy="23" rx="16" ry="11" /><ellipse cx="61" cy="22" rx="18" ry="11" /><ellipse cx="94" cy="25" rx="17" ry="11" /><ellipse cx="123" cy="21" rx="15" ry="10" /></g><PlanterFlowers rectangular />
    </svg>
  );
}

function snapPoint(point: { x: number; y: number }, gridSize: number) {
  if (gridSize <= 0) return point;
  const offset = gridSize / 2;
  return { x: Math.round((point.x - offset) / gridSize) * gridSize + offset, y: Math.round((point.y - offset) / gridSize) * gridSize + offset };
}
function landscapeElementToSnapRect(element: LandscapeElement): SnapRect { return { id: element.id, x: element.x, y: element.y, width: element.width, height: element.height }; }
function createSnapRect(id: string, rect: LandscapeRect): SnapRect { return { id, ...rect }; }
function getResizeActiveEdges(handle: SurfaceResizeHandle): SnapResizableEdges { return { left: handle === "nw" || handle === "sw", right: handle === "ne" || handle === "se", top: handle === "nw" || handle === "ne", bottom: handle === "sw" || handle === "se" }; }
function isRectUsable(rect: LandscapeRect) { return rect.width >= LANDSCAPE_MIN_SIZE && rect.height >= LANDSCAPE_MIN_SIZE; }
function createElementStyle(rect: LandscapeRect, coordinateScale: number): CSSProperties { return { left: Math.round(rect.x * coordinateScale), top: Math.round(rect.y * coordinateScale), width: Math.round(rect.width * coordinateScale), height: Math.round(rect.height * coordinateScale) }; }
function translateElement(element: LandscapeElement, delta: { x: number; y: number }, gridSize: number): LandscapeElement { const snapped = snapPoint({ x: element.x + delta.x, y: element.y + delta.y }, gridSize); return { ...element, x: snapped.x, y: snapped.y }; }
function createRectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): LandscapeRect { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }; }

function resizeElement(element: LandscapeElement, handle: SurfaceResizeHandle, delta: { x: number; y: number }, gridSize: number): LandscapeRect {
  const left = element.x, top = element.y, right = element.x + element.width, bottom = element.y + element.height;
  const anchor = handle === "nw" ? { x: right, y: bottom } : handle === "ne" ? { x: left, y: bottom } : handle === "sw" ? { x: right, y: top } : { x: left, y: top };
  const dragged = handle === "nw" ? { x: left + delta.x, y: top + delta.y } : handle === "ne" ? { x: right + delta.x, y: top + delta.y } : handle === "sw" ? { x: left + delta.x, y: bottom + delta.y } : { x: right + delta.x, y: bottom + delta.y };
  const snappedDragged = snapPoint(dragged, gridSize);
  if (isProportionalLandscapeElementKind(element.kind)) {
    const direction = { x: handle === "nw" || handle === "sw" ? -1 : 1, y: handle === "nw" || handle === "ne" ? -1 : 1 };
    const originVector = { x: direction.x * element.width, y: direction.y * element.height };
    const draggedVector = { x: snappedDragged.x - anchor.x, y: snappedDragged.y - anchor.y };
    const originLengthSquared = originVector.x ** 2 + originVector.y ** 2;
    const projectedScale = originLengthSquared > 0 ? (draggedVector.x * originVector.x + draggedVector.y * originVector.y) / originLengthSquared : 1;
    const limits = PROPORTIONAL_LANDSCAPE_SIZE_LIMITS[element.kind];
    const minScale = Math.max(limits.min / element.width, limits.min / element.height);
    const maxScale = Math.min(limits.max / element.width, limits.max / element.height);
    const scale = Math.min(maxScale, Math.max(minScale, projectedScale));
    const width = element.width * scale, height = element.height * scale;
    return { x: direction.x < 0 ? anchor.x - width : anchor.x, y: direction.y < 0 ? anchor.y - height : anchor.y, width, height };
  }
  const rect = createRectFromPoints(anchor, snappedDragged);
  if (rect.width < LANDSCAPE_MIN_SIZE) { rect.width = LANDSCAPE_MIN_SIZE; if (snappedDragged.x < anchor.x) rect.x = anchor.x - LANDSCAPE_MIN_SIZE; }
  if (rect.height < LANDSCAPE_MIN_SIZE) { rect.height = LANDSCAPE_MIN_SIZE; if (snappedDragged.y < anchor.y) rect.y = anchor.y - LANDSCAPE_MIN_SIZE; }
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

  const resolveLogicalPoint = useCallback((clientX: number, clientY: number) => {
    const fromViewport = canvasViewport?.resolveStagePoint(clientX, clientY);
    const displayPoint = fromViewport ?? (hitAreaRef.current ? clientToStagePoint(hitAreaRef.current, clientX, clientY) : null);
    if (!displayPoint) return null;
    return snapPoint(unscaleEditorPoint(displayPoint, coordinateScale), gridSize);
  }, [canvasViewport, coordinateScale, gridSize]);

  const resolveSmartSnap = useCallback((elementId: string, rect: LandscapeRect, activeEdges?: SnapResizableEdges) => {
    const peers = landscapeElements.filter((element) => element.id !== elementId && element.visible !== false).map(landscapeElementToSnapRect);
    const result = snapRectToPeers(createSnapRect(elementId, rect), peers, { activeEdges, threshold: SNAP_DISTANCE_PX / Math.max(coordinateScale, 0.001) });
    return isRectUsable(result.rect) ? result : { rect, guides: [] };
  }, [coordinateScale, landscapeElements]);

  const finishMoveSession = useCallback(() => { const session = moveSessionRef.current; moveSessionRef.current = null; setMoveSession(null); setSmartSnapGuides([]); if (session?.active) onMoveEnd?.("complete"); }, [onMoveEnd]);
  const cancelMoveSession = useCallback(() => { const session = moveSessionRef.current; moveSessionRef.current = null; setMoveSession(null); setSmartSnapGuides([]); if (session?.active) { onUpdateLandscapeElement?.(session.objectId, { x: session.originObject.x, y: session.originObject.y }); onMoveEnd?.("cancel"); } }, [onMoveEnd, onUpdateLandscapeElement]);
  const finishResizeSession = useCallback(() => { const session = resizeSessionRef.current; resizeSessionRef.current = null; setResizeSession(null); setSmartSnapGuides([]); if (session?.active) onResizeEnd?.("complete"); }, [onResizeEnd]);
  const cancelResizeSession = useCallback(() => { const session = resizeSessionRef.current; resizeSessionRef.current = null; setResizeSession(null); setSmartSnapGuides([]); if (session?.active) { onUpdateLandscapeElement?.(session.objectId, { x: session.originObject.x, y: session.originObject.y, width: session.originObject.width, height: session.originObject.height }); onResizeEnd?.("cancel"); } }, [onResizeEnd, onUpdateLandscapeElement]);

  const handlePlacementPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (readOnly || event.button !== 0 || event.target !== event.currentTarget || !activeLandscapeKind || moveSession || resizeSession) return;
    const point = resolveLogicalPoint(event.clientX, event.clientY); if (!point) return;
    const size = LANDSCAPE_ELEMENT_DEFAULT_SIZE[activeLandscapeKind];
    onClearLandscapeSelection?.();
    onCreateLandscapeElement?.({ espacioId, kind: activeLandscapeKind, x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height, locked: false, visible: true, metadata: {} });
  }, [activeLandscapeKind, espacioId, moveSession, onClearLandscapeSelection, onCreateLandscapeElement, readOnly, resizeSession, resolveLogicalPoint]);

  const createMoveHandlers = useCallback((element: LandscapeElement) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (readOnly || event.button !== 0) return; event.stopPropagation();
      const point = resolveLogicalPoint(event.clientX, event.clientY); if (!point) return;
      event.currentTarget.setPointerCapture(event.pointerId); onSelectLandscapeElement?.(element.id);
      const session: LandscapeMoveSession = { objectId: element.id, originPointer: point, originObject: element, active: false }; moveSessionRef.current = session; setMoveSession(session);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation(); const point = resolveLogicalPoint(event.clientX, event.clientY); const session = moveSessionRef.current;
      if (!point || !session || session.objectId !== element.id) return;
      const delta = { x: point.x - session.originPointer.x, y: point.y - session.originPointer.y }; const shouldActivate = session.active || Math.abs(delta.x) >= 1 || Math.abs(delta.y) >= 1; if (!shouldActivate) return;
      if (!session.active) onMoveStart?.(); const moved = translateElement(session.originObject, delta, gridSize); const snapResult = resolveSmartSnap(element.id, moved);
      onUpdateLandscapeElement?.(element.id, { x: snapResult.rect.x, y: snapResult.rect.y }); setSmartSnapGuides(snapResult.guides); const next = { ...session, active: true }; moveSessionRef.current = next; setMoveSession(next);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); finishMoveSession(); },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); cancelMoveSession(); },
  }), [cancelMoveSession, finishMoveSession, gridSize, onMoveStart, onSelectLandscapeElement, onUpdateLandscapeElement, readOnly, resolveLogicalPoint, resolveSmartSnap]);

  const createResizeHandlers = useCallback((element: LandscapeElement, handle: SurfaceResizeHandle) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (readOnly || event.button !== 0 || !isResizableLandscapeElementKind(element.kind)) return; event.stopPropagation(); const point = resolveLogicalPoint(event.clientX, event.clientY); if (!point) return;
      event.currentTarget.setPointerCapture(event.pointerId); onSelectLandscapeElement?.(element.id); const session: LandscapeResizeSession = { objectId: element.id, resizeHandle: handle, originPointer: point, originObject: element, active: false }; resizeSessionRef.current = session; setResizeSession(session);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation(); const point = resolveLogicalPoint(event.clientX, event.clientY); const session = resizeSessionRef.current; if (!point || !session || session.objectId !== element.id) return;
      const delta = { x: point.x - session.originPointer.x, y: point.y - session.originPointer.y }; const shouldActivate = session.active || Math.abs(delta.x) >= 1 || Math.abs(delta.y) >= 1; if (!shouldActivate) return;
      if (!session.active) onResizeStart?.(); const resized = resizeElement(session.originObject, session.resizeHandle, delta, gridSize); const proportional = isProportionalLandscapeElementKind(element.kind);
      const snapResult = proportional ? { rect: resized, guides: [] } : resolveSmartSnap(element.id, resized, getResizeActiveEdges(session.resizeHandle));
      onUpdateLandscapeElement?.(element.id, { x: snapResult.rect.x, y: snapResult.rect.y, width: snapResult.rect.width, height: snapResult.rect.height }); setSmartSnapGuides(snapResult.guides); const next = { ...session, active: true }; resizeSessionRef.current = next; setResizeSession(next);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); finishResizeSession(); },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); cancelResizeSession(); },
  }), [cancelResizeSession, finishResizeSession, gridSize, onResizeStart, onSelectLandscapeElement, onUpdateLandscapeElement, readOnly, resolveLogicalPoint, resolveSmartSnap]);

  useEffect(() => {
    if (readOnly) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (moveSession) { event.preventDefault(); cancelMoveSession(); return; }
      if (resizeSession) { event.preventDefault(); cancelResizeSession(); return; }
      if (selectedLandscapeElementId) { event.preventDefault(); onClearLandscapeSelection?.(); }
    };
    window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelMoveSession, cancelResizeSession, moveSession, onClearLandscapeSelection, readOnly, resizeSession, selectedLandscapeElementId]);

  const renderedElements = useMemo(() => landscapeElements.filter((element) => element.visible !== false), [landscapeElements]);

  return (
    <>
      <div className="hostly-sala-landscape-elements">
        {renderedElements.map((element) => {
          const selected = !readOnly && element.id === selectedLandscapeElementId;
          const dragging = !readOnly && moveSession?.objectId === element.id && moveSession.active;
          const resizing = !readOnly && resizeSession?.objectId === element.id && resizeSession.active;
          const handlers = !readOnly ? createMoveHandlers(element) : undefined;
          const resizable = isResizableLandscapeElementKind(element.kind);
          return (
            <div key={element.id} className="hostly-sala-landscape-element-wrap" style={createElementStyle(element, coordinateScale)}>
              <button
                type="button"
                className={["hostly-sala-landscape-element", `hostly-sala-landscape-element--${element.kind}`, selected ? "is-selected" : "", dragging ? "is-dragging" : "", resizing ? "is-resizing" : "", readOnly ? "is-readonly" : ""].filter(Boolean).join(" ")}
                aria-label={getLandscapeToolboxItem(element.kind)?.label ?? "Ambiente"}
                tabIndex={readOnly ? -1 : 0}
                onClick={readOnly ? undefined : () => onSelectLandscapeElement?.(element.id)}
                {...handlers}
              >
                <LandscapeElementArtwork kind={element.kind} />
              </button>
              {selected && resizable ? LANDSCAPE_RESIZE_HANDLES.map((handle) => (
                <button key={handle} type="button" className={["hostly-sala-landscape-element__resize-handle", `hostly-sala-landscape-element__resize-handle--${handle}`].join(" ")} aria-label={`Redimensionar elemento ${handle}`} title="Redimensionar" {...createResizeHandlers(element, handle)} />
              )) : null}
            </div>
          );
        })}
      </div>
      {!readOnly ? (
        <>
          <SalaSmartSnapGuidesLayer guides={smartSnapGuides} coordinateScale={coordinateScale} />
          <div ref={hitAreaRef} className={["hostly-sala-landscape-placement-hit-area", activeLandscapeKind ? "is-creating" : ""].filter(Boolean).join(" ")} style={activeTool ? { cursor: "crosshair" } : undefined} onPointerDown={handlePlacementPointerDown} />
          {activeTool ? <SalaEditorCanvasToolHint icon={activeTool.icon} text={activeTool.workspaceHint} /> : null}
        </>
      ) : null}
    </>
  );
}
